import {
  pgTable, uuid, varchar, text, integer, bigint, boolean,
  timestamp, date, numeric, jsonb, index, unique, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, plants, warehouses } from './company.js';
import { users } from './auth.js';
import { items, itemBatches } from './inventory.js';
import { taxCodes } from './tax.js';
import { journalEntries } from './accounting.js';

// ─── Phase 7 — Sales module ────────────────────────────────────────────────
//
// Document chain:  Quotation → Sales Order → Delivery → Invoice → Receipt
//
//   sales.quotation  price offer to a customer                  (no stock, no GL)
//   sales.so         confirmed order                            (reserves stock, no GL)
//   sales.delivery   goods dispatched out of stock              (stock OUT + COGS)   ← posts stock + GL
//   sales.invoice    tax invoice / revenue booked + e-invoice   (DR AR / CR Revenue+Output GST) ← posts GL
//   sales.payment    customer receipt                           (DR Bank / CR AR)    ← posts GL
//
// Mirrors packages/db/src/schema/purchase.ts intentionally — SAME documentHeader()
// factory, money()/qty() helpers, bigint paise, and line-level traceability — so the
// two trade-cycle modules stay symmetric. (The documentHeader factory is duplicated in
// both modules for now; ideally promote it to a shared helper in a later cleanup.)
//
// Sales-specific differences vs Purchase:
//   • party = CUSTOMER (with separate bill-to / ship-to addresses; ship-to drives place of supply)
//   • Output GST (liability) + Accounts Receivable + Revenue  (not Input GST / AP)
//   • DUAL posting: Delivery posts COGS (DR COGS / CR Inventory at WAC); Invoice posts Revenue
//   • Outbound e-invoice: the invoice GENERATES an IRN via TaxEngine + IrpClient → e_invoice_records
//   • e-way bill fields on Delivery (transporter, vehicle, distance)
//   • SO reserves stock (inventory.stockReservations / stock_balances.quantityReserved)
//   • Credit-limit check gates SO/Delivery approval

// ─── Helpers (identical to purchase.ts) ──────────────────────────────────────

/** A monetary column in paise. bigint avoids the integer paise overflow ceiling. */
const money = (name: string) => bigint(name, { mode: 'number' });
/** A quantity column — fractional units allowed. */
const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Standard transactional-document header columns (fresh builders per call). */
const documentHeader = (docType: string) => ({
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id').notNull().references(() => plants.id),

  documentType: varchar('document_type', { length: 100 }).default(docType).notNull(),
  documentNumber: varchar('document_number', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).default('draft').notNull(),

  fiscalYear: varchar('fiscal_year', { length: 5 }),
  postingDate: date('posting_date').notNull(),

  currency: varchar('currency', { length: 3 }).default('INR').notNull(),
  exchangeRate: numeric('exchange_rate', { precision: 10, scale: 6 }).default('1').notNull(),

  netAmountPaise: money('net_amount_paise').default(0).notNull(),
  discountPaise: money('discount_paise').default(0).notNull(),
  taxAmountPaise: money('tax_amount_paise').default(0).notNull(),
  roundOffPaise: money('round_off_paise').default(0).notNull(),
  totalAmountPaise: money('total_amount_paise').default(0).notNull(),

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

export const customerTypeEnum = pgEnum('customer_type', [
  'registered',     // GST-registered regular taxpayer (B2B)
  'unregistered',   // no GSTIN (B2C)
  'composition',    // composition scheme dealer
  'sez',            // SEZ customer (zero-rated)
  'export',         // overseas customer (zero-rated, LUT/bond or with payment)
  'government',     // government department
]);

export const receiptModeEnum = pgEnum('sales_receipt_mode', [
  'cash',
  'bank_transfer',
  'cheque',
  'upi',
  'card',
  'adjustment',     // settled against a credit note / advance
]);

export const addressTypeEnum = pgEnum('customer_address_type', [
  'billing',
  'shipping',
  'both',
]);

// ─── Table: customers (customer master) ─────────────────────────────────────

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** Unique per company. e.g. 'CUST-0001' */
    customerCode: varchar('customer_code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }),
    customerType: customerTypeEnum('customer_type').default('registered').notNull(),

    // ── GST / tax identity ───────────────────────────────────────────────
    gstin: varchar('gstin', { length: 15 }),
    pan: varchar('pan', { length: 10 }),
    /** Default place-of-supply state code (overridden by the chosen ship-to address) */
    stateCode: varchar('state_code', { length: 2 }),

    // ── Primary contact (full addresses live in customer_addresses) ───────
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),

    // ── Commercial terms ──────────────────────────────────────────────────
    paymentTermsDays: integer('payment_terms_days').default(0).notNull(),
    /** Credit limit in paise. AR outstanding is checked against this at SO approval. */
    creditLimitPaise: money('credit_limit_paise').default(0).notNull(),
    /** Block new orders when over credit limit */
    creditHold: boolean('credit_hold').default(false).notNull(),
    defaultCurrency: varchar('default_currency', { length: 3 }).default('INR').notNull(),
    defaultDiscountPercent: numeric('default_discount_percent', { precision: 5, scale: 2 }).default('0').notNull(),

    // ── TCS (tax collected at source on sales) ────────────────────────────
    tcsApplicable: boolean('tcs_applicable').default(false).notNull(),
    tcsSection: varchar('tcs_section', { length: 20 }),

    // ── Bank (for refunds / NACH mandates) ────────────────────────────────
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    bankAccountNumber: varchar('bank_account_number', { length: 30 }),
    bankIfsc: varchar('bank_ifsc', { length: 11 }),
    bankName: varchar('bank_name', { length: 255 }),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('customers_company_code_uq').on(t.companyId, t.customerCode),
    companyIdx: index('customers_company_idx').on(t.companyId),
    gstinIdx: index('customers_gstin_idx').on(t.gstin),
    nameIdx: index('customers_name_idx').on(t.companyId, t.name),
  })
);

// ─── Table: customer_addresses ──────────────────────────────────────────────
//
// Sales-specific: a customer has multiple addresses. The SHIP-TO address state
// code is the GST place of supply (which can differ from the bill-to state).

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),

    addressType: addressTypeEnum('address_type').default('both').notNull(),
    label: varchar('label', { length: 100 }),       // 'Head Office', 'Pune DC'

    /** Ship-to GSTIN may differ from the customer's primary GSTIN */
    gstin: varchar('gstin', { length: 15 }),
    /** Place of supply for this address — drives CGST+SGST vs IGST */
    stateCode: varchar('state_code', { length: 2 }),

    address: text('address'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 6 }),
    country: varchar('country', { length: 100 }).default('India').notNull(),
    contactPerson: varchar('contact_person', { length: 255 }),
    phone: varchar('phone', { length: 20 }),

    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    customerIdx: index('customer_addresses_customer_idx').on(t.customerId),
  })
);

// ─── 1. Sales Quotation ─────────────────────────────────────────────────────
//
// Price offer to a customer. No stock, no GL. Converts to one or more SOs.

export const salesQuotations = pgTable(
  'sales_quotations',
  {
    ...documentHeader('sales.quotation'),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    billingAddressId: uuid('billing_address_id').references(() => customerAddresses.id),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id),

    validUntilDate: date('valid_until_date'),
    placeOfSupply: varchar('place_of_supply', { length: 2 }),
    isReverseCharge: boolean('is_reverse_charge').default(false).notNull(),
    /** open | partial | ordered | closed | expired */
    fulfilmentStatus: varchar('fulfilment_status', { length: 20 }).default('open').notNull(),
  },
  (t) => ({
    uniqueNumber: unique('sales_quotations_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('sales_quotations_company_date_idx').on(t.companyId, t.postingDate),
    customerIdx: index('sales_quotations_customer_idx').on(t.customerId),
    statusIdx: index('sales_quotations_status_idx').on(t.companyId, t.status),
  })
);

export const salesQuotationLines = pgTable(
  'sales_quotation_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => salesQuotations.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),
    quantity: qty('quantity').notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),

    ratePaise: money('rate_paise').notNull(),          // selling price
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    discountPaise: money('discount_paise').default(0).notNull(),
    netAmountPaise: money('net_amount_paise').notNull(),

    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    cgstAmountPaise: money('cgst_amount_paise').default(0).notNull(),
    sgstAmountPaise: money('sgst_amount_paise').default(0).notNull(),
    igstAmountPaise: money('igst_amount_paise').default(0).notNull(),
    cessAmountPaise: money('cess_amount_paise').default(0).notNull(),
    taxAmountPaise: money('tax_amount_paise').default(0).notNull(),
    totalAmountPaise: money('total_amount_paise').notNull(),

    /** Quantity already turned into an SO */
    orderedQty: qty('ordered_qty').default('0').notNull(),
    lineStatus: varchar('line_status', { length: 20 }).default('open').notNull(),
    custom_data: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    quotationIdx: index('sq_lines_quotation_idx').on(t.quotationId),
    itemIdx: index('sq_lines_item_idx').on(t.itemId),
  })
);

// ─── 2. Sales Order (SO) ────────────────────────────────────────────────────
//
// Confirmed customer order. On approval, reserves stock (inventory.stockReservations).
// Basis for delivery and invoice (partial fulfilment via line links).

export const salesOrders = pgTable(
  'sales_orders',
  {
    ...documentHeader('sales.so'),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    quotationId: uuid('quotation_id').references(() => salesQuotations.id),
    billingAddressId: uuid('billing_address_id').references(() => customerAddresses.id),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id),

    /** Customer's own PO reference */
    customerPoNumber: varchar('customer_po_number', { length: 50 }),
    customerPoDate: date('customer_po_date'),
    expectedDeliveryDate: date('expected_delivery_date'),
    paymentTermsDays: integer('payment_terms_days').default(0).notNull(),

    placeOfSupply: varchar('place_of_supply', { length: 2 }),
    isReverseCharge: boolean('is_reverse_charge').default(false).notNull(),

    /** not_delivered | partial | fully_delivered */
    deliveryStatus: varchar('delivery_status', { length: 20 }).default('not_delivered').notNull(),
    /** not_billed | partial | fully_billed */
    billingStatus: varchar('billing_status', { length: 20 }).default('not_billed').notNull(),
  },
  (t) => ({
    uniqueNumber: unique('sales_orders_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('sales_orders_company_date_idx').on(t.companyId, t.postingDate),
    customerIdx: index('sales_orders_customer_idx').on(t.customerId),
    statusIdx: index('sales_orders_status_idx').on(t.companyId, t.status),
  })
);

export const salesOrderLines = pgTable(
  'sales_order_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    soId: uuid('so_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    /** Trace back to the quotation line */
    quotationLineId: uuid('quotation_line_id').references(() => salesQuotationLines.id),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),
    quantity: qty('quantity').notNull(),         // ordered quantity
    uom: varchar('uom', { length: 20 }).notNull(),

    ratePaise: money('rate_paise').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).default('0').notNull(),
    discountPaise: money('discount_paise').default(0).notNull(),
    netAmountPaise: money('net_amount_paise').notNull(),

    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    cgstAmountPaise: money('cgst_amount_paise').default(0).notNull(),
    sgstAmountPaise: money('sgst_amount_paise').default(0).notNull(),
    igstAmountPaise: money('igst_amount_paise').default(0).notNull(),
    cessAmountPaise: money('cess_amount_paise').default(0).notNull(),
    taxAmountPaise: money('tax_amount_paise').default(0).notNull(),
    totalAmountPaise: money('total_amount_paise').notNull(),

    /** Running totals for partial fulfilment */
    deliveredQty: qty('delivered_qty').default('0').notNull(),
    billedQty: qty('billed_qty').default('0').notNull(),
    /** Quantity reserved against stock (links to inventory.stockReservations) */
    reservedQty: qty('reserved_qty').default('0').notNull(),

    /** Source warehouse the goods are committed from */
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    custom_data: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    soIdx: index('so_lines_so_idx').on(t.soId),
    itemIdx: index('so_lines_item_idx').on(t.itemId),
    quotationLineIdx: index('so_lines_quotation_line_idx').on(t.quotationLineId),
  })
);

// ─── 3. Delivery Note / Dispatch (DC) ───────────────────────────────────────
//
// Physical dispatch of goods. POSTS STOCK OUT (InventoryEngine) and the COGS GL
// entry (DR COGS / CR Inventory at weighted-average cost). Carries e-way-bill and
// transport details. Mirror of the purchase GRN, but outward.

export const deliveryNotes = pgTable(
  'delivery_notes',
  {
    ...documentHeader('sales.delivery'),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    soId: uuid('so_id').references(() => salesOrders.id),
    /** Dispatching warehouse (line may override) */
    warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id),

    // ── Transport / e-way bill ────────────────────────────────────────────
    transporterName: varchar('transporter_name', { length: 255 }),
    vehicleNo: varchar('vehicle_no', { length: 20 }),
    lrNumber: varchar('lr_number', { length: 50 }),       // lorry receipt / docket
    ewayBillNo: varchar('eway_bill_no', { length: 15 }),
    ewayBillDate: date('eway_bill_date'),
    distanceKm: integer('distance_km'),

    /** not_billed | partial | fully_billed */
    billingStatus: varchar('billing_status', { length: 20 }).default('not_billed').notNull(),
    /** GL entry created on approval (COGS / inventory reduction) */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  },
  (t) => ({
    uniqueNumber: unique('delivery_notes_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('delivery_notes_company_date_idx').on(t.companyId, t.postingDate),
    customerIdx: index('delivery_notes_customer_idx').on(t.customerId),
    soIdx: index('delivery_notes_so_idx').on(t.soId),
  })
);

export const deliveryNoteLines = pgTable(
  'delivery_note_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveryNotes.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    /** Trace back to the SO line being fulfilled */
    soLineId: uuid('so_line_id').references(() => salesOrderLines.id),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),
    deliveredQty: qty('delivered_qty').notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),

    ratePaise: money('rate_paise').notNull(),            // selling price (for invoice reference)
    /** Per-unit COGS = WAC snapshot at dispatch (cost going OUT) */
    cogsRatePaise: money('cogs_rate_paise').default(0).notNull(),
    /** deliveredQty × cogsRatePaise — the COGS value posted to GL */
    cogsAmountPaise: money('cogs_amount_paise').default(0).notNull(),
    netAmountPaise: money('net_amount_paise').default(0).notNull(),

    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    taxAmountPaise: money('tax_amount_paise').default(0).notNull(),
    totalAmountPaise: money('total_amount_paise').default(0).notNull(),

    /** Line-level dispatch warehouse (defaults to header warehouse) */
    warehouseId: uuid('warehouse_id').references(() => warehouses.id),
    /** Batch issued (for batch-tracked items) */
    batchId: uuid('batch_id').references(() => itemBatches.id),
    batchNumber: varchar('batch_number', { length: 100 }),

    /** Quantity of this dispatch already invoiced */
    billedQty: qty('billed_qty').default('0').notNull(),
    custom_data: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    deliveryIdx: index('dn_lines_delivery_idx').on(t.deliveryId),
    itemIdx: index('dn_lines_item_idx').on(t.itemId),
    soLineIdx: index('dn_lines_so_line_idx').on(t.soLineId),
    batchIdx: index('dn_lines_batch_idx').on(t.batchId),
  })
);

// ─── 4. Sales Invoice (Tax Invoice) ─────────────────────────────────────────
//
// Books revenue + AR + Output GST (salesInvoiceTemplate). Generates an outbound
// e-invoice (IRN) for eligible companies — the IRN itself lives in e_invoice_records
// (Phase 4), keyed by (documentType='sales.invoice', documentId); only the status is
// mirrored here. Handles export / SEZ (zero-rated) supplies.

export const salesInvoices = pgTable(
  'sales_invoices',
  {
    ...documentHeader('sales.invoice'),
    customerId: uuid('customer_id').notNull().references(() => customers.id),
    soId: uuid('so_id').references(() => salesOrders.id),
    deliveryId: uuid('delivery_id').references(() => deliveryNotes.id),
    billingAddressId: uuid('billing_address_id').references(() => customerAddresses.id),
    shippingAddressId: uuid('shipping_address_id').references(() => customerAddresses.id),

    dueDate: date('due_date'),
    placeOfSupply: varchar('place_of_supply', { length: 2 }),
    isReverseCharge: boolean('is_reverse_charge').default(false).notNull(),
    /** B2B | B2C | EXPORT | SEZ */
    supplyType: varchar('supply_type', { length: 10 }).default('B2B').notNull(),
    isExport: boolean('is_export').default(false).notNull(),
    /** 'with_payment' | 'without_payment' (LUT/bond) — for export invoices */
    exportType: varchar('export_type', { length: 20 }),

    // ── e-invoice (IRN stored in e_invoice_records; status mirrored here) ──
    einvoiceApplicable: boolean('einvoice_applicable').default(false).notNull(),
    /** not_applicable | pending | generated | error | cancelled */
    einvoiceStatus: varchar('einvoice_status', { length: 20 }).default('not_applicable').notNull(),
    ewayBillNo: varchar('eway_bill_no', { length: 15 }),

    tcsAmountPaise: money('tcs_amount_paise').default(0).notNull(),
    /** GL entry created on approval (revenue / AR booking) */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),

    /** unpaid | partial | paid */
    paymentStatus: varchar('payment_status', { length: 20 }).default('unpaid').notNull(),
    receivedAmountPaise: money('received_amount_paise').default(0).notNull(),
  },
  (t) => ({
    uniqueNumber: unique('sales_invoices_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('sales_invoices_company_date_idx').on(t.companyId, t.postingDate),
    customerIdx: index('sales_invoices_customer_idx').on(t.customerId),
    soIdx: index('sales_invoices_so_idx').on(t.soId),
    deliveryIdx: index('sales_invoices_delivery_idx').on(t.deliveryId),
  })
);

export const salesInvoiceLines = pgTable(
  'sales_invoice_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => salesInvoices.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    /** Traceability into SO / delivery lines being billed */
    soLineId: uuid('so_line_id').references(() => salesOrderLines.id),
    deliveryLineId: uuid('delivery_line_id').references(() => deliveryNoteLines.id),

    itemId: uuid('item_id').notNull().references(() => items.id),
    description: text('description'),
    quantity: qty('quantity').notNull(),
    uom: varchar('uom', { length: 20 }).notNull(),

    ratePaise: money('rate_paise').notNull(),
    discountPaise: money('discount_paise').default(0).notNull(),
    netAmountPaise: money('net_amount_paise').notNull(),

    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id),
    hsnSacCode: varchar('hsn_sac_code', { length: 10 }),
    cgstAmountPaise: money('cgst_amount_paise').default(0).notNull(),
    sgstAmountPaise: money('sgst_amount_paise').default(0).notNull(),
    igstAmountPaise: money('igst_amount_paise').default(0).notNull(),
    cessAmountPaise: money('cess_amount_paise').default(0).notNull(),
    taxAmountPaise: money('tax_amount_paise').default(0).notNull(),
    totalAmountPaise: money('total_amount_paise').notNull(),
    custom_data: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
  },
  (t) => ({
    invoiceIdx: index('sales_invoice_lines_invoice_idx').on(t.invoiceId),
    itemIdx: index('sales_invoice_lines_item_idx').on(t.itemId),
    deliveryLineIdx: index('sales_invoice_lines_delivery_line_idx').on(t.deliveryLineId),
  })
);

// ─── 5. Sales Receipt (customer payment) ────────────────────────────────────
//
// Inflow from a customer. Posts GL via salesPaymentTemplate (DR Bank/Cash / CR AR).
//
// NOTE on document_type: the registered posting template and Indian-SME naming
// differ. The header uses documentType='sales.payment' so the EXISTING
// salesPaymentTemplate fires without re-registration. The lifecycle still needs
// wiring: StatusEngine has no 'sales.payment' transitions and there is no
// sales receipt permission seeded yet (see PHASE7 notes). Entity is named
// "receipt" for domain clarity.

export const salesReceipts = pgTable(
  'sales_receipts',
  {
    ...documentHeader('sales.payment'),
    customerId: uuid('customer_id').notNull().references(() => customers.id),

    receiptMode: receiptModeEnum('receipt_mode').default('bank_transfer').notNull(),
    instrumentNo: varchar('instrument_no', { length: 50 }),   // cheque no / UTR / txn ref
    instrumentDate: date('instrument_date'),
    bankReference: varchar('bank_reference', { length: 100 }),

    /** Total amount received */
    receivedAmountPaise: money('received_amount_paise').notNull(),
    /** Portion matched to invoices */
    allocatedAmountPaise: money('allocated_amount_paise').default(0).notNull(),
    /** Unmatched remainder — customer advance */
    unallocatedAmountPaise: money('unallocated_amount_paise').default(0).notNull(),
    tcsAmountPaise: money('tcs_amount_paise').default(0).notNull(),

    /** GL entry created on approval */
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
  },
  (t) => ({
    uniqueNumber: unique('sales_receipts_number_uq').on(t.companyId, t.documentNumber),
    companyDateIdx: index('sales_receipts_company_date_idx').on(t.companyId, t.postingDate),
    customerIdx: index('sales_receipts_customer_idx').on(t.customerId),
  })
);

export const salesReceiptAllocations = pgTable(
  'sales_receipt_allocations',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    receiptId: uuid('receipt_id')
      .notNull()
      .references(() => salesReceipts.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => salesInvoices.id),
    /** Amount of this receipt applied to this invoice */
    allocatedAmountPaise: money('allocated_amount_paise').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    receiptIdx: index('sales_receipt_alloc_receipt_idx').on(t.receiptId),
    invoiceIdx: index('sales_receipt_alloc_invoice_idx').on(t.invoiceId),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type NewCustomerAddress = typeof customerAddresses.$inferInsert;

export type SalesQuotation = typeof salesQuotations.$inferSelect;
export type NewSalesQuotation = typeof salesQuotations.$inferInsert;
export type SalesQuotationLine = typeof salesQuotationLines.$inferSelect;
export type NewSalesQuotationLine = typeof salesQuotationLines.$inferInsert;

export type SalesOrder = typeof salesOrders.$inferSelect;
export type NewSalesOrder = typeof salesOrders.$inferInsert;
export type SalesOrderLine = typeof salesOrderLines.$inferSelect;
export type NewSalesOrderLine = typeof salesOrderLines.$inferInsert;

export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type NewDeliveryNote = typeof deliveryNotes.$inferInsert;
export type DeliveryNoteLine = typeof deliveryNoteLines.$inferSelect;
export type NewDeliveryNoteLine = typeof deliveryNoteLines.$inferInsert;

export type SalesInvoice = typeof salesInvoices.$inferSelect;
export type NewSalesInvoice = typeof salesInvoices.$inferInsert;
export type SalesInvoiceLine = typeof salesInvoiceLines.$inferSelect;
export type NewSalesInvoiceLine = typeof salesInvoiceLines.$inferInsert;

export type SalesReceipt = typeof salesReceipts.$inferSelect;
export type NewSalesReceipt = typeof salesReceipts.$inferInsert;
export type SalesReceiptAllocation = typeof salesReceiptAllocations.$inferSelect;
export type NewSalesReceiptAllocation = typeof salesReceiptAllocations.$inferInsert;
