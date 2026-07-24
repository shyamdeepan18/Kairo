import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';
import { plants } from './company.js';

// ─── TypeScript types for JSONB columns ──────────────────────────────────────

/** L1: field-level behavioral overrides for existing schema columns */
export interface L1FieldConfig {
  visible?: boolean;
  required?: boolean;
  label?: string;
  defaultValue?: unknown;
}

export interface L1Config {
  /** Header-level field overrides keyed by fieldName */
  fields?: Record<string, L1FieldConfig>;
  /** Line-level field overrides keyed by fieldName */
  lineFields?: Record<string, L1FieldConfig>;
}

/** L2: custom field types supported */
export type L2FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'currency'   // stored in paise
  | 'link';      // FK reference to a master (e.g. Project, Cost Centre)

/** L2: definition of a single custom field */
export interface L2FieldDef {
  /** Stable machine-readable id — never rename after creation */
  id: string;
  fieldName: string;
  label: string;
  fieldType: L2FieldType;
  /** 'header' = on the document row; 'line' = on the lines table row */
  scope: 'header' | 'line';
  required: boolean;
  /** Show in list/table views */
  showInList?: boolean;
  /** For select / multiselect */
  options?: string[];
  /** For link type: which master to link to (e.g. 'project', 'cost_centre') */
  linkTo?: string;
  validations?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    /** JS regex pattern string */
    pattern?: string;
  };
}

export interface L2Fields {
  fields: L2FieldDef[];
}

// ─── Table: document_type_config ─────────────────────────────────────────────
//
// One row per (company, document_type). Stores L1 config (field visibility,
// required overrides, label overrides) and L2 definitions (custom fields).
//
// System defaults are applied in DocumentConfigService when no row exists.

export const documentTypeConfig = pgTable(
  'document_type_config',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Dot-namespaced doc type: 'purchase.po', 'sales.so', 'accounting.jv' */
    documentType: varchar('document_type', { length: 100 }).notNull(),

    // L1: behavioral overrides for existing columns
    l1Config: jsonb('l1_config').$type<L1Config>().default({}).notNull(),

    // L2: custom field definitions (values stored on the document row itself)
    l2Fields: jsonb('l2_fields').$type<L2Fields>().default({ fields: [] }).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueConfig: unique('document_type_config_company_type_uq').on(t.companyId, t.documentType),
    companyIdx: index('document_type_config_company_idx').on(t.companyId),
  })
);

// ─── Table: document_number_series ───────────────────────────────────────────
//
// Each row tracks one numbering stream. A stream is uniquely identified by
// (company_id, document_type, plant_id, fiscal_year). If plant_id IS NULL
// the series applies to all plants in that company.
//
// NumberSeriesService uses UPDATE…RETURNING (atomic) so no two documents
// share a number and no gaps are ever introduced in the sequence.

export const documentNumberSeries = pgTable(
  'document_number_series',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** null = applies to all plants */
    plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 100 }).notNull(),

    /** e.g. 'PO', 'GRN', 'SI', 'JV' */
    prefix: varchar('prefix', { length: 20 }).notNull(),
    /** e.g. '2425' for FY 2024–25. null = no fiscal-year segment */
    fiscalYear: varchar('fiscal_year', { length: 5 }),
    /** Prepend fiscal year to number: PO/2425/0001 */
    includeFiscalYear: boolean('include_fiscal_year').default(true).notNull(),
    /** Prepend plant code: PO/2425/MUM/0001 */
    includePlantCode: boolean('include_plant_code').default(false).notNull(),
    /** Zero-padding width: 4 → '0001' */
    padding: integer('padding').default(4).notNull(),
    /** Last issued number. Next document gets currentNumber + 1. */
    currentNumber: integer('current_number').default(0).notNull(),
    /** Reset to 0 at the start of each fiscal year */
    resetOnNewYear: boolean('reset_on_new_year').default(true).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueSeries: unique('document_number_series_uq').on(
      t.companyId,
      t.documentType,
      t.plantId,
      t.fiscalYear
    ),
    companyTypeIdx: index('document_number_series_company_type_idx').on(t.companyId, t.documentType),
  })
);

// ─── Table: document_audit_log ────────────────────────────────────────────────
//
// Append-only. Never update or delete rows. Every create, field edit, and
// status transition for every document lands here.
//
// document_id is intentionally not a DB-level FK — different document types
// live in different tables. The (document_type, document_id) pair is the
// logical reference.

export const documentAuditLog = pgTable(
  'document_audit_log',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    documentType: varchar('document_type', { length: 100 }).notNull(),
    /** UUID of the document in its own module table */
    documentId: uuid('document_id').notNull(),
    /** Denormalized for display without joining the module table */
    documentNumber: varchar('document_number', { length: 50 }),

    /**
     * What happened:
     *   'created'    — document first saved
     *   'updated'    — one or more fields changed
     *   'submitted'  — status draft → submitted
     *   'approved'   — status submitted → approved
     *   'rejected'   — status submitted → rejected
     *   'cancelled'  — status → cancelled
     *   'closed'     — status → closed
     */
    action: varchar('action', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }),

    /**
     * For 'updated': { fieldName: { old: value, new: value } }
     * Omit unchanged fields. Nested JSONB values are deep-diffed.
     */
    changes: jsonb('changes').$type<Record<string, { old: unknown; new: unknown }>>(),

    /** Cancellation reason, rejection remarks, etc. */
    remarks: text('remarks'),

    performedBy: uuid('performed_by')
      .notNull()
      .references(() => users.id),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    /** Primary query path: "show me the audit trail for this document" */
    docIdx: index('document_audit_log_doc_idx').on(t.documentType, t.documentId),
    companyIdx: index('document_audit_log_company_idx').on(t.companyId, t.performedAt),
  })
);

// ─── Drizzle inference types ──────────────────────────────────────────────────

export type DocumentTypeConfig = typeof documentTypeConfig.$inferSelect;
export type NewDocumentTypeConfig = typeof documentTypeConfig.$inferInsert;
export type DocumentNumberSeries = typeof documentNumberSeries.$inferSelect;
export type NewDocumentNumberSeries = typeof documentNumberSeries.$inferInsert;
export type DocumentAuditLog = typeof documentAuditLog.$inferSelect;
export type NewDocumentAuditLog = typeof documentAuditLog.$inferInsert;
