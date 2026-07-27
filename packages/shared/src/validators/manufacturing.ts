import { z } from 'zod';

const uuid = z.string().uuid();
const paisePos = z.number().int().nonnegative();
const qty = z.number().positive();
const isoDate = z.string().min(8);

// ─── Work center ──────────────────────────────────────────────────────────

// companyId is derived from the trusted tenant context, never a client input.
export const workCenterCreateSchema = z.object({
  plantId: uuid.optional(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(255),
  capacityMinsPerDay: z.number().int().nonnegative().default(0),
  labourRatePaise: paisePos.default(0),
  overheadRatePaise: paisePos.default(0),
}).strict();

// ─── Formula (BOM / recipe) ─────────────────────────────────────────────────

export const formulaCreateSchema = z.object({
  code: z.string().min(1).max(50),
  version: z.string().max(10).default('1'),
  name: z.string().min(1).max(255),
  manufacturingType: z.enum(['discrete', 'process']),
  batchSize: qty,
  baseUom: z.string().min(1).max(20),
  effectiveFrom: isoDate.optional(),
  effectiveTo: isoDate.optional(),
  remarks: z.string().optional(),
  inputs: z
    .array(
      z.object({
        itemId: uuid,
        qtyPerBatch: qty,
        uom: z.string().min(1).max(20),
        scrapPercent: z.number().min(0).max(100).default(0),
        isOptional: z.boolean().default(false),
        substituteGroup: z.string().max(30).optional(),
      })
    )
    .min(1),
  outputs: z
    .array(
      z.object({
        itemId: uuid,
        qtyPerBatch: qty,
        uom: z.string().min(1).max(20),
        outputType: z.enum(['primary', 'co_product', 'by_product']).default('primary'),
        costAllocationBasis: z.enum(['percent', 'by_weight', 'by_value', 'nrv']).default('by_value'),
        costAllocationPercent: z.number().min(0).max(100).default(0),
        marketRatePaise: paisePos.default(0),
      })
    )
    .min(1),
  operations: z
    .array(
      z.object({
        sequence: z.number().int().nonnegative(),
        workCenterId: uuid.optional(),
        operationName: z.string().min(1).max(255),
        setupMins: z.number().int().nonnegative().default(0),
        runMinsPerUnit: z.number().nonnegative().default(0),
        overheadRatePaise: paisePos.default(0),
      })
    )
    .default([]),
})
  .strict()
  .refine((f) => f.manufacturingType !== 'discrete' || f.outputs.length === 1, {
    message: 'Discrete formulas must have exactly one output',
    path: ['outputs'],
  })
  .refine((f) => f.outputs.filter((o) => o.outputType === 'primary').length === 1, {
    message: 'Exactly one primary output is required',
    path: ['outputs'],
  });

// ─── Production order ─────────────────────────────────────────────────────

export const productionOrderCreateSchema = z.object({
  plantId: uuid,
  postingDate: isoDate,
  formulaId: uuid,
  plannedQty: qty,
  targetWarehouseId: uuid.optional(),
  sourceWarehouseId: uuid.optional(),
  expectedStartDate: isoDate.optional(),
  expectedEndDate: isoDate.optional(),
  remarks: z.string().optional(),
}).strict();

// ─── Issue materials to an order ────────────────────────────────────────────

export const issueMaterialsSchema = z.object({
  postingDate: isoDate.optional(),
  lines: z
    .array(
      z.object({
        materialId: uuid.optional(),  // production_order_materials.id (preferred)
        itemId: uuid,
        quantity: qty,
        uom: z.string().min(1).max(20),
        warehouseId: uuid.optional(),
        batchId: uuid.optional(),
      })
    )
    .min(1),
}).strict();

// ─── Record outputs (production receipt) ────────────────────────────────────

export const recordOutputSchema = z.object({
  postingDate: isoDate.optional(),
  standardCostPaise: paisePos.optional(),
  outputs: z
    .array(
      z.object({
        outputId: uuid.optional(),    // production_order_outputs.id (preferred)
        itemId: uuid,
        producedQty: qty,
        uom: z.string().min(1).max(20),
        warehouseId: uuid.optional(),
        batchId: uuid.optional(),
        batchNumber: z.string().max(100).optional(),
      })
    )
    .min(1),
}).strict();

// ─── Inferred input types ────────────────────────────────────────────────────

export type WorkCenterCreateInput = z.infer<typeof workCenterCreateSchema>;
export type FormulaCreateInput = z.infer<typeof formulaCreateSchema>;
export type ProductionOrderCreateInput = z.infer<typeof productionOrderCreateSchema>;
export type IssueMaterialsInput = z.infer<typeof issueMaterialsSchema>;
export type RecordOutputInput = z.infer<typeof recordOutputSchema>;
