import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import {
  db,
  userRoles, rolePermissions, permissions,
  userPermissions, userPlantAccess, userWarehouseAccess, userApprovalLimits,
  users,
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
    return effective.has(permissionCode);
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
   */
  async hasPlantAccess(userId: string, plantId: string): Promise<boolean> {
    const [row] = await db
      .select({ userId: userPlantAccess.userId })
      .from(userPlantAccess)
      .where(and(
        eq(userPlantAccess.userId, userId),
        eq(userPlantAccess.plantId, plantId)
      ))
      .limit(1);

    return !!row;
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
  validateMakerChecker(approverUserId: string, createdBy?: string | null, submittedBy?: string | null): boolean {
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
    // Include roles with no plant scope (apply everywhere) AND
    // roles scoped to this specific plant (if plantId provided)
    const plantCondition = plantId
      ? or(isNull(userRoles.plantId), eq(userRoles.plantId, plantId))
      : isNull(userRoles.plantId);

    const roleBased = await db
      .select({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.companyId, companyId),
        plantCondition
      ));

    const permSet = new Set(roleBased.map((r) => r.code));

    // Step 2: Apply direct user_permissions overrides
    const overrides = await db
      .select({
        code: permissions.code,
        isGranted: userPermissions.isGranted,
      })
      .from(userPermissions)
      .innerJoin(permissions, eq(permissions.id, userPermissions.permissionId))
      .where(and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.companyId, companyId),
        or(isNull(userPermissions.plantId), plantId ? eq(userPermissions.plantId, plantId) : isNull(userPermissions.plantId))
      ));

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
