import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, date, numeric, jsonb, index, unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';

// ─── Tax rate slabs ────────────────────────────────────────────────────────
//
// Indian GST has 5 standard slabs: 0%, 5%, 12%, 18%, 28%, plus Cess.
// "Nil" (0% but ITC claimable) is different from "Exempt" (ITC blocked).
//
// stored as integers × 100 to avoid float precision: 18% → gstRate = 1800
// BUT for e-invoice JSON, the IRP expects decimal (18.0). Convert at boundary.

export type GstRateType =
  | 'nil'        // 0% — supply is nil-rated. ITC allowed on inputs.
  | 'exempt'     // 0% — supply is exempt. ITC blocked on inputs.
  | 'standard'   // 5% / 12% / 18% / 28% standard rates
  | 'cess'       // Standard rate + additional cess
  | 'zero'       // Export / SEZ supply (0% with ITC benefit, LUT/bond required)
  | 'ig_only';   // Only IGST applicable (specific services)

export type SupplyType =
  | 'B2B'    // Registered buyer → must show GSTIN on invoice
  | 'B2C'    // Unregistered buyer
  | 'EXPORT' // Export with or without payment
  | 'SEZ';   // SEZ supply

// ─── Table: tax_codes ─────────────────────────────────────────────────────
//
// One row per GST rate combination. Seeded from packages/db/src/seeds/tax-codes.ts.
// Companies can add custom codes but cannot delete system codes.
//
// Rates stored as basis points (1 bp = 0.01%) to avoid decimal:
//   18% → 1800, 9% → 900, 2.5% → 250

export const taxCodes = pgTable(
  'tax_codes',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Short identifier used on document lines: 'GST18', 'GST5', 'NIL', 'EXEMPT' */
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    rateType: varchar('rate_type', { length: 20 }).notNull().$type<GstRateType>(),

    /**
     * Rates in basis points (1% = 100 bp):
     *   GST 18%: gstRateBp=1800, cgstBp=900, sgstBp=900, igstBp=1800
     *   GST  5%: gstRateBp= 500, cgstBp=250, sgstBp=250, igstBp= 500
     */
    gstRateBp:  integer('gst_rate_bp').default(0).notNull(),   // total GST rate
    cgstRateBp: integer('cgst_rate_bp').default(0).notNull(),  // always = gstRateBp / 2
    sgstRateBp: integer('sgst_rate_bp').default(0).notNull(),  // always = gstRateBp / 2
    igstRateBp: integer('igst_rate_bp').default(0).notNull(),  // always = gstRateBp
    cessRateBp: integer('cess_rate_bp').default(0).notNull(),  // additional cess

    isSystemCode: boolean('is_system_code').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('tax_codes_company_code_uq').on(t.companyId, t.code),
    companyIdx: index('tax_codes_company_idx').on(t.companyId),
  })
);

// ─── Table: hsn_sac_codes ──────────────────────────────────────────────────
//
// Global master (not per-company). Seeded with common HSN codes.
// SAC (Services Accounting Code) codes are for services.
//
// Companies assign HSN codes to items in the items master (Phase 5).
// The default_tax_code column stores the most common GST rate for that HSN.

export const hsnSacCodes = pgTable(
  'hsn_sac_codes',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),

    /** 4, 6, or 8 digit code. SAC codes start with 99. */
    code: varchar('code', { length: 10 }).notNull().unique(),
    description: varchar('description', { length: 500 }).notNull(),
    /** true for SAC (services), false for HSN (goods) */
    isService: boolean('is_service').default(false).notNull(),
    /** Most common GST rate for this code (basis points). Companies can override per item. */
    defaultGstRateBp: integer('default_gst_rate_bp').default(0).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    codeIdx: index('hsn_sac_codes_code_idx').on(t.code),
  })
);

// ─── Table: document_tax_lines ────────────────────────────────────────────
//
// Stores computed tax amounts per document line. Created alongside the
// document lines in the same transaction as document creation.
//
// Separate from the document line tables so:
//   1. Document tables stay lean (no repeated tax columns)
//   2. TaxEngine output is queryable across all document types
//   3. GSTR-1 HSN-wise summary can be produced by a single query here
//
// document_type + document_id are the logical FK (no DB-level FK since
// documents live in different tables per module).

export const documentTaxLines = pgTable(
  'document_tax_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),

    documentType: varchar('document_type', { length: 100 }).notNull(),
    documentId: uuid('document_id').notNull(),
    documentNumber: varchar('document_number', { length: 50 }),
    lineNumber: integer('line_number').notNull(),

    // Tax code applied to this line
    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    taxCode: varchar('tax_code', { length: 20 }),   // denormalized for fast reporting

    // HSN / SAC
    hsnCode: varchar('hsn_code', { length: 10 }),
    isService: boolean('is_service').default(false).notNull(),

    // Item description (denormalized for GSTR-1 HSN summary)
    itemDescription: varchar('item_description', { length: 300 }),
    quantity: numeric('quantity', { precision: 15, scale: 4 }),
    unit: varchar('unit', { length: 20 }),

    // Amounts (all in paise)
    baseAmountPaise: integer('base_amount_paise').default(0).notNull(),
    discountPaise: integer('discount_paise').default(0).notNull(),
    assessableAmountPaise: integer('assessable_amount_paise').default(0).notNull(),

    // Rates (basis points)
    gstRateBp:  integer('gst_rate_bp').default(0).notNull(),
    cgstRateBp: integer('cgst_rate_bp').default(0).notNull(),
    sgstRateBp: integer('sgst_rate_bp').default(0).notNull(),
    igstRateBp: integer('igst_rate_bp').default(0).notNull(),
    cessRateBp: integer('cess_rate_bp').default(0).notNull(),

    // Computed tax amounts (paise)
    cgstAmountPaise: integer('cgst_amount_paise').default(0).notNull(),
    sgstAmountPaise: integer('sgst_amount_paise').default(0).notNull(),
    igstAmountPaise: integer('igst_amount_paise').default(0).notNull(),
    cessAmountPaise: integer('cess_amount_paise').default(0).notNull(),

    totalTaxPaise: integer('total_tax_paise').default(0).notNull(),
    totalLinePaise: integer('total_line_paise').default(0).notNull(),

    // Transaction context (denormalized for GSTR queries)
    placeOfSupply: varchar('place_of_supply', { length: 2 }),
    isInterState: boolean('is_inter_state').default(false).notNull(),
    supplyType: varchar('supply_type', { length: 10 }),   // 'B2B' | 'B2C' | 'EXPORT' | 'SEZ'
    isReverseCharge: boolean('is_reverse_charge').default(false).notNull(),

    postingDate: date('posting_date'),
    fiscalYear: varchar('fiscal_year', { length: 5 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index('document_tax_lines_doc_idx').on(t.documentType, t.documentId),
    companyFyIdx: index('document_tax_lines_company_fy_idx').on(t.companyId, t.fiscalYear),
    hsnIdx: index('document_tax_lines_hsn_idx').on(t.hsnCode),
  })
);

// ─── Table: e_invoice_records ──────────────────────────────────────────────
//
// One row per e-invoice submission attempt. Created when a qualifying invoice
// is approved. Updated when the IRP responds.
//
// Eligibility: apply to companies with annual turnover > ₹5 Cr (as of FY 2023).
// The setting `company.einvoiceEnabled` controls this.

export type EInvoiceStatus =
  | 'pending'    // awaiting IRP submission
  | 'generated'  // IRN successfully obtained
  | 'error'      // IRP returned an error (retry possible)
  | 'cancelled'; // IRN cancelled via IRP API

export const eInvoiceRecords = pgTable(
  'e_invoice_records',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),

    documentType: varchar('document_type', { length: 100 }).notNull(),
    documentId: uuid('document_id').notNull(),
    documentNumber: varchar('document_number', { length: 50 }).notNull(),

    /** SHA-256 of (GSTIN + DocType + DocNo + DocDate + FY). 64 hex chars. */
    irn: varchar('irn', { length: 64 }).unique(),
    /** IRP acknowledgement number */
    ackNo: varchar('ack_no', { length: 20 }),
    /** IRP acknowledgement datetime */
    ackDate: timestamp('ack_date', { withTimezone: true }),

    /** Full JWT-signed invoice returned by IRP — used to extract QR code */
    signedInvoice: text('signed_invoice'),
    /** Base64-encoded QR code data — embedded in the printed invoice PDF */
    signedQrCode: text('signed_qr_code'),

    status: varchar('status', { length: 20 }).default('pending').notNull().$type<EInvoiceStatus>(),

    /** The exact JSON payload sent to IRP — stored for debugging + retry */
    irpPayload: jsonb('irp_payload'),
    /** Full IRP response — stored for audit */
    irpResponse: jsonb('irp_response'),
    /** IRP error message if status = 'error' */
    errorMessage: text('error_message'),

    cancelReason: text('cancel_reason'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),

    /** Number of submission retries */
    retryCount: integer('retry_count').default(0).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),

    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    docIdx: index('e_invoice_records_doc_idx').on(t.documentType, t.documentId),
    irnIdx: index('e_invoice_records_irn_idx').on(t.irn),
    statusIdx: index('e_invoice_records_status_idx').on(t.status),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type TaxCode = typeof taxCodes.$inferSelect;
export type NewTaxCode = typeof taxCodes.$inferInsert;
export type HsnSacCode = typeof hsnSacCodes.$inferSelect;
export type DocumentTaxLine = typeof documentTaxLines.$inferSelect;
export type NewDocumentTaxLine = typeof documentTaxLines.$inferInsert;
export type EInvoiceRecord = typeof eInvoiceRecords.$inferSelect;
