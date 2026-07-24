/**
 * ValuationEngine — Weighted Average Cost (WAC) computation
 *
 * Indian ICAI guidance recommends WAC for manufacturing inventory.
 * WAC recalculates on every inward movement; outward issues use the
 * current WAC snapshot at time of issue (stored immutably in the SLE).
 *
 * All amounts in paise (integer). Quantities as numbers (may be decimal
 * for process manufacturing — kg, litres, etc.).
 *
 * ── WAC formula ──────────────────────────────────────────────────────────
 *
 *   newWAC = (existingValue + incomingValue) / (existingQty + incomingQty)
 *
 * Rounded to nearest paise per unit. The rounding error (≤ 0.5 paise/unit)
 * accumulates in valuationAmountPaise over time — negligible for SME volumes.
 *
 * ── By-product / co-product cost allocation ──────────────────────────────
 *
 * Process manufacturing produces multiple outputs from one batch.
 * Cost must be split across outputs. Three methods:
 *   'qty'        — split proportional to quantity produced
 *   'sales_price'— split proportional to current sales price (residual value)
 *   'manual'     — explicit percentage weights set on the production order
 *
 * ── FIFO (future) ────────────────────────────────────────────────────────
 *
 * FIFO is declared on the item (valuationMethod = 'fifo').
 * ValuationEngine does not implement FIFO layers here — that requires a
 * separate fifo_layers table and is out of scope for Phase 5.
 * Items using FIFO will warn and fall back to WAC until implemented.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WacResult {
  /** New WAC per unit in paise */
  newRatePaise: number;
  /** New total stock value in paise (existing + incoming, before issue) */
  newAmountPaise: number;
}

export interface CostAllocation {
  itemId: string;
  /** Allocated cost in paise */
  costPaise: number;
  /** Unit cost = costPaise / qty */
  unitCostPaise: number;
}

export interface AllocationInput {
  itemId: string;
  qty: number;
  /** Required for 'sales_price' method */
  salesPricePaise?: number;
  /** Required for 'manual' method — must sum to 100 across all outputs */
  allocationPct?: number;
}

// ─── ValuationEngine ───────────────────────────────────────────────────────

export class ValuationEngine {
  // ── Weighted Average Cost ───────────────────────────────────────────────

  /**
   * Recompute WAC after an inward movement.
   *
   * @param existingQty   current quantity on hand (before this movement)
   * @param existingValue current total value in paise (before this movement)
   * @param incomingQty   quantity being received
   * @param incomingValue value of incoming goods in paise
   */
  computeNewWac(
    existingQty: number,
    existingValue: number,
    incomingQty: number,
    incomingValue: number
  ): WacResult {
    const totalQty = existingQty + incomingQty;

    if (totalQty <= 0) {
      // No stock after movement — reset valuation
      return { newRatePaise: 0, newAmountPaise: 0 };
    }

    const totalValue = existingValue + incomingValue;

    // Round rate to nearest paise per unit
    const newRatePaise = Math.round(totalValue / totalQty);

    return {
      newRatePaise,
      newAmountPaise: totalValue,
    };
  }

  /**
   * Compute the value of an outward movement at the current WAC.
   * Always issues at current WAC — the rate is snapshotted into the SLE
   * and never changes after insert.
   */
  computeOutwardValue(qty: number, currentWacPaise: number): number {
    return Math.round(qty * currentWacPaise);
  }

  /**
   * Recompute the stock balance value after an outward movement.
   * Subtract the issued value; rate stays the same.
   *
   * @returns new { qty, valuationAmountPaise, valuationRatePaise }
   */
  applyOutward(
    currentQty: number,
    currentValuePaise: number,
    currentRatePaise: number,
    issuedQty: number
  ): { newQty: number; newValuePaise: number; newRatePaise: number } {
    const issuedValue = Math.round(issuedQty * currentRatePaise);
    const newQty = currentQty - issuedQty;
    const newValue = currentValuePaise - issuedValue;

    // If qty hits zero, reset value (avoid phantom rounding residuals)
    if (newQty <= 0) {
      return { newQty: 0, newValuePaise: 0, newRatePaise: 0 };
    }

    return {
      newQty,
      newValuePaise: newValue,
      newRatePaise: currentRatePaise, // WAC doesn't change on outward
    };
  }

  // ── By-product / co-product cost allocation ─────────────────────────────

  /**
   * Split total production cost across multiple outputs.
   *
   * Used in process manufacturing when a single batch produces:
   *   - primary product + by-products (e.g. refinery: petrol + diesel + LPG)
   *   - co-products (e.g. chemical: two compounds from one reaction)
   *
   * Each output gets a cost, which becomes its WAC on receipt.
   *
   * @param totalCostPaise  total cost of the production batch (RM + labour + overhead)
   * @param outputs         list of outputs with their quantities and allocation params
   * @param method          how to split the cost
   */
  allocateProductionCost(
    totalCostPaise: number,
    outputs: AllocationInput[],
    method: 'qty' | 'sales_price' | 'manual'
  ): CostAllocation[] {
    if (outputs.length === 0) return [];
    if (outputs.length === 1) {
      const o = outputs[0]!;
      return [{
        itemId: o.itemId,
        costPaise: totalCostPaise,
        unitCostPaise: o.qty > 0 ? Math.round(totalCostPaise / o.qty) : 0,
      }];
    }

    let weights: number[];

    if (method === 'qty') {
      const totalQty = outputs.reduce((s, o) => s + o.qty, 0);
      weights = outputs.map(o => o.qty / totalQty);
    } else if (method === 'sales_price') {
      const totals = outputs.map(o => o.qty * (o.salesPricePaise ?? 0));
      const grandTotal = totals.reduce((s, v) => s + v, 0);
      weights = totals.map(v => (grandTotal > 0 ? v / grandTotal : 1 / outputs.length));
    } else {
      // manual — use allocationPct, must sum to 100
      const sum = outputs.reduce((s, o) => s + (o.allocationPct ?? 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`Manual allocation percentages must sum to 100; got ${sum}`);
      }
      weights = outputs.map(o => (o.allocationPct ?? 0) / 100);
    }

    // Allocate cost; assign rounding residual to the first output
    const allocated: number[] = weights.map(w => Math.floor(totalCostPaise * w));
    const residual = totalCostPaise - allocated.reduce((s, v) => s + v, 0);
    allocated[0] = (allocated[0] ?? 0) + residual;

    return outputs.map((o, i) => ({
      itemId: o.itemId,
      costPaise: allocated[i] ?? 0,
      unitCostPaise: o.qty > 0 ? Math.round((allocated[i] ?? 0) / o.qty) : 0,
    }));
  }

  // ── Validation helpers ───────────────────────────────────────────────────

  /**
   * Verify that the available quantity is sufficient for an outward movement.
   * Throws a descriptive error if insufficient (call before posting).
   *
   * @param availableQty  quantityOnHand - quantityReserved
   * @param requiredQty   quantity to be issued
   * @param itemCode      for the error message
   */
  assertSufficientStock(availableQty: number, requiredQty: number, itemCode: string): void {
    if (availableQty < requiredQty) {
      throw new InsufficientStockError(
        `Insufficient stock for ${itemCode}: ` +
        `required ${requiredQty}, available ${availableQty}`
      );
    }
  }
}

// ─── Error types ───────────────────────────────────────────────────────────

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK';
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}
