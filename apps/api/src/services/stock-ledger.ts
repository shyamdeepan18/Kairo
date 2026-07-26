/**
 * StockLedgerService — the single entry point for all inventory movements.
 *
 * Every stock change (GRN, issue, delivery, adjustment, production receipt,
 * transfer) must go through this service. Direct DB writes to
 * stock_ledger_entries or stock_balances are forbidden.
 *
 * ── Invariants ────────────────────────────────────────────────────────────
 *
 *   1. All calls MUST be inside an existing db.transaction() — the caller
 *      owns the transaction boundary so document + SLE are atomic.
 *   2. stockLedgerEntries is append-only — never UPDATE or DELETE.
 *   3. stockBalances is updated via SELECT FOR UPDATE → UPDATE to prevent
 *      concurrent WAC corruption.
 *   4. For outward movements, valuationRatePaise is the current WAC
 *      snapshotted at time of issue — frozen in the SLE forever.
 *   5. Reversals create a mirror SLE (same qty, same rate, opposite direction)
 *      and adjust the balance; they do NOT delete the original SLE.
 *
 * ── Quantity handling ─────────────────────────────────────────────────────
 *
 *   Pass quantity in the document's UOM (e.g. BOX).
 *   UomService converts to items.primaryUom for balance and valuation.
 *   If fromUom === items.primaryUom, conversion is a no-op.
 *
 * ── Discrete vs. Process manufacturing ────────────────────────────────────
 *
 *   Discrete: integer quantities, serial tracking optional, direct BOM.
 *   Process:  decimal quantities (kg/L/m), batch mandatory, yield variance.
 *
 *   This service handles both identically — the caller sets movementType and
 *   optional batchId/serialId. Validation (batch required for batch-tracked
 *   items) is enforced before insert.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, stockLedgerEntries, stockBalances, items, itemBatches, itemSerials } from '@erp/db';
import type { StockLedgerEntry, StockBalance } from '@erp/db';
import {
  MOVEMENT_DIRECTION,
  type MovementType,
} from '@erp/db';
import { ValuationEngine, InsufficientStockError } from './valuation-engine.js';
import { UomService } from './uom-service.js';
import { fiscalPeriod } from './posting-engine.js';

// ─── Types ─────────────────────────────────────────────────────────────────

/** Input for a single stock movement — always positive quantity */
export interface StockMovement {
  companyId: string;
  plantId: string;
  warehouseId: string;
  itemId: string;

  movementType: MovementType;

  /** Always positive. Direction (IN/OUT) derived from movementType */
  quantity: number;
  /** UOM of the quantity above — converted to primaryUom internally */
  uom: string;

  /**
   * Required for inward movements (purchase_receipt, opening_balance, etc.).
   * Ignored for outward movements — WAC is used automatically.
   * For production_receipt: pass the computed production cost per unit.
   */
  valuationRatePaise?: number;

  documentType: string;
  documentId: string;
  documentNumber: string;
  documentLineNumber?: number;

  /** Required if item.trackingType = 'batch' */
  batchId?: string;
  /** Required if item.trackingType = 'serial' */
  serialId?: string;

  costCentreId?: string;
  productionOrderId?: string;

  postingDate: Date;
  remarks?: string;
  createdBy: string;
}

export interface PostedMovement {
  sle: StockLedgerEntry;
  newBalance: StockBalance;
}

// DB transaction type — accepts the drizzle transaction object
type TX = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── StockLedgerService ────────────────────────────────────────────────────

export class StockLedgerService {
  private valuation = new ValuationEngine();
  private uom = new UomService();

  // ── Single movement ───────────────────────────────────────────────────

  /**
   * Post a single stock movement.
   *
   * Must be called inside db.transaction(). The transaction must already
   * have inserted the source document so the documentId is valid.
   *
   * @returns the inserted SLE and the updated stock balance
   */
  async post(tx: TX, movement: StockMovement): Promise<PostedMovement> {
    const item = await this.fetchItem(tx, movement.itemId);
    this.validateTracking(movement, item);

    const direction = MOVEMENT_DIRECTION[movement.movementType];
    const quantityInPrimaryUom = await this.uom.convert(
      movement.quantity,
      movement.uom,
      item.primaryUom,
      movement.companyId,
      movement.itemId
    );

    // Lock the balance row for this (warehouse, item) pair
    const balance = await this.lockBalance(tx, movement);

    let valuationRatePaise: number;
    let valuationAmountPaise: number;

    if (direction === 'IN') {
      const rate = movement.valuationRatePaise;
      if (rate === undefined || rate < 0) {
        throw new Error(
          `valuationRatePaise is required for inward movement type '${movement.movementType}'`
        );
      }
      valuationRatePaise = rate;
      valuationAmountPaise = Math.round(quantityInPrimaryUom * rate);
    } else {
      // Outward: issue at current WAC
      const currentRate = balance?.valuationRatePaise ?? 0;
      valuationRatePaise = currentRate;
      valuationAmountPaise = this.valuation.computeOutwardValue(quantityInPrimaryUom, currentRate);

      // Validate sufficient stock (available = onHand - reserved)
      const onHand = parseFloat(balance?.quantityOnHand ?? '0');
      const reserved = parseFloat(balance?.quantityReserved ?? '0');
      const available = onHand - reserved;
      this.valuation.assertSufficientStock(available, quantityInPrimaryUom, item.itemCode);
    }

    const { fiscalYear, period } = fiscalPeriod(movement.postingDate);

    // Insert SLE
    const [sle] = await tx
      .insert(stockLedgerEntries)
      .values({
        companyId: movement.companyId,
        plantId: movement.plantId,
        warehouseId: movement.warehouseId,
        itemId: movement.itemId,
        documentType: movement.documentType,
        documentId: movement.documentId,
        documentNumber: movement.documentNumber,
        documentLineNumber: movement.documentLineNumber ?? null,
        movementType: movement.movementType,
        quantity: movement.quantity.toString(),
        uom: movement.uom,
        quantityInPrimaryUom: quantityInPrimaryUom.toString(),
        valuationRatePaise,
        valuationAmountPaise,
        batchId: movement.batchId ?? null,
        serialId: movement.serialId ?? null,
        costCentreId: movement.costCentreId ?? null,
        productionOrderId: movement.productionOrderId ?? null,
        postingDate: movement.postingDate.toISOString().slice(0, 10),
        fiscalYear,
        period,
        remarks: movement.remarks ?? null,
        isReversal: false,
        createdBy: movement.createdBy,
      })
      .returning();

    if (!sle) throw new Error('SLE insert failed — no row returned');

    // Update stock balance
    const newBalance = await this.updateBalance(tx, movement, direction, quantityInPrimaryUom, valuationRatePaise, valuationAmountPaise, balance);

    // Update serial status if applicable
    if (movement.serialId) {
      await this.updateSerialStatus(tx, movement.serialId, direction, movement.warehouseId);
    }

    return { sle, newBalance };
  }

  /**
   * Post multiple movements atomically.
   * All-or-nothing — if any movement fails, the whole batch is rolled back
   * (caller's transaction).
   *
   * Order matters for WAC: process INs before OUTs where the same item
   * appears in both (e.g. transfer: issue from A, receive at B).
   */
  async postBatch(tx: TX, movements: StockMovement[]): Promise<PostedMovement[]> {
    const results: PostedMovement[] = [];
    // Sort: INs before OUTs to ensure WAC is updated before issue
    const sorted = [...movements].sort((a, b) => {
      const da = MOVEMENT_DIRECTION[a.movementType] === 'IN' ? 0 : 1;
      const db = MOVEMENT_DIRECTION[b.movementType] === 'IN' ? 0 : 1;
      return da - db;
    });
    for (const m of sorted) {
      results.push(await this.post(tx, m));
    }
    return results;
  }

  /**
   * Reverse a previously posted SLE.
   * Creates a mirror entry with opposite direction and flags the original.
   *
   * Use for: GRN reversal, delivery reversal, adjustment correction.
   * NOT for normal business flows — use the appropriate return document instead.
   */
  async reverse(
    tx: TX,
    originalSleId: string,
    postingDate: Date,
    reason: string,
    userId: string
  ): Promise<StockLedgerEntry> {
    const [original] = await tx
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.id, originalSleId));

    if (!original) {
      throw new Error(`SLE not found: ${originalSleId}`);
    }
    if (original.isReversal) {
      throw new Error('Cannot reverse a reversal entry');
    }
    if (original.reversedBy) {
      throw new Error(`SLE ${originalSleId} has already been reversed`);
    }

    // Flip movement type for the reversal
    const reversalMovementType = REVERSAL_MAP[original.movementType as MovementType];
    if (!reversalMovementType) {
      throw new Error(`No reversal movement type defined for '${original.movementType}'`);
    }

    const { fiscalYear, period } = fiscalPeriod(postingDate);

    const [reversal] = await tx
      .insert(stockLedgerEntries)
      .values({
        companyId: original.companyId,
        plantId: original.plantId,
        warehouseId: original.warehouseId,
        itemId: original.itemId,
        documentType: original.documentType,
        documentId: original.documentId,
        documentNumber: original.documentNumber,
        documentLineNumber: original.documentLineNumber,
        movementType: reversalMovementType,
        quantity: original.quantity,
        uom: original.uom,
        quantityInPrimaryUom: original.quantityInPrimaryUom,
        valuationRatePaise: original.valuationRatePaise,
        valuationAmountPaise: original.valuationAmountPaise,
        batchId: original.batchId,
        serialId: original.serialId,
        costCentreId: original.costCentreId,
        productionOrderId: original.productionOrderId,
        postingDate: postingDate.toISOString().slice(0, 10),
        fiscalYear,
        period,
        remarks: reason,
        isReversal: true,
        reversalOf: original.id,
        createdBy: userId,
      })
      .returning();

    if (!reversal) throw new Error('Reversal SLE insert failed');

    // Mark original as reversed
    await tx
      .update(stockLedgerEntries)
      .set({ reversedBy: reversal.id })
      .where(eq(stockLedgerEntries.id, originalSleId));

    // Adjust balance: reversal direction is opposite of original
    const originalDirection = MOVEMENT_DIRECTION[original.movementType as MovementType];
    const reversalDirection = originalDirection === 'IN' ? 'OUT' : 'IN';
    const qty = parseFloat(original.quantityInPrimaryUom);

    const balance = await this.lockBalance(tx, {
      companyId: original.companyId,
      plantId: original.plantId,
      warehouseId: original.warehouseId,
      itemId: original.itemId,
    });

    await this.updateBalance(
      tx,
      {
        companyId: original.companyId,
        plantId: original.plantId,
        warehouseId: original.warehouseId,
        itemId: original.itemId,
        movementType: reversalMovementType as MovementType,
        postingDate,
        createdBy: userId,
        quantity: qty,
        uom: original.uom,
        documentType: original.documentType,
        documentId: original.documentId,
        documentNumber: original.documentNumber,
      },
      reversalDirection,
      qty,
      original.valuationRatePaise,
      original.valuationAmountPaise,
      balance
    );

    return reversal;
  }

  // ── Query helpers ──────────────────────────────────────────────────────

  /** Current balance for a warehouse + item. Returns null if no stock ever moved. */
  async getBalance(
    companyId: string,
    warehouseId: string,
    itemId: string
  ): Promise<StockBalance | null> {
    const [row] = await db
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.companyId, companyId),
          eq(stockBalances.warehouseId, warehouseId),
          eq(stockBalances.itemId, itemId)
        )
      );
    return row ?? null;
  }

  /**
   * Available quantity = quantityOnHand - quantityReserved.
   * Returns 0 if no balance row exists.
   */
  async getAvailableQty(
    companyId: string,
    warehouseId: string,
    itemId: string
  ): Promise<number> {
    const balance = await this.getBalance(companyId, warehouseId, itemId);
    if (!balance) return 0;
    const onHand = parseFloat(balance.quantityOnHand);
    const reserved = parseFloat(balance.quantityReserved);
    return Math.max(0, onHand - reserved);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async fetchItem(tx: TX, itemId: string) {
    const [item] = await tx
      .select({ itemCode: items.itemCode, primaryUom: items.primaryUom, trackingType: items.trackingType })
      .from(items)
      .where(eq(items.id, itemId));
    if (!item) throw new Error(`Item not found: ${itemId}`);
    return item;
  }

  private validateTracking(
    m: StockMovement,
    item: { trackingType: string; itemCode: string }
  ): void {
    if (item.trackingType === 'batch' && !m.batchId) {
      throw new Error(`Item ${item.itemCode} requires batchId (trackingType = 'batch')`);
    }
    if (item.trackingType === 'serial' && !m.serialId) {
      throw new Error(`Item ${item.itemCode} requires serialId (trackingType = 'serial')`);
    }
    if (item.trackingType === 'serial' && m.quantity !== 1) {
      throw new Error(`Serial-tracked item ${item.itemCode} must be moved in qty of 1`);
    }
  }

  /** SELECT FOR UPDATE on the balance row — prevents concurrent WAC corruption */
  private async lockBalance(
    tx: TX,
    m: Pick<StockMovement, 'companyId' | 'plantId' | 'warehouseId' | 'itemId'>
  ): Promise<StockBalance | null> {
    const [row] = await tx
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.companyId, m.companyId),
          eq(stockBalances.plantId, m.plantId),
          eq(stockBalances.warehouseId, m.warehouseId),
          eq(stockBalances.itemId, m.itemId)
        )
      )
      .for('update');
    return row ?? null;
  }

  private async updateBalance(
    tx: TX,
    m: Pick<StockMovement, 'companyId' | 'plantId' | 'warehouseId' | 'itemId' | 'postingDate'>,
    direction: 'IN' | 'OUT',
    quantityInPrimaryUom: number,
    valuationRatePaise: number,
    valuationAmountPaise: number,
    currentBalance: StockBalance | null
  ): Promise<StockBalance> {
    const existing = {
      qty: parseFloat(currentBalance?.quantityOnHand ?? '0'),
      value: currentBalance?.valuationAmountPaise ?? 0,
      rate: currentBalance?.valuationRatePaise ?? 0,
    };

    let newQty: number;
    let newRate: number;
    let newValue: number;

    if (direction === 'IN') {
      const wac = this.valuation.computeNewWac(
        existing.qty, existing.value,
        quantityInPrimaryUom, valuationAmountPaise
      );
      newQty = existing.qty + quantityInPrimaryUom;
      newRate = wac.newRatePaise;
      newValue = wac.newAmountPaise;
    } else {
      const after = this.valuation.applyOutward(
        existing.qty, existing.value, existing.rate, quantityInPrimaryUom
      );
      newQty = after.newQty;
      newRate = after.newRatePaise;
      newValue = after.newValuePaise;
    }

    const now = new Date();

    // UPSERT — create balance row on first movement for this item+warehouse
    const [newBalance] = await tx
      .insert(stockBalances)
      .values({
        companyId: m.companyId,
        plantId: m.plantId,
        warehouseId: m.warehouseId,
        itemId: m.itemId,
        quantityOnHand: newQty.toString(),
        quantityReserved: currentBalance?.quantityReserved ?? '0',
        quantityOrdered: currentBalance?.quantityOrdered ?? '0',
        valuationRatePaise: newRate,
        valuationAmountPaise: newValue,
        lastMovementAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          stockBalances.companyId,
          stockBalances.plantId,
          stockBalances.warehouseId,
          stockBalances.itemId,
        ],
        set: {
          quantityOnHand: newQty.toString(),
          valuationRatePaise: newRate,
          valuationAmountPaise: newValue,
          lastMovementAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!newBalance) throw new Error('stock_balances upsert returned no row');
    return newBalance;
  }

  private async updateSerialStatus(
    tx: TX,
    serialId: string,
    direction: 'IN' | 'OUT',
    warehouseId: string
  ): Promise<void> {
    await tx
      .update(itemSerials)
      .set({
        currentStatus: direction === 'IN' ? 'in_stock' : 'issued',
        currentWarehouseId: direction === 'IN' ? warehouseId : null,
        updatedAt: new Date(),
      })
      .where(eq(itemSerials.id, serialId));
  }
}

// ─── Reversal movement type map ────────────────────────────────────────────
//
// Each movementType has a corresponding reversal type (the mirror direction).

const REVERSAL_MAP: Partial<Record<MovementType, MovementType>> = {
  purchase_receipt:     'return_to_vendor',
  return_to_vendor:     'purchase_receipt',
  production_receipt:   'issue_to_production',
  issue_to_production:  'production_receipt',
  transfer_receipt:     'transfer_issue',
  transfer_issue:       'transfer_receipt',
  sales_delivery:       'return_from_customer',
  return_from_customer: 'sales_delivery',
  opening_balance:      'adjustment_out',
  adjustment_in:        'adjustment_out',
  adjustment_out:       'adjustment_in',
  by_product_receipt:   'scrap_write_off',
  subcon_receipt:       'subcon_issue',
  subcon_issue:         'subcon_receipt',
  sample_issue:         'adjustment_in',
  scrap_write_off:      'adjustment_in',
};
