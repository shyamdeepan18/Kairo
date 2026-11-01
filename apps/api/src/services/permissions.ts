import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import {
  db,
  userRoles, rolePermissions, permissions,
  userPermissions, userPlantAccess, userWarehouseAccess, userApprovalLimits,
  users, plants,
} from '@erp/db';

/**
 * PermissionService — resolves effective permissions for a user.
 *
 * Resolution order (earlier steps override later ones):
 *  1. System admin → bypass everything
 *  2. Collect permissions from all roles assigned to user
 *     (roles with plant_id = null apply to all plants)
 *  3. Apply direct user_permissions overrides
 *     (is_granted=false DENIES — always wins over role grants)
 *  4. Check plant access (if plantId provided)
 *  5. Check amount limit (for approval actions)
 *
 * Results are cached in Redis for 5 minutes per (userId, companyId, plantId).
 * Call invalidateUser() whenever a user's roles or permissions change.
 */
export class PermissionService {
  private readonly CACHE_TTL = 5 * 60; // 5 minutes

  constructor(private readonly redis: Redis) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Check if user has a specific permission within a company/plant.
   */
  async check(
    userId: string,
    permissionCode: string,
    companyId: string,
    plantId?: string
  ): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId, companyId, plantId);
    return effective.has('*') || effective.has(permissionCode);
  }

  /**
   * Returns the full set of permission codes the user has.
   * Used by the /auth/me endpoint to send permissions to the frontend.
   */
  async getEffectivePermissions(
    userId: string,
    companyId: string,
    plantId?: string
  ): Promise<Set<string>> {
    // System admin bypasses all permission checks
    const [user] = await db
      .select({ isSystemAdmin: users.isSystemAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.isSystemAdmin) return new Set(['*']); // wildcard — has everything

    const cacheKey = this.cacheKey(userId, companyId, plantId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return new Set(JSON.parse(cached) as string[]);

    const permSet = await this.compute(userId, companyId, plantId);
    await this.redis.set(cacheKey, JSON.stringify([...permSet]), 'EX', this.CACHE_TTL);
    return permSet;
  }

  /**
   * Verify user has access to a specific plant.
   * Access is granted if:
   *   1. The user has an explicit record in user_plant_access, OR
   *   2. The user has a role assigned specifically to this plant (user_roles.plant_id = plantId), OR
   *   3. The user has a company-wide role in the company that owns the plant (user_roles.plant_id IS NULL)
   */
  async hasPlantAccess(userId: string, plantId: string): Promise<boolean> {
    // 1. Direct explicit plant grant
    const [row] = await db
      .select({ userId: userPlantAccess.userId })
      .from(userPlantAccess)
      .where(and(
        eq(userPlantAccess.userId, userId),
        eq(userPlantAccess.plantId, plantId)
      ))
      .limit(1);

    if (row) return true;

    // 2. Role assigned directly to this plant
    const [roleWithPlant] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.plantId, plantId)
      ))
      .limit(1);

    if (roleWithPlant) return true;

    // 3. Company-wide role for the plant's owning company
    const [roleCompanyWide] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .innerJoin(plants, eq(userRoles.companyId, plants.companyId))
      .where(and(
        eq(userRoles.userId, userId),
        eq(plants.id, plantId),
        isNull(userRoles.plantId)
      ))
      .limit(1);

    return !!roleCompanyWide;
  }

  /**
   * Verify user has access to a specific warehouse.
   */
  async hasWarehouseAccess(userId: string, warehouseId: string): Promise<boolean> {
    const [row] = await db
      .select({ userId: userWarehouseAccess.userId })
      .from(userWarehouseAccess)
      .where(and(
        eq(userWarehouseAccess.userId, userId),
        eq(userWarehouseAccess.warehouseId, warehouseId)
      ))
      .limit(1);

    return !!row;
  }

  /**
   * Segregation of Duties (Maker ≠ Checker):
   * Ensures the approving user is not the same user who created or submitted the document.
   */
  validateMakerChecker(approverUserId: string, createdBy?: string | null, submittedBy?: string | null, bypassSod?: boolean): boolean {
    if (bypassSod) return true;
    if (createdBy && approverUserId === createdBy) return false;
    if (submittedBy && approverUserId === submittedBy) return false;
    return true;
  }

  /**
   * Check whether a monetary amount is within the user's approval limit.
   * Returns true if:
   *   - No limit row exists (unlimited by default)
   *   - Limit row exists with max_amount_paise = -1 (explicitly unlimited)
   *   - Amount (in paise) is <= the limit
   */
  async withinApprovalLimit(
    userId: string,
    companyId: string,
    documentType: string,
    amountPaise: number,
    plantId?: string
  ): Promise<boolean> {
    const conditions = [
      eq(userApprovalLimits.userId, userId),
      eq(userApprovalLimits.companyId, companyId),
      eq(userApprovalLimits.documentType, documentType),
      or(isNull(userApprovalLimits.plantId), plantId ? eq(userApprovalLimits.plantId, plantId) : isNull(userApprovalLimits.plantId)),
    ];

    const [limit] = await db
      .select({ maxAmountPaise: userApprovalLimits.maxAmountPaise })
      .from(userApprovalLimits)
      .where(and(...conditions))
      .orderBy(userApprovalLimits.plantId) // plant-specific limit takes precedence over global
      .limit(1);

    if (!limit) return true;                        // no limit = unlimited
    if (limit.maxAmountPaise === -1) return true;   // explicitly unlimited
    return amountPaise <= limit.maxAmountPaise;
  }

  /**
   * Invalidate the cached permissions for a user.
   * Call this whenever you update user_roles or user_permissions.
   */
  async invalidateUser(userId: string, companyId: string): Promise<void> {
    const pattern = `perms:${userId}:${companyId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async compute(
    userId: string,
    companyId: string,
    plantId?: string
  ): Promise<Set<string>> {
    // Step 1: Get all role-based permissions
    // If plantId is provided, include company-wide roles + roles scoped to this plant.
    // If plantId is omitted (company-level view/check), all roles in this company apply.
    const roleConditions = [
      eq(userRoles.userId, userId),
      eq(userRoles.companyId, companyId),
    ];
    if (plantId) {
      roleConditions.push(or(isNull(userRoles.plantId), eq(userRoles.plantId, plantId))!);
    }

    const roleBased = await db
      .select({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(...roleConditions));

    const permSet = new Set(roleBased.map((r) => r.code));

    // Step 2: Apply direct user_permissions overrides
    const overrideConditions = [
      eq(userPermissions.userId, userId),
      eq(userPermissions.companyId, companyId),
    ];
    if (plantId) {
      overrideConditions.push(or(isNull(userPermissions.plantId), eq(userPermissions.plantId, plantId))!);
    }

    const overrides = await db
      .select({
        code: permissions.code,
        isGranted: userPermissions.isGranted,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(and(...overrideConditions));

    for (const { code, isGranted } of overrides) {
      if (isGranted) {
        permSet.add(code);
      } else {
        permSet.delete(code); // DENY wins — remove even if role granted it
      }
    }

    return permSet;
  }

  private cacheKey(userId: string, companyId: string, plantId?: string): string {
    return `perms:${userId}:${companyId}:${plantId ?? 'all'}`;
  }
}
