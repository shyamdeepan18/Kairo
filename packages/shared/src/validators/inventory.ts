import { z } from 'zod';

export const stockAdjustmentLineSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().optional(),
  movementType: z.enum(['adjustment_in', 'adjustment_out']),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(20),
  valuationRatePaise: z.number().int().nonnegative().optional(),
});

export const stockAdjustmentCreateSchema = z.object({
  plantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adjustmentType: z.enum(['physical_count', 'write_off', 'opening_balance', 'other']).default('physical_count'),
  reason: z.string().optional(),
  remarks: z.string().optional(),
  lines: z.array(stockAdjustmentLineSchema).min(1),
}).strict();

export const stockTransferLineSchema = z.object({
  itemId: z.string().uuid(),
  description: z.string().optional(),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(20),
  valuationRatePaise: z.number().int().nonnegative().optional(),
  batchId: z.string().uuid().optional(),
});

export const stockTransferCreateSchema = z.object({
  plantId: z.string().uuid().optional(), // For backwards compatibility
  fromPlantId: z.string().uuid().optional(),
  toPlantId: z.string().uuid().optional(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transferType: z.enum(['direct', 'in_transit']).default('direct'),
  reason: z.string().optional(),
  remarks: z.string().optional(),
  vehicleNo: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  lrNumber: z.string().optional(),
  lines: z.array(stockTransferLineSchema).min(1),
}).strict();

// A draft transfer edit replaces the header + lines wholesale — same shape as create.
export const stockTransferUpdateSchema = stockTransferCreateSchema;

// Inward receipt for an in-transit transfer. Omit `lines` to receive every line's
// full remaining quantity; otherwise pass only the lines being received now.
export const stockTransferReceiveLineSchema = z.object({
  lineId: z.string().uuid(),
  receivedQty: z.number().positive(),
});

export const stockTransferReceiveSchema = z.object({
  lines: z.array(stockTransferReceiveLineSchema).min(1).optional(),
}).strict();

export type StockAdjustmentLineInput = z.infer<typeof stockAdjustmentLineSchema>;
export type StockAdjustmentCreateInput = z.infer<typeof stockAdjustmentCreateSchema>;

export const adminStockAdjustmentOverrideSchema = z.object({
  plantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  itemId: z.string().uuid(),
  movementType: z.enum(['adjustment_in', 'adjustment_out', 'opening_balance']),
  quantity: z.number().positive(),
  valuationRatePaise: z.number().int().nonnegative().optional(),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonCode: z.enum([
    'opening_stock_audit',
    'physical_count_variance',
    'damage_write_off',
    'expiry_write_off',
    'production_variance_correction',
  ]),
  justification: z.string().min(20, 'Justification must be at least 20 characters explaining the business audit reason'),
  referenceDocNumber: z.string().max(100).optional(),
}).strict();

export type AdminStockAdjustmentOverrideInput = z.infer<typeof adminStockAdjustmentOverrideSchema>;
export type StockTransferLineInput = z.infer<typeof stockTransferLineSchema>;
export type StockTransferCreateInput = z.infer<typeof stockTransferCreateSchema>;
export type StockTransferUpdateInput = z.infer<typeof stockTransferUpdateSchema>;
export type StockTransferReceiveInput = z.infer<typeof stockTransferReceiveSchema>;
