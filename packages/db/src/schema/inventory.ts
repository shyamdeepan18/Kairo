import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, date, numeric, jsonb, index, unique, smallint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';
import { plants, warehouses } from './company.js';

// ─── Movement types ────────────────────────────────────────────────────────
//
// INWARD movements increase stock; OUTWARD movements decrease it.
// Direction is determined by MOVEMENT_DIRECTION map — never passed manually.

export type MovementType =
  // Inward
  | 'purchase_receipt'      // GRN from vendor
  | 'production_receipt'    // finished / semi-finished goods from production order
  | 'transfer_receipt'      // stock transfer received from another warehouse/plant
  | 'return_from_customer'  // sales return accepted back into stock
  | 'opening_balance'       // initial stock entry on go-live
  | 'adjustment_in'         // physical stock count surplus
  | 'by_product_receipt'    // process mfg: co-product or by-product receipt
  | 'subcon_receipt'        // subcontracting / job-work finished goods received
  // Outward
  | 'issue_to_production'   // RM / packing material issued to production order
  | 'sales_delivery'        // goods dispatched to customer
  | 'transfer_issue'        // stock transfer sent to another warehouse/plant
  | 'return_to_vendor'      // purchase return
  | 'scrap_write_off'       // scrap or inventory write-off
  | 'adjustment_out'        // physical stock count deficit
  | 'sample_issue'          // quality sampling
  | 'subcon_issue';         // material sent out for subcontracting / job-work

export const MOVEMENT_DIRECTION: Record<MovementType, 'IN' | 'OUT'> = {
  purchase_receipt:      'IN',
  production_receipt:    'IN',
  transfer_receipt:      'IN',
  return_from_customer:  'IN',
  opening_balance:       'IN',
  adjustment_in:         'IN',
  by_product_receipt:    'IN',
  subcon_receipt:        'IN',
  issue_to_production:   'OUT',
  sales_delivery:        'OUT',
  transfer_issue:        'OUT',
  return_to_vendor:      'OUT',
  scrap_write_off:       'OUT',
  adjustment_out:        'OUT',
  sample_issue:          'OUT',
  subcon_issue:          'OUT',
};

// ─── Item types ────────────────────────────────────────────────────────────

export type ItemType =
  | 'raw_material'    // purchased input material
  | 'semi_finished'   // intermediate product (WIP)
  | 'finished'        // saleable finished product
  | 'consumable'      // factory consumables (oils, rags) — expensed on issue
  | 'packing'         // packing material
  | 'asset'           // capital goods (tracked but not inventory)
  | 'service';        // service items — no stock

// ─── Tracking types ────────────────────────────────────────────────────────
//
// none   — quantity only (most raw materials)
// batch  — batch / lot number required (process mfg, pharmaceuticals, food)
// serial — individual serial number per unit (machinery, electronics)

export type TrackingType = 'none' | 'batch' | 'serial';

// ─── Valuation methods ─────────────────────────────────────────────────────
//
// weighted_average is the Indian SME default (ICAI guidance).
// fifo is available per-item for specific industries.

export type ValuationMethod = 'weighted_average' | 'fifo';

// ─── QC status ────────────────────────────────────────────────────────────

export type QcStatus = 'pending' | 'approved' | 'rejected' | 'quarantine';

// ─── Table: unit_of_measures ───────────────────────────────────────────────
//
// Global master — not company-scoped. Standard units seeded on install.
// Companies can add custom UOMs (e.g. 'DRUM', 'BALE', 'BUNDLE').

export const unitOfMeasures = pgTable(
  'unit_of_measures',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    /** e.g. 'KG', 'LTR', 'PCS', 'MTR', 'BOX' */
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    /** Dimension class — prevents nonsensical conversions (kg → metres) */
    type: varchar('type', { length: 30 }).notNull(),
    // 'weight' | 'volume' | 'length' | 'area' | 'quantity' | 'time' | 'other'
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  }
);

// ─── Table: uom_conversions ────────────────────────────────────────────────
//
// Multiply `fromUom` quantity by `factor` to get `toUom` quantity.
// Examples:
//   KG  → G     factor = 1000
//   MTR → CM    factor = 100
//   LTR → ML    factor = 1000
//   KG  → LTR   factor = 0.9434 (item-specific, e.g. for a specific oil)
//
// Item-scoped rows (itemId set) override global rows for that item.
// Company-scoped rows (companyId set) are invisible to other companies.

export const uomConversions = pgTable(
  'uom_conversions',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    /** null = global conversion visible to all companies */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    /** null = applies to all items of this UOM type */
    itemId: uuid('item_id'), // FK added after items table defined (circular)
    fromUom: varchar('from_uom', { length: 20 }).notNull().references(() => unitOfMeasures.code),
    toUom: varchar('to_uom', { length: 20 }).notNull().references(() => unitOfMeasures.code),
    /** quantity in toUom = quantity in fromUom × factor */
    factor: numeric('factor', { precision: 18, scale: 8 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueConversion: unique('uom_conversions_uq').on(t.companyId, t.itemId, t.fromUom, t.toUom),
    itemIdx: index('uom_conversions_item_idx').on(t.itemId),
  })
);

// ─── Table: item_groups ────────────────────────────────────────────────────
//
// Hierarchical classification (e.g. Raw Material > Steel > Flat Products).
// Used for reporting, pricing rules, and default settings inheritance.

export const itemGroups = pgTable(
  'item_groups',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    parentId: uuid('parent_id'), // self-ref — cannot use FK here easily in Drizzle
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('item_groups_code_uq').on(t.companyId, t.code),
    companyIdx: index('item_groups_company_idx').on(t.companyId),
  })
);

// ─── Table: items ──────────────────────────────────────────────────────────
//
// The items master — shared across plants within a company.
// Plant-specific settings (default warehouse, reorder points) live elsewhere.
//
// Money fields (standardCostPaise) are in paise — never float.

export const items = pgTable(
  'items',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** e.g. 'RM-0001', 'FG-A100' — unique per company */
    itemCode: varchar('item_code', { length: 50 }).notNull(),
    itemName: varchar('item_name', { length: 255 }).notNull(),
    description: text('description'),

    itemType: varchar('item_type', { length: 30 }).notNull(),
    // ItemType: 'raw_material' | 'semi_finished' | 'finished' | 'consumable' | 'packing' | 'asset' | 'service'

    itemGroupId: uuid('item_group_id').references(() => itemGroups.id),

    // ── Units ──────────────────────────────────────────────────────────────
    /** Primary (stock) UOM — all stock balances maintained in this UOM */
    primaryUom: varchar('primary_uom', { length: 20 })
      .notNull()
      .references(() => unitOfMeasures.code),
    /**
     * Secondary UOM for purchase / sales (e.g. buy in BOX, stock in PCS).
     * null = single UOM item.
     */
    secondaryUom: varchar('secondary_uom', { length: 20 })
      .references(() => unitOfMeasures.code),
    /**
     * 1 secondaryUom = conversionFactor primaryUom units
     * e.g. 1 BOX = 12 PCS → conversionFactor = 12
     */
    conversionFactor: numeric('conversion_factor', { precision: 18, scale: 6 }),

    // ── Tax ───────────────────────────────────────────────────────────────
    /** HSN (goods) or SAC (services) code */
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    /** Default tax code for this item — overridable per document line */
    defaultTaxCodeId: uuid('default_tax_code_id'),
    /** Barcode / EAN / UPC for scanning */
    barcode: varchar('barcode', { length: 50 }),

    // ── Inventory behaviour ────────────────────────────────────────────────
    /** false for service items — no stock movements */
    isStockItem: boolean('is_stock_item').default(true).notNull(),
    /** TrackingType: 'none' | 'batch' | 'serial' */
    trackingType: varchar('tracking_type', { length: 10 }).default('none').notNull(),
    /** ValuationMethod: 'weighted_average' | 'fifo'. Default: weighted_average */
    valuationMethod: varchar('valuation_method', { length: 20 }).default('weighted_average').notNull(),
    /** Shelf life in days for batch expiry auto-calculation */
    shelfLifeDays: integer('shelf_life_days').default(0).notNull(),
    /** Gross weight per primary UOM unit */
    grossWeight: numeric('gross_weight', { precision: 12, scale: 4 }),
    /** Weight UOM (e.g. KG, G, LB) */
    weightUom: varchar('weight_uom', { length: 20 }),
    /** Whether incoming goods require QC inspection before stock release */
    isQcRequired: boolean('is_qc_required').default(false).notNull(),
    /** GAP 6: Catch-Weight Dual UOM */
    isCatchWeight: boolean('is_catch_weight').default(false).notNull(),
    catchWeightTolerancePct: numeric('catch_weight_tolerance_pct', { precision: 5, scale: 2 }).default('0').notNull(),

    // ── Pricing & Costing ──────────────────────────────────────────────────
    /** Standard cost in paise per primaryUom unit (for variance analysis) */
    standardCostPaise: integer('standard_cost_paise').default(0).notNull(),
    /** Default selling price / list price in paise */
    sellingPricePaise: integer('selling_price_paise').default(0).notNull(),
    /** Minimum selling price floor in paise (blocks discounts below floor) */
    minSellingPricePaise: integer('min_selling_price_paise').default(0).notNull(),
    /** Standard / last purchase price in paise */
    purchaseRatePaise: integer('purchase_rate_paise').default(0).notNull(),

    // ── Reorder & Stock Limits ─────────────────────────────────────────────
    reorderLevelQty: numeric('reorder_level_qty', { precision: 18, scale: 4 }).default('0').notNull(),
    reorderQty: numeric('reorder_qty', { precision: 18, scale: 4 }).default('0').notNull(),
    safetyStockQty: numeric('safety_stock_qty', { precision: 18, scale: 4 }).default('0').notNull(),
    maxStockLevel: numeric('max_stock_level', { precision: 18, scale: 4 }).default('0').notNull(),
    /** Days from PO to expected delivery */
    leadTimeDays: integer('lead_time_days').default(0).notNull(),
    minOrderQty: numeric('min_order_qty', { precision: 18, scale: 4 }).default('1').notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('items_code_company_uq').on(t.companyId, t.itemCode),
    companyIdx: index('items_company_idx').on(t.companyId),
    nameIdx: index('items_name_idx').on(t.companyId, t.itemName),
  })
);

// ─── Table: item_batches ───────────────────────────────────────────────────
//
// One row per batch / lot number for a given item.
// Created when a batch is first received (GRN) or produced (production receipt).
//
// Used by both batch-tracked and lot-tracked items (trackingType = 'batch').
// Process manufacturing: batchNumber = production batch (e.g. 'BATCH-2024-0012').
// Discrete manufacturing: batchNumber = supplier lot number.

export const itemBatches = pgTable(
  'item_batches',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),

    /** Unique batch / lot number within item (may include supplier's batch ref) */
    batchNumber: varchar('batch_number', { length: 100 }).notNull(),
    /** Free-text supplier batch reference for traceability */
    supplierBatchRef: varchar('supplier_batch_ref', { length: 100 }),

    manufactureDate: date('manufacture_date'),
    expiryDate: date('expiry_date'),

    /** QcStatus: 'pending' | 'approved' | 'rejected' | 'quarantine' */
    qcStatus: varchar('qc_status', { length: 20 }).default('approved').notNull(),

    /**
     * Arbitrary batch properties — process mfg needs: purity %, moisture %,
     * viscosity, density, particle size, etc.  Discrete mfg: heat number, etc.
     * Schema is open; application validates per item type.
     */
    properties: jsonb('properties').$type<Record<string, unknown>>(),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueBatch: unique('item_batches_number_uq').on(t.companyId, t.itemId, t.batchNumber),
    itemIdx: index('item_batches_item_idx').on(t.itemId),
    expiryIdx: index('item_batches_expiry_idx').on(t.expiryDate),
  })
);

// ─── Table: item_serials ───────────────────────────────────────────────────
//
// One row per individual serialised unit.
// Created on GRN for purchased items; on production receipt for manufactured items.
// Status transitions: in_stock → issued/delivered → returned/scrapped.

export const itemSerials = pgTable(
  'item_serials',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'restrict' }),

    serialNumber: varchar('serial_number', { length: 100 }).notNull(),

    /** Current lifecycle status */
    currentStatus: varchar('current_status', { length: 20 }).default('in_stock').notNull(),
    // 'in_stock' | 'issued' | 'delivered' | 'returned' | 'scrapped'

    currentWarehouseId: uuid('current_warehouse_id').references(() => warehouses.id),

    /** Document that received this serial (GRN or production order) */
    receiptDocumentType: varchar('receipt_document_type', { length: 50 }),
    receiptDocumentId: uuid('receipt_document_id'),
    receiptDocumentNumber: varchar('receipt_document_number', { length: 50 }),

    warrantyExpiry: date('warranty_expiry'),
    /** AMC, calibration dates, asset tag, etc. */
    properties: jsonb('properties').$type<Record<string, unknown>>(),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueSerial: unique('item_serials_number_uq').on(t.companyId, t.itemId, t.serialNumber),
    itemIdx: index('item_serials_item_idx').on(t.itemId),
    statusIdx: index('item_serials_status_idx').on(t.companyId, t.currentStatus),
  })
);

// ─── Table: stock_ledger_entries ───────────────────────────────────────────
//
// THE inventory source of truth — append-only, never updated or deleted.
// Every stock movement (GRN, issue, delivery, adjustment, transfer, production)
// creates one or more SLE rows.
//
// Invariants:
//   • quantity is always positive; direction (IN/OUT) comes from movementType
//   • valuationRatePaise is the per-primaryUom-unit cost in paise
//   • valuationAmountPaise = ROUND(quantityInPrimaryUom × valuationRatePaise)
//   • Reversals create a mirror SLE with isReversal=true and cross-link FKs
//
// Quantity is stored in two forms:
//   • quantity / uom          — as entered on the source document
//   • quantityInPrimaryUom   — always in items.primaryUom (for balance calcs)
//
// All GL impact is posted by PostingEngine using SLE values — do not
// duplicate accounting logic here.

export const stockLedgerEntries = pgTable(
  'stock_ledger_entries',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),

    // ── Source document ────────────────────────────────────────────────────
    /** e.g. 'purchase.grn', 'sales.delivery', 'manufacturing.order', 'stock.adjustment' */
    documentType: varchar('document_type', { length: 100 }).notNull(),
    documentId: uuid('document_id').notNull(),
    documentNumber: varchar('document_number', { length: 50 }).notNull(),
    /** Line number on the source document (null for header-level movements) */
    documentLineNumber: integer('document_line_number'),

    // ── Movement ──────────────────────────────────────────────────────────
    movementType: varchar('movement_type', { length: 50 }).notNull(),
    // MovementType — IN or OUT determined by MOVEMENT_DIRECTION[movementType]

    /** Quantity as entered on the document (in documentUom) */
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    /** Quantity converted to items.primaryUom — used for balance and valuation */
    quantityInPrimaryUom: numeric('quantity_in_primary_uom', { precision: 18, scale: 4 }).notNull(),

    // ── Valuation ─────────────────────────────────────────────────────────
    /**
     * Per-primaryUom-unit cost in paise.
     *   Inward: the purchase price / standard cost / produced cost
     *   Outward: snapshot of the WAC at time of movement (never changes after insert)
     */
    valuationRatePaise: integer('valuation_rate_paise').notNull(),
    /**
     * Total value of this movement in paise.
     * = ROUND(quantityInPrimaryUom × valuationRatePaise)
     * Stored explicitly to avoid recomputation drift.
     */
    valuationAmountPaise: integer('valuation_amount_paise').notNull(),

    // ── Tracking ──────────────────────────────────────────────────────────
    batchId: uuid('batch_id').references(() => itemBatches.id),
    serialId: uuid('serial_id').references(() => itemSerials.id),

    // ── Context ───────────────────────────────────────────────────────────
    costCentreId: uuid('cost_centre_id'),
    /** Production order that triggered this movement (issue or receipt) */
    productionOrderId: uuid('production_order_id'),
    /** GAP 8: Project Accounting tag */
    projectId: uuid('project_id'),

    postingDate: date('posting_date').notNull(),
    fiscalYear: varchar('fiscal_year', { length: 5 }).notNull(),
    period: smallint('period').notNull(),

    remarks: text('remarks'),

    // ── Reversal linkage ──────────────────────────────────────────────────
    /** true for SLEs that reverse a previous movement */
    isReversal: boolean('is_reversal').default(false).notNull(),
    /** UUID of the reversal SLE that nullified this entry */
    reversedBy: uuid('reversed_by'),
    /** UUID of the original SLE that this entry reverses */
    reversalOf: uuid('reversal_of'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Primary lookup: item balance history
    itemDateIdx: index('sle_item_date_idx').on(t.companyId, t.itemId, t.postingDate),
    // Warehouse stock view
    whItemIdx: index('sle_wh_item_idx').on(t.companyId, t.warehouseId, t.itemId),
    // Source document trace (e.g. reverse all SLEs for a GRN)
    docIdx: index('sle_doc_idx').on(t.documentType, t.documentId),
    // Batch traceability
    batchIdx: index('sle_batch_idx').on(t.batchId),
    // Serial traceability
    serialIdx: index('sle_serial_idx').on(t.serialId),
    // FY/period for period-end reports
    fyPeriodIdx: index('sle_fy_period_idx').on(t.companyId, t.fiscalYear, t.period),
  })
);

// ─── Table: stock_balances ─────────────────────────────────────────────────
//
// Materialized running balance — updated atomically on every SLE insert.
// Never recomputed from scratch in normal operation (only in audit/fix runs).
//
// One row per (company, plant, warehouse, item). The unique constraint
// doubles as the "account key" for SELECT FOR UPDATE locking during movements.
//
// Valuation stores the current Weighted Average Cost:
//   valuationRatePaise  = current WAC per primaryUom unit
//   valuationAmountPaise = quantityOnHand × valuationRatePaise (before rounding)
//
// quantityReserved — commitments from open sales orders / production orders.
// quantityOrdered  — incoming on open purchase orders (informational).

export const stockBalances = pgTable(
  'stock_balances',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),

    /** Available in warehouse — can go negative only via explicit adjustment */
    quantityOnHand: numeric('quantity_on_hand', { precision: 18, scale: 4 }).default('0').notNull(),
    /** Committed to open sales orders / production orders — reduces available qty */
    quantityReserved: numeric('quantity_reserved', { precision: 18, scale: 4 }).default('0').notNull(),
    /** On open purchase orders — informational; increases expected supply */
    quantityOrdered: numeric('quantity_ordered', { precision: 18, scale: 4 }).default('0').notNull(),

    /** Current WAC per primaryUom unit in paise */
    valuationRatePaise: integer('valuation_rate_paise').default(0).notNull(),
    /** Total stock value in paise = quantityOnHand × valuationRatePaise */
    valuationAmountPaise: integer('valuation_amount_paise').default(0).notNull(),

    lastMovementAt: timestamp('last_movement_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueBalance: unique('stock_balances_key_uq').on(
      t.companyId, t.plantId, t.warehouseId, t.itemId
    ),
    companyItemIdx: index('stock_balances_company_item_idx').on(t.companyId, t.itemId),
    warehouseItemIdx: index('stock_balances_wh_item_idx').on(t.warehouseId, t.itemId),
  })
);

// ─── Table: stock_reservations ─────────────────────────────────────────────
//
// Tracks quantity committed to open documents (sales orders, production orders).
// Reservation is created when the document is approved; released when fulfilled
// or cancelled.
//
// stock_balances.quantityReserved = SUM of active reservations for that item+wh.
// These two must stay in sync — always update both in the same transaction.

export const stockReservations = pgTable(
  'stock_reservations',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),

    /** Document that created the reservation */
    documentType: varchar('document_type', { length: 100 }).notNull(),
    documentId: uuid('document_id').notNull(),
    documentNumber: varchar('document_number', { length: 50 }).notNull(),
    documentLineNumber: integer('document_line_number').notNull(),

    reservedQty: numeric('reserved_qty', { precision: 18, scale: 4 }).notNull(),
    fulfilledQty: numeric('fulfilled_qty', { precision: 18, scale: 4 }).default('0').notNull(),

    /** 'active' | 'fulfilled' | 'cancelled' | 'expired' */
    status: varchar('status', { length: 20 }).default('active').notNull(),
    /** Optional: reservation auto-expires at this time if not fulfilled */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index('stock_reservations_doc_idx').on(t.documentType, t.documentId),
    whItemIdx: index('stock_reservations_wh_item_idx').on(t.warehouseId, t.itemId, t.status),
    companyItemIdx: index('stock_reservations_company_item_idx').on(t.companyId, t.itemId),
  })
);

// ─── Table: stock_adjustments ──────────────────────────────────────────────
//
// Manual stock count surplus/deficit adjustments.
// Requires approval before stock + GL is posted.
// adjustment_in  → DR Inventory / CR Inventory Adjustment Account
// adjustment_out → DR Inventory Adjustment Account / CR Inventory

export const stockAdjustments = pgTable(
  'stock_adjustments',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    companyId: uuid('company_id').notNull().references(() => companies.id),
    plantId:   uuid('plant_id').notNull().references(() => plants.id),
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),

    documentNumber: varchar('document_number', { length: 50 }).notNull(),
    postingDate: date('posting_date').notNull(),
    fiscalYear: varchar('fiscal_year', { length: 5 }).notNull(),
    period: smallint('period').notNull(),

    /** 'physical_count' | 'write_off' | 'opening_balance' | 'other' */
    adjustmentType: varchar('adjustment_type', { length: 50 }).default('physical_count').notNull(),
    reason: text('reason'),
    remarks: text('remarks'),

    status: varchar('status', { length: 20 }).default('draft').notNull(),
    totalAmountPaise: integer('total_amount_paise').default(0).notNull(),

    journalEntryId: uuid('journal_entry_id'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),

    createdBy: uuid('created_by').notNull().references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('stock_adj_company_idx').on(t.companyId, t.status),
    dateIdx: index('stock_adj_date_idx').on(t.companyId, t.postingDate),
  })
);

export const stockAdjustmentLines = pgTable(
  'stock_adjustment_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    adjustmentId: uuid('adjustment_id').notNull().references(() => stockAdjustments.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),

    /** 'adjustment_in' or 'adjustment_out' — user chooses per line */
    movementType: varchar('movement_type', { length: 50 }).notNull(),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),

    /** Valuation rate at time of adjustment (WAC snapshot or entered) */
    valuationRatePaise: integer('valuation_rate_paise').default(0).notNull(),
    valuationAmountPaise: integer('valuation_amount_paise').default(0).notNull(),

    batchId: uuid('batch_id').references(() => itemBatches.id),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    adjIdx: index('stock_adj_lines_adj_idx').on(t.adjustmentId),
  })
);

// ─── Table: stock_transfers ─────────────────────────────────────────────────
//
// Intra-company stock transfer between warehouses.
// Requires approval before stock + GL is posted.
// Generates two SLE pairs: transfer_issue (OUT) from source, transfer_receipt (IN) to destination.

export const stockTransfers = pgTable(
  'stock_transfers',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    companyId: uuid('company_id').notNull().references(() => companies.id),
    plantId:   uuid('plant_id').notNull().references(() => plants.id),
    fromPlantId: uuid('from_plant_id').references(() => plants.id),
    toPlantId:   uuid('to_plant_id').references(() => plants.id),

    documentNumber: varchar('document_number', { length: 50 }).notNull(),
    postingDate: date('posting_date').notNull(),
    fiscalYear: varchar('fiscal_year', { length: 5 }).notNull(),
    period: smallint('period').notNull(),

    transferType: varchar('transfer_type', { length: 30 }).default('direct').notNull(),

    fromWarehouseId: uuid('from_warehouse_id').notNull().references(() => warehouses.id),
    toWarehouseId: uuid('to_warehouse_id').notNull().references(() => warehouses.id),

    reason: text('reason'),
    remarks: text('remarks'),
    vehicleNo: varchar('vehicle_no', { length: 30 }),
    driverName: varchar('driver_name', { length: 100 }),
    driverPhone: varchar('driver_phone', { length: 20 }),
    lrNumber: varchar('lr_number', { length: 50 }),

    status: varchar('status', { length: 20 }).default('draft').notNull(),
    totalAmountPaise: integer('total_amount_paise').default(0).notNull(),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedBy: uuid('submitted_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    dispatchedBy: uuid('dispatched_by').references(() => users.id),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    receivedBy: uuid('received_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectedBy: uuid('rejected_by').references(() => users.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),

    createdBy: uuid('created_by').notNull().references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('stock_tr_company_idx').on(t.companyId, t.status),
  })
);

export const stockTransferLines = pgTable(
  'stock_transfer_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    transferId: uuid('transfer_id').notNull().references(() => stockTransfers.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),

    valuationRatePaise: integer('valuation_rate_paise').default(0).notNull(),
    valuationAmountPaise: integer('valuation_amount_paise').default(0).notNull(),

    /** Cumulative quantity received inward at destination (for in-transit partial receipts) */
    receivedQty: numeric('received_qty', { precision: 18, scale: 4 }).default('0').notNull(),

    batchId: uuid('batch_id').references(() => itemBatches.id),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    trIdx: index('stock_tr_lines_tr_idx').on(t.transferId),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type UnitOfMeasure = typeof unitOfMeasures.$inferSelect;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ItemGroup = typeof itemGroups.$inferSelect;
export type ItemBatch = typeof itemBatches.$inferSelect;
export type NewItemBatch = typeof itemBatches.$inferInsert;
export type ItemSerial = typeof itemSerials.$inferSelect;
export type NewItemSerial = typeof itemSerials.$inferInsert;
export type StockLedgerEntry = typeof stockLedgerEntries.$inferSelect;
export type NewStockLedgerEntry = typeof stockLedgerEntries.$inferInsert;
export type StockBalance = typeof stockBalances.$inferSelect;
export type StockReservation = typeof stockReservations.$inferSelect;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type StockTransfer = typeof stockTransfers.$inferSelect;
