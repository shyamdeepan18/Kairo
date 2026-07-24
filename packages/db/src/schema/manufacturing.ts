import {
  pgTable, uuid, varchar, text, integer, bigint, boolean,
  timestamp, date, numeric, jsonb, index, unique, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, plants, warehouses } from './company.js';
import { users } from './auth.js';
import { items, itemBatches } from './inventory.js';

// ─── Phase 8 — Manufacturing (hybrid discrete + process) ────────────────────
//
// One data model for BOTH discrete (BOM / work orders) and process
// (recipe / batch) manufacturing — see PHASE8-MANUFACTURING-DESIGN.md.
//
// Core idea: a production definition has an INPUTS table AND an OUTPUTS table.
//   • Discrete BOM  = a formula with exactly ONE output row (the parent item).
//   • Process recipe = a formula with primary + co-product + by-product outputs.
// `manufacturingType` is a discriminator that selects BEHAVIOUR (cost allocation,
// variance), not tables. Discrete is process-with-one-output.
//
// Conventions match purchase.ts / sales.ts: money in bigint paise,
// quantities numeric(18,4), document header via documentHeader().

const money = (name: string) => bigint(name, { mode: 'number' });
const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });

const documentHeader = (docType: string) => ({
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id').notNull().references(() => plants.id),
  documentType: varchar('document_type', { length: 100 }).default(docType).notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  fiscalYear: varchar('fiscal_year', { length: 5 }),
  postingDate: date('posting_date').notNull(),
  remarks: text('remarks'),
  custom_data: jsonb('custom_data').$type<Record<string, unknown>>().default({}).notNull(),
  submittedBy: uuid('submitted_by').references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectedBy: uuid('rejected_by').references(() => users.id),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by').references(() => users.id),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Enums ───────────────────────────────────────────────────────────────────

export const manufacturingTypeEnum = pgEnum('manufacturing_type', ['discrete', 'process']);
export const outputTypeEnum = pgEnum('formula_output_type', ['primary', 'co_product', 'by_product']);
export const costAllocationBasisEnum = pgEnum('cost_allocation_basis', [
  'percent',    // fixed % per output (costAllocationPercent)
  'by_weight',  // pro-rata by produced quantity
  'by_value',   // pro-rata by market/selling value (default)
  'nrv',        // by-products at net realizable value; remainder to primary
]);
export const costGroupTypeEnum = pgEnum('cost_group_type', ['material', 'labor', 'machine', 'subcontracting', 'overhead']);

// ─── Table: cost_groups ───────────────────────────────────────────────────────

export const costGroups = pgTable(
  'cost_groups',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: costGroupTypeEnum('type').default('material').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('cost_groups_company_code_uq').on(t.companyId, t.code),
    companyIdx: index('cost_groups_company_idx').on(t.companyId),
  })
);

// ─── Table: work_centers ──────────────────────────────────────────────────────
//
// Cost + capacity master for routing operations (discrete; optional for process).

export const workCenters = pgTable(
  'work_centers',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id').references(() => plants.id),
    code: varchar('code', { length: 30 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    /** Available minutes per day for capacity planning */
    capacityMinsPerDay: integer('capacity_mins_per_day').default(0).notNull(),
    /** Labour cost per hour, paise */
    labourRatePaise: money('labour_rate_paise').default(0).notNull(),
    /** Overhead absorption per hour, paise */
    overheadRatePaise: money('overhead_rate_paise').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('work_centers_company_code_uq').on(t.companyId, t.code),
    companyIdx: index('work_centers_company_idx').on(t.companyId),
  })
);

// ─── Table: production_formulas (BOM / recipe) ─────────────────────────────────
//
// The unified production definition. documentType 'manufacturing.bom'.
// Discrete BOM and process recipe are the same table; they differ only in how
// many formula_outputs rows they carry.

export const productionFormulas = pgTable(
  'production_formulas',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    code: varchar('code', { length: 50 }).notNull(),
    version: varchar('version', { length: 10 }).default('1').notNull(),
    activeRevision: integer('active_revision').default(1).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    manufacturingType: manufacturingTypeEnum('manufacturing_type').notNull(),

    /** Base output quantity this formula's input quantities are stated per */
    batchSize: qty('batch_size').notNull(),
    baseUom: varchar('base_uom', { length: 20 }).notNull(),

    /** draft | submitted | approved | rejected | cancelled (StatusEngine 'manufacturing.bom') */
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),

    isActive: boolean('is_active').default(true).notNull(),
    remarks: text('remarks'),
    submittedBy: uuid('submitted_by').references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    // The manufacturing.bom lifecycle also transitions to rejected / cancelled —
    // StatusEngine.prepare() stamps these, so the columns must exist.
    rejectedBy: uuid('rejected_by').references(() => users.id),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('production_formulas_code_version_uq').on(t.companyId, t.code, t.version),
    companyIdx: index('production_formulas_company_idx').on(t.companyId),
    typeIdx: index('production_formulas_type_idx').on(t.companyId, t.manufacturingType),
  })
);

// ─── Table: engineering_change_orders ────────────────────────────────────────

export const engineeringChangeOrders = pgTable(
  'engineering_change_orders',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    formulaId: uuid('formula_id').notNull().references(() => productionFormulas.id, { onDelete: 'cascade' }),
    ecoNumber: varchar('eco_number', { length: 50 }).notNull(),
    reason: text('reason').notNull(),
    /** draft | pending | approved | rejected */
    status: varchar('status', { length: 20 }).default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueEco: unique('eco_number_uq').on(t.companyId, t.ecoNumber),
    formulaIdx: index('eco_formula_idx').on(t.formulaId),
  })
);

export const formulaInputs = pgTable(
  'formula_inputs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    formulaId: uuid('formula_id').notNull().references(() => productionFormulas.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    itemId: uuid('item_id').notNull().references(() => items.id),
    /** Quantity consumed per one batchSize of output */
    qtyPerBatch: qty('qty_per_batch').notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    /** Expected process loss on this input (added to required qty) */
    scrapPercent: numeric('scrap_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    isOptional: boolean('is_optional').default(false).notNull(),
    /** Inputs sharing a substitute group are interchangeable at issue time */
    substituteGroup: varchar('substitute_group', { length: 30 }),
    costGroupId: uuid('cost_group_id').references(() => costGroups.id),
  },
  (t) => ({ formulaIdx: index('formula_inputs_formula_idx').on(t.formulaId) })
);

export const formulaOutputs = pgTable(
  'formula_outputs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    formulaId: uuid('formula_id').notNull().references(() => productionFormulas.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    itemId: uuid('item_id').notNull().references(() => items.id),
    qtyPerBatch: qty('qty_per_batch').notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),
    /** primary | co_product | by_product. Discrete BOM = single 'primary' row. */
    outputType: outputTypeEnum('output_type').default('primary').notNull(),
    costAllocationBasis: costAllocationBasisEnum('cost_allocation_basis').default('by_value').notNull(),
    /** Used when basis = 'percent' */
    costAllocationPercent: numeric('cost_allocation_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    /** Used by 'by_value' / 'nrv' — market value per unit, paise */
    marketRatePaise: money('market_rate_paise').default(0).notNull(),
  },
  (t) => ({ formulaIdx: index('formula_outputs_formula_idx').on(t.formulaId) })
);

export const formulaOperations = pgTable(
  'formula_operations',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    formulaId: uuid('formula_id').notNull().references(() => productionFormulas.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    workCenterId: uuid('work_center_id').references(() => workCenters.id),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    setupMins: integer('setup_mins').default(0).notNull(),
    runMinsPerUnit: numeric('run_mins_per_unit', { precision: 12, scale: 4 }).default('0').notNull(),
    /** Overhead override for this operation (else uses work center rate), paise/hr */
    overheadRatePaise: money('overhead_rate_paise').default(0).notNull(),
    costGroupId: uuid('cost_group_id').references(() => costGroups.id),
  },
  (t) => ({ formulaIdx: index('formula_operations_formula_idx').on(t.formulaId) })
);

// ─── Table: production_orders ──────────────────────────────────────────────────
//
// An instance of a formula scaled by scaleFactor = plannedQty / batchSize.
// documentType 'manufacturing.order' (StatusEngine transitions already registered).

export const productionOrders = pgTable(
  'production_orders',
  {
    ...documentHeader('manufacturing.order'),
    formulaId: uuid('formula_id').notNull().references(() => productionFormulas.id),
    manufacturingType: manufacturingTypeEnum('manufacturing_type').notNull(),

    /** Quantity of the PRIMARY output to produce */
    plannedQty: qty('planned_qty').notNull(),
    /** Formula batch size captured at order time */
    batchSize: qty('batch_size').notNull(),
    /** plannedQty / batchSize — multiplies all exploded input/output/operation lines */
    scaleFactor: numeric('scale_factor', { precision: 18, scale: 6 }).notNull(),

    targetWarehouseId: uuid('target_warehouse_id').references(() => warehouses.id),
    sourceWarehouseId: uuid('source_warehouse_id').references(() => warehouses.id),

    expectedStartDate: date('expected_start_date'),
    expectedEndDate: date('expected_end_date'),
    actualStartDate: date('actual_start_date'),
    actualEndDate: date('actual_end_date'),

    /** Running WIP value: Σ issued material + labour + overhead − relieved on receipt, paise */
    wipValuePaise: money('wip_value_paise').default(0).notNull(),
  },
  (t) => ({
    uniqueNumber: unique('production_orders_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('production_orders_company_date_idx').on(t.companyId, t.postingDate),
    formulaIdx: index('production_orders_formula_idx').on(t.formulaId),
    statusIdx: index('production_orders_status_idx').on(t.companyId, t.status),
  })
);

export const productionOrderMaterials = pgTable(
  'production_order_materials',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    orderId: uuid('order_id').notNull().references(() => productionOrders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    formulaInputId: uuid('formula_input_id').references(() => formulaInputs.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    uom: varchar('uom', { length: 20 }).notNull(),
    /** Exploded requirement = formula qtyPerBatch × scaleFactor × (1 + scrap%) */
    requiredQty: qty('required_qty').notNull(),
    issuedQty: qty('issued_qty').default('0').notNull(),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    batchId: uuid('batch_id').references(() => itemBatches.id),
    /** Σ value of issues against this line at WAC, paise */
    issuedValuePaise: money('issued_value_paise').default(0).notNull(),
  },
  (t) => ({
    orderIdx: index('po_materials_order_idx').on(t.orderId),
    itemIdx: index('po_materials_item_idx').on(t.itemId),
  })
);

export const productionOrderOutputs = pgTable(
  'production_order_outputs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    orderId: uuid('order_id').notNull().references(() => productionOrders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    formulaOutputId: uuid('formula_output_id').references(() => formulaOutputs.id),
    itemId: uuid('item_id').notNull().references(() => items.id),
    uom: varchar('uom', { length: 20 }).notNull(),
    outputType: outputTypeEnum('output_type').default('primary').notNull(),
    expectedQty: qty('expected_qty').notNull(),
    producedQty: qty('produced_qty').default('0').notNull(),
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    batchId: uuid('batch_id').references(() => itemBatches.id),
    /** Cost relieved from WIP and capitalised into this output, paise */
    costAllocatedPaise: money('cost_allocated_paise').default(0).notNull(),
    /** Per-unit cost = costAllocatedPaise / producedQty, paise */
    valuationRatePaise: money('valuation_rate_paise').default(0).notNull(),
  },
  (t) => ({
    orderIdx: index('po_outputs_order_idx').on(t.orderId),
    itemIdx: index('po_outputs_item_idx').on(t.itemId),
  })
);

export const productionOrderOperations = pgTable(
  'production_order_operations',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    orderId: uuid('order_id').notNull().references(() => productionOrders.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    workCenterId: uuid('work_center_id').references(() => workCenters.id),
    operationName: varchar('operation_name', { length: 255 }).notNull(),
    /** pending | in_progress | completed | skipped */
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    plannedMins: numeric('planned_mins', { precision: 12, scale: 2 }).default('0').notNull(),
    actualMins: numeric('actual_mins', { precision: 12, scale: 2 }).default('0').notNull(),
    actualLabourPaise: money('actual_labour_paise').default(0).notNull(),
    actualOverheadPaise: money('actual_overhead_paise').default(0).notNull(),
  },
  (t) => ({ orderIdx: index('po_operations_order_idx').on(t.orderId) })
);

export const productionOrderCosts = pgTable(
  'production_order_costs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    orderId: uuid('order_id').notNull().references(() => productionOrders.id, { onDelete: 'cascade' }).unique(),
    materialPaise: money('material_paise').default(0).notNull(),
    labourPaise: money('labour_paise').default(0).notNull(),
    overheadPaise: money('overhead_paise').default(0).notNull(),
    /** Actual − expected (or actual − standard) at close, paise */
    variancePaise: money('variance_paise').default(0).notNull(),
    totalPaise: money('total_paise').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orderIdx: index('po_costs_order_idx').on(t.orderId) })
);

export const productionOrderCostDetails = pgTable(
  'production_order_cost_details',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    orderId: uuid('order_id').notNull().references(() => productionOrders.id, { onDelete: 'cascade' }),
    costGroupId: uuid('cost_group_id').notNull().references(() => costGroups.id),
    
    standardPaise: money('standard_paise').default(0).notNull(),
    actualPaise: money('actual_paise').default(0).notNull(),
    variancePaise: money('variance_paise').default(0).notNull(),
  },
  (t) => ({
    orderIdx: index('pocd_order_idx').on(t.orderId),
    costGroupIdx: index('pocd_cg_idx').on(t.costGroupId),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────────

export type WorkCenter = typeof workCenters.$inferSelect;
export type NewWorkCenter = typeof workCenters.$inferInsert;
export type ProductionFormula = typeof productionFormulas.$inferSelect;
export type NewProductionFormula = typeof productionFormulas.$inferInsert;
export type FormulaInput = typeof formulaInputs.$inferSelect;
export type FormulaOutput = typeof formulaOutputs.$inferSelect;
export type FormulaOperation = typeof formulaOperations.$inferSelect;
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type NewProductionOrder = typeof productionOrders.$inferInsert;
export type ProductionOrderMaterial = typeof productionOrderMaterials.$inferSelect;
export type ProductionOrderOutput = typeof productionOrderOutputs.$inferSelect;
export type ProductionOrderOperation = typeof productionOrderOperations.$inferSelect;
export type ProductionOrderCost = typeof productionOrderCosts.$inferSelect;
