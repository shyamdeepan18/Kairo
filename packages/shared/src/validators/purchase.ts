import { z } from 'zod';

// ─── Shared field helpers ──────────────────────────────────────────────────

const uuid = z.string().uuid();
const paise = z.number().int();              // money in paise (can be 0)
const paisePos = z.number().int().nonnegative();
const qty = z.number().positive();
const isoDate = z.string().min(8);           // 'YYYY-MM-DD'

// ─── Supplier ───────────────────────────────────────────────────────────────

export const supplierCreateSchema = z.object({
  companyId: uuid,
  supplierCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  legalName: z.string().max(255).optional(),
  supplierType: z
    .enum(['registered', 'unregistered', 'composition', 'sez', 'import', 'government'])
    .default('registered'),
  gstin: z.string().length(15).optional(),
  pan: z.string().length(10).optional(),
  stateCode: z.string().length(2).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(6).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  creditLimitPaise: paisePos.default(0),
});

export const supplierUpdateSchema = supplierCreateSchema.partial().omit({ companyId: true });

// ─── Generic document line ──────────────────────────────────────────────────

const docLineSchema = z.object({
  itemId: uuid,
  description: z.string().optional(),
  quantity: qty,
  uom: z.string().min(1).max(20),
  ratePaise: paisePos,
  discountPercent: z.number().min(0).max(100).default(0),
  discountPaise: paisePos.default(0),
  taxCodeId: uuid.optional(),
  hsnSacCode: z.string().max(10).optional(),
  warehouseId: uuid.optional(),
});

const docHeaderBase = z.object({
  companyId: uuid,
  plantId: uuid,
  postingDate: isoDate,
  remarks: z.string().optional(),
});

// ─── Purchase Requisition ─────────────────────────────────────────────────

export const prCreateSchema = docHeaderBase.extend({
  requiredByDate: isoDate.optional(),
  purpose: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: uuid,
        description: z.string().optional(),
        quantity: qty,
        uom: z.string().min(1).max(20),
        requiredByDate: isoDate.optional(),
        estimatedRatePaise: paisePos.default(0),
        warehouseId: uuid.optional(),
        suggestedSupplierId: uuid.optional(),
      })
    )
    .min(1),
});

// ─── Purchase Order ──────────────────────────────────────────────────────────

export const poCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  requisitionId: uuid.optional(),
  supplierRef: z.string().max(100).optional(),
  expectedDeliveryDate: isoDate.optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  deliveryWarehouseId: uuid.optional(),
  placeOfSupply: z.string().length(2).optional(),
  isReverseCharge: z.boolean().default(false),
  lines: z.array(docLineSchema.extend({ requisitionLineId: uuid.optional() })).min(1),
});

// ─── Goods Receipt Note ──────────────────────────────────────────────────────

export const grnCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  poId: uuid.optional(),
  warehouseId: uuid,
  supplierDcNo: z.string().max(50).optional(),
  supplierDcDate: isoDate.optional(),
  gateEntryNo: z.string().max(50).optional(),
  vehicleNo: z.string().max(20).optional(),
  lines: z
    .array(
      docLineSchema
        .omit({ quantity: true })
        .extend({
          poLineId: uuid.optional(),
          receivedQty: qty,
          acceptedQty: qty,
          rejectedQty: z.number().nonnegative().default(0),
          batchId: uuid.optional(),
          batchNumber: z.string().max(100).optional(),
          rejectionReason: z.string().optional(),
        })
    )
    .min(1),
});

// ─── Purchase Invoice ────────────────────────────────────────────────────────

export const purchaseInvoiceCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  poId: uuid.optional(),
  supplierInvoiceNumber: z.string().min(1).max(50),
  supplierInvoiceDate: isoDate,
  dueDate: isoDate.optional(),
  placeOfSupply: z.string().length(2).optional(),
  isReverseCharge: z.boolean().default(false),
  supplierIrn: z.string().max(64).optional(),
  itcEligible: z.boolean().default(true),
  lines: z
    .array(docLineSchema.extend({ poLineId: uuid.optional(), grnLineId: uuid.optional() }))
    .min(1),
});

// ─── Purchase Payment ────────────────────────────────────────────────────────

export const purchasePaymentCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  paymentMode: z
    .enum(['cash', 'bank_transfer', 'cheque', 'upi', 'card', 'adjustment'])
    .default('bank_transfer'),
  instrumentNo: z.string().max(50).optional(),
  instrumentDate: isoDate.optional(),
  bankReference: z.string().max(100).optional(),
  paidAmountPaise: z.number().int().positive(),
  tdsAmountPaise: paisePos.default(0),
  allocations: z
    .array(z.object({ invoiceId: uuid, allocatedAmountPaise: z.number().int().positive() }))
    .default([]),
});

// ─── Status transition (submit / approve / reject / cancel) ─────────────────

export const transitionSchema = z.object({
  remarks: z.string().optional(),
});

// ─── Inferred input types ────────────────────────────────────────────────────

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PrCreateInput = z.infer<typeof prCreateSchema>;
export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;
export type PurchaseInvoiceCreateInput = z.infer<typeof purchaseInvoiceCreateSchema>;
export type PurchasePaymentCreateInput = z.infer<typeof purchasePaymentCreateSchema>;
