import { eq, and, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { db, companyModules, companyLicense, userRoles } from '@erp/db';

/**
 * LicenseService — company-level module activation + seat caps (roadmap item 2B).
 *
 * On-prem installs can't phone home, so the license is a signed blob validated
 * offline. Module checks are cached in Redis like PermissionService.
 *
 * Default-open: a company with no company_modules row for a module is treated as
 * ENABLED, so existing installs keep working until a license is applied.
 */
export class LicenseService {
  private readonly TTL = 10 * 60;
  private readonly PREFIX = 'license:mod:';

  constructor(private readonly redis: Redis) {}

  async isModuleEnabled(companyId: string, module: string): Promise<boolean> {
    const key = `${this.PREFIX}${companyId}:${module}`;
    const cached = await this.redis.get(key);
    if (cached !== null) return cached === '1';

    const [row] = await db
      .select()
      .from(companyModules)
      .where(and(eq(companyModules.companyId, companyId), eq(companyModules.module, module)))
      .limit(1);

    const enabled = !row
      ? true                                   // default-open
      : row.isEnabled && (row.expiresAt == null || row.expiresAt > new Date());

    await this.redis.setex(key, this.TTL, enabled ? '1' : '0');
    return enabled;
  }

  async getModules(companyId: string) {
    return db.select().from(companyModules).where(eq(companyModules.companyId, companyId));
  }

  async setModule(companyId: string, module: string, isEnabled: boolean, expiresAt?: Date | null) {
    const [row] = await db
      .insert(companyModules)
      .values({ companyId, module, isEnabled, activatedAt: isEnabled ? new Date() : null, expiresAt: expiresAt ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [companyModules.companyId, companyModules.module],
        set: { isEnabled, expiresAt: expiresAt ?? null, updatedAt: new Date() },
      })
      .returning();
    await this.redis.del(`${this.PREFIX}${companyId}:${module}`);
    return row;
  }

  async getLicense(companyId: string) {
    const [row] = await db.select().from(companyLicense).where(eq(companyLicense.companyId, companyId)).limit(1);
    return row ?? null;
  }

  /**
   * Block user creation/activation when the seat cap is reached.
   * Seats counted as distinct users with a role assignment in the company.
   */
  async assertSeatAvailable(companyId: string): Promise<void> {
    const lic = await this.getLicense(companyId);
    if (!lic || lic.maxUsers === -1) return; // unlimited
    const [{ seats }] = await db
      .select({ seats: sql<number>`count(distinct ${userRoles.userId})::int` })
      .from(userRoles)
      .where(eq(userRoles.companyId, companyId));
    if (seats >= lic.maxUsers) {
      throw new Error(`Seat limit reached (${lic.maxUsers}). Upgrade the license to add users.`);
    }
  }

  /**
   * Validate a signed license blob offline.
   * v1: structural decode + expiry check. Signature verification against an
   * embedded public key is a TODO (see PHASE9 / license-key tooling).
   */
  validateKey(blob: string): { valid: boolean; payload?: Record<string, unknown>; errors: string[] } {
    const errors: string[] = [];
    try {
      const json = Buffer.from(blob, 'base64').toString('utf8');
      const payload = JSON.parse(json) as Record<string, unknown>;
      const validTo = payload.validTo ? new Date(String(payload.validTo)) : null;
      if (validTo && validTo < new Date()) errors.push('License expired');
      // TODO: verify payload.signature against the embedded public key.
      return { valid: errors.length === 0, payload, errors };
    } catch {
      errors.push('Malformed license key');
      return { valid: false, errors };
    }
  }

  async invalidate(companyId: string): Promise<void> {
    const keys = await this.redis.keys(`${this.PREFIX}${companyId}:*`);
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
