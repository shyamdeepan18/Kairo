/**
 * UomService — Unit of Measure conversion
 *
 * Converts quantities between UOMs using the uom_conversions table.
 *
 * Lookup priority (most specific wins):
 *   1. Item-scoped + company-scoped row
 *   2. Item-scoped global row (companyId = null)
 *   3. Global row (both companyId and itemId = null)
 *
 * The result is cached in-process (no Redis) — conversions are read-mostly
 * and small in size. Cache is invalidated when a conversion is added/updated.
 *
 * ── Quantity precision ────────────────────────────────────────────────────
 *
 * All quantities use numeric(18,4) in the DB and are returned as strings
 * by postgres-js. parseFloat() is fine for display; for arithmetic use
 * the numeric helpers below to avoid accumulating floating-point drift.
 *
 * Round to 4 decimal places after every conversion.
 */

import { db } from '@erp/db';
import { uomConversions } from '@erp/db';
import { and, eq, isNull, or } from 'drizzle-orm';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ConversionKey {
  itemId: string | null;
  companyId: string | null;
  fromUom: string;
  toUom: string;
}

interface ConversionRow {
  factor: number;
  priority: number; // higher = more specific
}

// ─── UomService ────────────────────────────────────────────────────────────

export class UomService {
  /** In-process cache: `${companyId}:${itemId}:${from}:${to}` → factor */
  private cache = new Map<string, number>();

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Convert quantity from one UOM to another.
   *
   * @param qty       quantity to convert
   * @param fromUom   source UOM code (e.g. 'BOX')
   * @param toUom     target UOM code (e.g. 'PCS')
   * @param companyId company for company-scoped lookup
   * @param itemId    item for item-scoped lookup (optional)
   *
   * Returns quantity rounded to 4 decimal places.
   * Throws if no conversion path is found.
   */
  async convert(
    qty: number,
    fromUom: string,
    toUom: string,
    companyId: string,
    itemId?: string
  ): Promise<number> {
    if (fromUom === toUom) return qty;

    const factor = await this.getFactor(fromUom, toUom, companyId, itemId);
    return round4(qty * factor);
  }

  /**
   * Get the conversion factor (multiply fromUom quantity by factor → toUom quantity).
   * Tries forward conversion first; if not found, tries inverse (1/factor).
   */
  async getFactor(
    fromUom: string,
    toUom: string,
    companyId: string,
    itemId?: string
  ): Promise<number> {
    // Try forward
    const forward = await this.lookup(fromUom, toUom, companyId, itemId ?? null);
    if (forward !== null) return forward;

    // Try inverse
    const inverse = await this.lookup(toUom, fromUom, companyId, itemId ?? null);
    if (inverse !== null) return round8(1 / inverse);

    throw new UomConversionError(
      `No conversion found: ${fromUom} → ${toUom}` +
      (itemId ? ` for item ${itemId}` : '')
    );
  }

  /** Invalidate cache (call when a conversion row is added/updated) */
  invalidate(companyId?: string): void {
    if (!companyId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${companyId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async lookup(
    fromUom: string,
    toUom: string,
    companyId: string,
    itemId: string | null
  ): Promise<number | null> {
    // Build cache keys from most-specific to least-specific
    const cacheKey = `${companyId}:${itemId ?? '*'}:${fromUom}:${toUom}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    // Fetch all matching rows in one query, ordered by specificity
    const rows = await db
      .select({
        factor: uomConversions.factor,
        companyId: uomConversions.companyId,
        itemId: uomConversions.itemId,
      })
      .from(uomConversions)
      .where(
        and(
          eq(uomConversions.fromUom, fromUom),
          eq(uomConversions.toUom, toUom),
          // Company match: our company or global
          or(
            eq(uomConversions.companyId, companyId),
            isNull(uomConversions.companyId)
          ),
          // Item match: our item, or global (null), or no item restriction
          itemId
            ? or(
                eq(uomConversions.itemId, itemId),
                isNull(uomConversions.itemId)
              )
            : isNull(uomConversions.itemId)
        )
      );

    if (rows.length === 0) return null;

    // Score specificity: item+company > item only > company only > global
    const scored = rows.map(r => ({
      factor: parseFloat(r.factor),
      score:
        (r.companyId !== null ? 2 : 0) +
        (r.itemId !== null ? 4 : 0),
    }));
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0]!.factor;
    this.cache.set(cacheKey, best);
    return best;
  }
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class UomConversionError extends Error {
  readonly code = 'UOM_CONVERSION_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'UomConversionError';
  }
}

// ─── Numeric helpers ────────────────────────────────────────────────────────

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round8(n: number): number {
  return Math.round(n * 100000000) / 100000000;
}
