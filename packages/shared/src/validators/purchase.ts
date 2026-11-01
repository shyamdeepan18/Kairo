import { z } from 'zod';

// ─── Shared field helpers ──────────────────────────────────────────────────

const uuid = z.string().uuid();
const paise = z.number().int();              // money in paise (can be 0)
const paisePos = z.number().int().nonnegative();
const qty = z.number().positive();
const isoDate = z.string().min(8);           // 'YYYY-MM-DD'

// ─── Supplier ───────────────────────────────────────────────────────────────

const supplierFields = z.object({
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

export const supplierCreateSchema = supplierFields.strict();
export const supplierUpdateSchema = supplierFields.partial().strict();

// ─── Generic document line ──────────────────────────────────────────────────

const docLineSchema = z.object({
  itemId: uuid,
  description: z.string().optional(),
  quantity: qty,
  uom: z.string().min(1).max(20),
  secondaryQty: qty.optional(),
  secondaryUom: z.string().min(1).max(20).optional(),
  ratePaise: paisePos,
  discountPercent: z.number().min(0).max(100).default(0),
  discountPaise: paisePos.default(0),
  taxCodeId: uuid.optional(),
  hsnSacCode: z.string().max(10).optional(),
  warehouseId: uuid.optional(),
});

// companyId is NOT a client input — it is derived from the trusted tenant
// context on the server. .strict() rejects unexpected keys; server-owned fields
// (id/companyId/audit) are removed by stripServerOwned() before parsing.
const docHeaderBase = z.object({
  plantId: uuid,
  postingDate: isoDate,
  projectId: uuid.optional(),
  remarks: z.string().optional(),
  discountPaise: paisePos.default(0).optional(),
  roundOffPaise: z.number().int().default(0).optional(),
  customData: z.record(z.unknown()).optional(),
  custom_data: z.record(z.unknown()).optional(),
}).strict();

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
  blanketPoId: uuid.optional(),
  supplierRef: z.string().max(100).optional(),
  expectedDeliveryDate: isoDate.optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  deliveryWarehouseId: uuid.optional(),
  placeOfSupply: z.string().length(2).optional(),
  isReverseCharge: z.boolean().default(false),
  lines: z.array(docLineSchema.extend({
    requisitionLineId: uuid.optional(),
    blanketPoLineId: uuid.optional(),
  })).min(1),
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
  landedChargesPaise: paisePos.default(0),
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

// ─── Purchase Return (Return to Vendor) ───────────────────────────────────

export const purchaseReturnCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  grnId: uuid.optional(),
  warehouseId: uuid,
  reason: z.string().optional(),
  lines: z
    .array(
      docLineSchema.extend({
        grnLineId: uuid.optional(),
        batchId: uuid.optional(),
        warehouseId: uuid.optional(),
      })
    )
    .min(1),
});

// ─── Purchase Debit Note ───────────────────────────────────────────────────

export const purchaseDebitNoteCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  invoiceId: uuid.optional(),
  returnId: uuid.optional(),
  supplierDebitNoteNumber: z.string().max(50).optional(),
  supplierDebitNoteDate: isoDate.optional(),
  reason: z.string().optional(),
  lines: z
    .array(
      docLineSchema.extend({
        invoiceLineId: uuid.optional(),
        returnLineId: uuid.optional(),
      })
    )
    .min(1),
});

// ─── Blanket Purchase Order (GAP 7) ──────────────────────────────────────────

export const blanketPoCreateSchema = docHeaderBase.extend({
  supplierId: uuid,
  validFrom: isoDate,
  validTo: isoDate,
  termsAndConditions: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: uuid,
        description: z.string().optional(),
        committedQty: qty,
        uom: z.string().min(1).max(20),
        ratePaise: paisePos,
        discountPercent: z.number().min(0).max(100).default(0),
        discountPaise: paisePos.default(0),
        taxCodeId: uuid.optional(),
        hsnSacCode: z.string().max(20).optional(),
      })
    )
    .min(1),
});

// ─── Landed Cost Voucher (GAP 3) ───────────────────────────────────────────

export const lcvCreateSchema = docHeaderBase.extend({
  allocationBasis: z.enum(['by_value', 'by_qty']).default('by_value'),
  applicableGrnIds: z.array(uuid).min(1),
  expenseLines: z
    .array(
      z.object({
        expenseAccountId: uuid,
        description: z.string().min(1).max(255),
        amountPaise: paisePos,
      })
    )
    .min(1),
});

// ─── Status transition (submit / approve / reject / cancel) ─────────────────

export const transitionSchema = z.object({
  remarks: z.string().optional(),
});

// ─── Inferred input types ────────────────────────────────────────────────────

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PrCreateInput = z.infer<typeof prCreateSchema>;
export type BlanketPoCreateInput = z.infer<typeof blanketPoCreateSchema>;
export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type GrnCreateInput = z.infer<typeof grnCreateSchema>;
export type PurchaseInvoiceCreateInput = z.infer<typeof purchaseInvoiceCreateSchema>;
export type PurchasePaymentCreateInput = z.infer<typeof purchasePaymentCreateSchema>;
export type PurchaseReturnCreateInput = z.infer<typeof purchaseReturnCreateSchema>;
export type PurchaseDebitNoteCreateInput = z.infer<typeof purchaseDebitNoteCreateSchema>;
export type LcvCreateInput = z.infer<typeof lcvCreateSchema>;
