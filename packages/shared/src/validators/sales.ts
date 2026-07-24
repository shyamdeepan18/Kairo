import { z } from 'zod';

// ─── Shared field helpers ──────────────────────────────────────────────────

const uuid = z.string().uuid();
const paisePos = z.number().int().nonnegative();
const qty = z.number().positive();
const isoDate = z.string().min(8);

// ─── Customer ───────────────────────────────────────────────────────────────

export const customerCreateSchema = z.object({
  companyId: uuid,
  customerCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  legalName: z.string().max(255).optional(),
  customerType: z
    .enum(['registered', 'unregistered', 'composition', 'sez', 'export', 'government'])
    .default('registered'),
  gstin: z.string().length(15).optional(),
  pan: z.string().length(10).optional(),
  stateCode: z.string().length(2).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  creditLimitPaise: paisePos.default(0),
  defaultDiscountPercent: z.number().min(0).max(100).default(0),
  tcsApplicable: z.boolean().default(false),
});

export const customerUpdateSchema = customerCreateSchema.partial().omit({ companyId: true });

export const customerAddressCreateSchema = z.object({
  companyId: uuid,
  customerId: uuid,
  addressType: z.enum(['billing', 'shipping', 'both']).default('both'),
  label: z.string().max(100).optional(),
  gstin: z.string().length(15).optional(),
  stateCode: z.string().length(2).optional(),
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(6).optional(),
  contactPerson: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  isDefault: z.boolean().default(false),
});

// ─── Generic priced line ────────────────────────────────────────────────────

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

const addressRefs = {
  billingAddressId: uuid.optional(),
  shippingAddressId: uuid.optional(),
  placeOfSupply: z.string().length(2).optional(),
  isReverseCharge: z.boolean().default(false),
};

// ─── Quotation ────────────────────────────────────────────────────────────

export const quotationCreateSchema = docHeaderBase.extend({
  customerId: uuid,
  ...addressRefs,
  validUntilDate: isoDate.optional(),
  lines: z.array(docLineSchema).min(1),
});

// ─── Sales Order ──────────────────────────────────────────────────────────

export const soCreateSchema = docHeaderBase.extend({
  customerId: uuid,
  quotationId: uuid.optional(),
  ...addressRefs,
  customerPoNumber: z.string().max(50).optional(),
  customerPoDate: isoDate.optional(),
  expectedDeliveryDate: isoDate.optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  lines: z.array(docLineSchema.extend({ quotationLineId: uuid.optional() })).min(1),
});

// ─── Delivery Note ──────────────────────────────────────────────────────────
// COGS is computed at approval from the current WAC — not supplied here.

export const deliveryCreateSchema = docHeaderBase.extend({
  customerId: uuid,
  soId: uuid.optional(),
  warehouseId: uuid,
  shippingAddressId: uuid.optional(),
  transporterName: z.string().max(255).optional(),
  vehicleNo: z.string().max(20).optional(),
  lrNumber: z.string().max(50).optional(),
  ewayBillNo: z.string().max(15).optional(),
  ewayBillDate: isoDate.optional(),
  distanceKm: z.number().int().nonnegative().optional(),
  lines: z
    .array(
      z.object({
        itemId: uuid,
        description: z.string().optional(),
        soLineId: uuid.optional(),
        deliveredQty: qty,
        uom: z.string().min(1).max(20),
        ratePaise: paisePos.default(0),
        taxCodeId: uuid.optional(),
        hsnSacCode: z.string().max(10).optional(),
        warehouseId: uuid.optional(),
        batchId: uuid.optional(),
        batchNumber: z.string().max(100).optional(),
      })
    )
    .min(1),
});

// ─── Sales Invoice ────────────────────────────────────────────────────────

export const salesInvoiceCreateSchema = docHeaderBase.extend({
  customerId: uuid,
  soId: uuid.optional(),
  deliveryId: uuid.optional(),
  ...addressRefs,
  dueDate: isoDate.optional(),
  supplyType: z.enum(['B2B', 'B2C', 'EXPORT', 'SEZ']).default('B2B'),
  isExport: z.boolean().default(false),
  einvoiceApplicable: z.boolean().default(false),
  lines: z
    .array(docLineSchema.extend({ soLineId: uuid.optional(), deliveryLineId: uuid.optional() }))
    .min(1),
});

// ─── Sales Receipt (customer payment) ───────────────────────────────────────

export const salesReceiptCreateSchema = docHeaderBase.extend({
  customerId: uuid,
  receiptMode: z
    .enum(['cash', 'bank_transfer', 'cheque', 'upi', 'card', 'adjustment'])
    .default('bank_transfer'),
  instrumentNo: z.string().max(50).optional(),
  instrumentDate: isoDate.optional(),
  bankReference: z.string().max(100).optional(),
  receivedAmountPaise: z.number().int().positive(),
  tcsAmountPaise: paisePos.default(0),
  allocations: z
    .array(z.object({ invoiceId: uuid, allocatedAmountPaise: z.number().int().positive() }))
    .default([]),
});

// ─── Inferred input types ────────────────────────────────────────────────────

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerAddressCreateInput = z.infer<typeof customerAddressCreateSchema>;
export type QuotationCreateInput = z.infer<typeof quotationCreateSchema>;
export type SoCreateInput = z.infer<typeof soCreateSchema>;
export type DeliveryCreateInput = z.infer<typeof deliveryCreateSchema>;
export type SalesInvoiceCreateInput = z.infer<typeof salesInvoiceCreateSchema>;
export type SalesReceiptCreateInput = z.infer<typeof salesReceiptCreateSchema>;
