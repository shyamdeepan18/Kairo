/**
 * ProductionCosting — the type-specific STRATEGY functions for Phase 8.
 *
 * The ProductionEngine lifecycle (plan → issue → receive → close) is identical for
 * discrete and process manufacturing. Only the steps below branch on
 * manufacturingType, keeping the rest of the codebase single.
 *
 * All money in paise (integers). All quantities are plain numbers here (callers
 * parse numeric columns with parseFloat before calling).
 */

export type ManufacturingType = 'discrete' | 'process';
export type OutputType = 'primary' | 'co_product' | 'by_product';
export type AllocationBasis = 'percent' | 'by_weight' | 'by_value' | 'nrv';

export interface OutputForAllocation {
  outputId: string;
  outputType: OutputType;
  producedQty: number;
  basis: AllocationBasis;
  /** Used when basis = 'percent' (0–100) */
  allocationPercent: number;
  /** Market / selling rate per unit, paise — used by 'by_value' and 'nrv' */
  marketRatePaise: number;
}

/**
 * scaleFactor = plannedQty / batchSize. Multiplies every exploded input/output
 * line. Guards divide-by-zero.
 */
export function scaleFactor(plannedQty: number, batchSize: number): number {
  if (!batchSize || batchSize <= 0) return 1;
  return plannedQty / batchSize;
}

/** Required input quantity for a formula input line, including scrap allowance. */
export function explodeInputQty(qtyPerBatch: number, factor: number, scrapPercent: number): number {
  const base = qtyPerBatch * factor;
  return base * (1 + (scrapPercent || 0) / 100);
}

/**
 * Allocate the total WIP cost across produced outputs.
 *
 *   • Discrete: a single primary output receives the whole cost.
 *   • Process:
 *       1. By-products are valued at NRV (producedQty × marketRate) and take that
 *          cost out of the pool first.
 *       2. The remainder is split across primary + co-products by the configured
 *          basis (percent / by_weight / by_value).
 *   • Penny-rounding remainder is dropped on the primary output so the sum of
 *     allocations exactly equals totalWipPaise.
 *
 * Returns a map of outputId → allocated paise.
 */
export function allocateProductionCost(
  totalWipPaise: number,
  outputs: OutputForAllocation[],
  manufacturingType: ManufacturingType
): Map<string, number> {
  const result = new Map<string, number>();
  if (outputs.length === 0) return result;

  // Discrete (or any single-output case): everything to the one main output.
  const mains = outputs.filter((o) => o.outputType !== 'by_product');
  if (manufacturingType === 'discrete' || outputs.length === 1 || mains.length === 1 && outputs.every((o) => o.outputType !== 'by_product')) {
    const primary = mains[0] ?? outputs[0];
    for (const o of outputs) result.set(o.outputId, 0);
    result.set(primary.outputId, totalWipPaise);
    return result;
  }

  // Process: by-products at NRV first.
  let remaining = totalWipPaise;
  const byProducts = outputs.filter((o) => o.outputType === 'by_product');
  for (const bp of byProducts) {
    const nrv = Math.round(bp.producedQty * bp.marketRatePaise);
    const capped = Math.max(0, Math.min(nrv, remaining));
    result.set(bp.outputId, capped);
    remaining -= capped;
  }

  // Split the remainder across primary + co-products.
  const weights = mains.map((o) => {
    switch (o.basis) {
      case 'percent':   return o.allocationPercent || 0;
      case 'by_weight': return o.producedQty || 0;
      case 'by_value':  return (o.producedQty || 0) * (o.marketRatePaise || 0);
      case 'nrv':       return (o.producedQty || 0) * (o.marketRatePaise || 0);
      default:          return o.producedQty || 0;
    }
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  let allocatedSoFar = 0;
  mains.forEach((o, i) => {
    const share = totalWeight > 0 ? Math.round((remaining * weights[i]) / totalWeight) : Math.round(remaining / mains.length);
    result.set(o.outputId, share);
    allocatedSoFar += share;
  });

  // Drop rounding remainder onto the first main output so totals reconcile.
  const drift = remaining - allocatedSoFar;
  if (drift !== 0 && mains.length > 0) {
    const first = mains[0].outputId;
    result.set(first, (result.get(first) ?? 0) + drift);
  }

  return result;
}

/** Per-unit valuation rate (paise) for a produced output; 0 if no qty. */
export function perUnitRate(allocatedPaise: number, producedQty: number): number {
  if (!producedQty || producedQty <= 0) return 0;
  return Math.round(allocatedPaise / producedQty);
}

export interface VarianceResult {
  /** producedQty − expectedQty for the primary output (process yield variance) */
  qtyVariance: number;
  /** actualCost − standardCost (0 when no standard configured) */
  costVariancePaise: number;
}

/** Compute close-time variance. Discrete → usage/standard; process → yield. */
export function computeVariance(opts: {
  expectedPrimaryQty: number;
  producedPrimaryQty: number;
  actualCostPaise: number;
  standardCostPaise?: number;
}): VarianceResult {
  return {
    qtyVariance: opts.producedPrimaryQty - opts.expectedPrimaryQty,
    costVariancePaise: opts.standardCostPaise === undefined ? 0 : opts.actualCostPaise - opts.standardCostPaise,
  };
}
