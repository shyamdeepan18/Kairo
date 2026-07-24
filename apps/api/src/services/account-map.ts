import { eq, and, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { db, chartOfAccounts, companyAccountConfig } from '@erp/db';
import type { PostingCategory } from '@erp/db';

// ─── AccountMap ────────────────────────────────────────────────────────────
//
// Immutable snapshot of a company's posting-category → account-id mapping.
// Returned by AccountMapService.getMap() and passed into posting templates.

export class AccountMap {
  constructor(
    private readonly map: Partial<Record<PostingCategory, string>>,
    private readonly companyId: string
  ) {}

  /**
   * Resolve a posting category to a GL account UUID.
   * Throws if the category is not configured — this prevents silent mis-postings.
   */
  resolve(category: PostingCategory): string {
    const accountId = this.map[category];
    if (!accountId) {
      throw new Error(
        `Account not configured: posting category '${category}' for company ${this.companyId}. ` +
        `Go to Settings → Account Configuration to map this category.`
      );
    }
    return accountId;
  }

  /** True if a category has been configured (use for optional posting lines) */
  has(category: PostingCategory): boolean {
    return !!this.map[category];
  }

  /** Raw map for debugging */
  toRecord(): Partial<Record<PostingCategory, string>> {
    return { ...this.map };
  }
}

// ─── AccountMapService ────────────────────────────────────────────────────
//
// Builds the AccountMap for a (company, optional plant) pair.
// Strategy:
//   1. Load the company-wide config row (plant_id IS NULL)
//   2. If a plantId is provided, load the plant-specific row and merge it on top
//   3. If neither config row exists, auto-build from the COA's postingCategory fields
//   4. Cache in Redis for 10 min

export class AccountMapService {
  private readonly TTL_SECONDS = 10 * 60;
  private readonly CACHE_PREFIX = 'acct_map:';

  constructor(private redis: Redis) {}

  async getMap(companyId: string, plantId?: string): Promise<AccountMap> {
    const cacheKey = `${this.CACHE_PREFIX}${companyId}:${plantId ?? 'global'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return new AccountMap(JSON.parse(cached), companyId);
    }

    const map = await this.compute(companyId, plantId);
    await this.redis.setex(cacheKey, this.TTL_SECONDS, JSON.stringify(map));
    return new AccountMap(map, companyId);
  }

  async invalidate(companyId: string, plantId?: string): Promise<void> {
    if (plantId) {
      await this.redis.del(`${this.CACHE_PREFIX}${companyId}:${plantId}`);
    }
    await this.redis.del(`${this.CACHE_PREFIX}${companyId}:global`);
  }

  private async compute(
    companyId: string,
    plantId?: string
  ): Promise<Partial<Record<PostingCategory, string>>> {
    // ── Step 1: Load company-wide config ─────────────────────────────────
    const [companyConfig] = await db
      .select()
      .from(companyAccountConfig)
      .where(
        and(
          eq(companyAccountConfig.companyId, companyId),
          isNull(companyAccountConfig.plantId)
        )
      )
      .limit(1);

    let merged: Partial<Record<PostingCategory, string>> = {
      ...(companyConfig?.config ?? {}),
    };

    // ── Step 2: Merge plant-specific overrides ────────────────────────────
    if (plantId) {
      const [plantConfig] = await db
        .select()
        .from(companyAccountConfig)
        .where(
          and(
            eq(companyAccountConfig.companyId, companyId),
            eq(companyAccountConfig.plantId, plantId)
          )
        )
        .limit(1);

      if (plantConfig) {
        merged = { ...merged, ...plantConfig.config };
      }
    }

    // ── Step 3: Auto-fill from COA postingCategory if config is sparse ────
    // This lets companies use the standard COA without manual account config.
    const coaAccounts = await db
      .select({ id: chartOfAccounts.id, postingCategory: chartOfAccounts.postingCategory })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.companyId, companyId),
          eq(chartOfAccounts.isActive, true),
          eq(chartOfAccounts.isGroup, false)
        )
      );

    for (const account of coaAccounts) {
      if (account.postingCategory && !merged[account.postingCategory as PostingCategory]) {
        merged[account.postingCategory as PostingCategory] = account.id;
      }
    }

    return merged;
  }
}
