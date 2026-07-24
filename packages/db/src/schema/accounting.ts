import {
  pgTable, uuid, varchar, text, integer, boolean,
  timestamp, date, numeric, jsonb, index, unique, bigint,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';
import { plants } from './company.js';

// ─── Posting categories ────────────────────────────────────────────────────
//
// The canonical list of posting positions templates can emit.
// AccountMapService resolves these → real GL account UUIDs for each company.
//
// Rules:
//   • Assets & Expenses have normalBalance = 'debit'
//   • Liabilities, Equity & Revenue have normalBalance = 'credit'
//   • GST "input" accounts are assets (debit-normal)
//   • GST "output" accounts are liabilities (credit-normal)

export type PostingCategory =
  // ── Assets ────────────────────────────────────────────────────────────
  | 'inventory_raw_material'
  | 'inventory_wip'
  | 'inventory_semi_finished'
  | 'inventory_finished'
  | 'inventory_stores'
  | 'inventory_scrap'
  | 'accounts_receivable'
  | 'customer_advance'
  | 'supplier_advance'
  | 'cash'
  | 'bank'
  | 'input_cgst'
  | 'input_sgst'
  | 'input_igst'
  // ── Liabilities ───────────────────────────────────────────────────────
  | 'accounts_payable'
  | 'output_cgst'
  | 'output_sgst'
  | 'output_igst'
  // ── Clearing (can sit on either side of B/S) ───────────────────────
  | 'grn_clearing'
  | 'grn_tax_clearing'
  | 'round_off'
  // ── Revenue ───────────────────────────────────────────────────────────
  | 'sales_revenue'
  | 'service_revenue'
  // ── Expenses ──────────────────────────────────────────────────────────
  | 'purchases'
  | 'raw_material_consumed'
  | 'cogs'
  // ── Manufacturing / Inventory adjustment ──────────────────────────────
  /** Gain or loss from physical stock count adjustments */
  | 'stock_adjustment'
  /** Variance between standard cost and actual production cost */
  | 'production_variance'
  /** Absorption of labour cost into WIP */
  | 'labour_absorption'
  /** Absorption of overhead cost into WIP */
  | 'overhead_absorption'
  // ── Fixed Assets ──────────────────────────────────────────────────────────
  | 'fixed_assets'
  | 'accumulated_depreciation'
  | 'depreciation_expense'
  // ── Payroll / HR ──────────────────────────────────────────────────────────
  | 'salary_expense'
  | 'salary_payable'
  | 'pf_employer_contribution'
  | 'esi_employer_contribution'
  | 'pf_payable'
  | 'esi_payable'
  | 'professional_tax_payable';

// ─── Table: chart_of_accounts ─────────────────────────────────────────────
//
// Hierarchical. Group accounts (isGroup=true) cannot receive direct postings.
// Each company gets its own COA seeded on creation.
//
// `postingCategory` links a leaf account to a PostingCategory so the
// AccountMapService can build the company's account map without manual
// configuration.

export const chartOfAccounts = pgTable(
  'chart_of_accounts',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    /** e.g. '1310', '2310' — unique per company */
    code: varchar('code', { length: 20 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),

    /** Top-level account classification */
    accountType: varchar('account_type', { length: 20 }).notNull(),
    // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

    /** Which side normally has a positive balance */
    normalBalance: varchar('normal_balance', { length: 10 }).notNull(),
    // 'debit' | 'credit'

    /** Parent group account; null for root (Assets, Liabilities, etc.) */
    parentId: uuid('parent_id').references((): AnyPgColumn => chartOfAccounts.id),

    /** Group accounts aggregate child balances; leaf accounts receive entries */
    isGroup: boolean('is_group').default(false).notNull(),

    /**
     * Links this account to a PostingCategory so AccountMapService can
     * auto-build the account map from the COA without extra config rows.
     * null on group accounts and on accounts that don't participate in auto-posting.
     */
    postingCategory: varchar('posting_category', { length: 100 }),

    /** Accounts seeded from the standard COA — cannot be deleted */
    isSystemAccount: boolean('is_system_account').default(false).notNull(),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('chart_of_accounts_code_company_uq').on(t.companyId, t.code),
    companyIdx: index('chart_of_accounts_company_idx').on(t.companyId),
    parentIdx: index('chart_of_accounts_parent_idx').on(t.parentId),
  })
);

// ─── Table: company_account_config ────────────────────────────────────────
//
// Maps PostingCategory → chart_of_accounts.id for a company (and optionally
// per plant for multi-plant configurations).
//
// Seeded automatically when the standard COA is created for a company.
// Admins can remap categories via Settings → Account Configuration.
//
// Shape of `config`:
//   { "inventory_raw_material": "uuid", "accounts_payable": "uuid", ... }
//
// Any category not present falls back to the company-level config.

export const companyAccountConfig = pgTable(
  'company_account_config',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** null = company-wide default; set for plant-level overrides */
    plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'cascade' }),

    config: jsonb('config')
      .$type<Partial<Record<PostingCategory, string>>>()
      .default({})
      .notNull(),

    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueConfig: unique('company_account_config_uq').on(t.companyId, t.plantId),
    companyIdx: index('company_account_config_company_idx').on(t.companyId),
  })
);

// ─── Table: journal_entries ────────────────────────────────────────────────
//
// One row per accounting event. Created by PostingEngine, never hand-edited.
// Manual JVs (accounting.jv document type) also land here.

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    plantId: uuid('plant_id').references(() => plants.id),

    /** null only for manual journal vouchers entered directly */
    documentType: varchar('document_type', { length: 100 }),
    documentId: uuid('document_id'),
    documentNumber: varchar('document_number', { length: 50 }),

    /** Generated by NumberSeriesService — 'JV/2425/0001' */
    entryNumber: varchar('entry_number', { length: 50 }).notNull().unique(),

    postingDate: date('posting_date').notNull(),
    /** e.g. '2425' */
    fiscalYear: varchar('fiscal_year', { length: 5 }).notNull(),
    /**
     * Fiscal period (1–12). Indian FY starts April = 1, March = 12.
     * Used for period-wise trial balance and P&L reports.
     */
    period: integer('period').notNull(),

    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    /** Base-currency exchange rate; always 1 for INR entries */
    exchangeRate: numeric('exchange_rate', { precision: 10, scale: 6 }).default('1').notNull(),

    narration: text('narration'),

    /** 'posted' after successful insert; 'reversed' after reversal */
    status: varchar('status', { length: 20 }).default('posted').notNull(),
    isReversed: boolean('is_reversed').default(false).notNull(),
    /** FK to the reversal entry that nullified this one */
    reversedBy: uuid('reversed_by'),
    /** FK to the entry this one reverses; null for original entries */
    reversalOf: uuid('reversal_of'),

    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyDateIdx: index('journal_entries_company_date_idx').on(t.companyId, t.postingDate),
    docIdx: index('journal_entries_doc_idx').on(t.documentType, t.documentId),
    fyPeriodIdx: index('journal_entries_fy_period_idx').on(t.companyId, t.fiscalYear, t.period),
  })
);

// ─── Table: journal_entry_lines ────────────────────────────────────────────
//
// One row per debit or credit within a journal entry.
// INVARIANT: for every journalEntryId, SUM(debit_amount_paise) = SUM(credit_amount_paise).
// PostingEngine enforces this before insert; never bypass it.

export const journalEntryLines = pgTable(
  'journal_entry_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),

    accountId: uuid('account_id')
      .notNull()
      .references(() => chartOfAccounts.id),

    /** Paise. Exactly one of (debit, credit) is > 0; the other is 0. */
    debitAmountPaise: integer('debit_amount_paise').default(0).notNull(),
    creditAmountPaise: integer('credit_amount_paise').default(0).notNull(),

    /** Sub-ledger reference for AR/AP ageing and reconciliation */
    partyType: varchar('party_type', { length: 20 }),  // 'supplier' | 'customer'
    partyId: uuid('party_id'),

    /** Future: cost-centre allocation */
    costCentreId: uuid('cost_centre_id'),

    narration: text('narration'),

    /** GST tax code for tax-account lines (e.g. 'GST18', 'GST5') */
    taxCode: varchar('tax_code', { length: 20 }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    entryIdx: index('journal_entry_lines_entry_idx').on(t.journalEntryId),
    accountIdx: index('journal_entry_lines_account_idx').on(t.accountId),
    partyIdx: index('journal_entry_lines_party_idx').on(t.partyType, t.partyId),
  })
);

// ─── Table: bank_statements ──────────────────────────────────────────────────

export const bankStatements = pgTable(
  'bank_statements',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id').notNull().references(() => chartOfAccounts.id),
    statementDate: date('statement_date').notNull(),
    openingBalance: bigint('opening_balance', { mode: 'number' }).default(0).notNull(),
    closingBalance: bigint('closing_balance', { mode: 'number' }).default(0).notNull(),
    status: varchar('status', { length: 20 }).default('draft').notNull(), // draft | reconciled
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyDateIdx: index('bank_statements_company_date_idx').on(t.companyId, t.statementDate),
  })
);

export const bankStatementLines = pgTable(
  'bank_statement_lines',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    statementId: uuid('statement_id').notNull().references(() => bankStatements.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    description: text('description'),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    reference: varchar('reference', { length: 255 }),
    reconciliationStatus: varchar('reconciliation_status', { length: 20 }).default('unreconciled').notNull(),
  },
  (t) => ({ statementIdx: index('bank_statement_lines_statement_idx').on(t.statementId) })
);

export const bankReconciliations = pgTable(
  'bank_reconciliations',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    statementLineId: uuid('statement_line_id').notNull().references(() => bankStatementLines.id, { onDelete: 'cascade' }),
    journalEntryLineId: uuid('journal_entry_line_id').notNull().references(() => journalEntryLines.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statementLineIdx: index('bank_recons_stmt_line_idx').on(t.statementLineId),
    journalLineIdx: index('bank_recons_je_line_idx').on(t.journalEntryLineId),
  })
);

// ─── Table: bank_accounts (master) ───────────────────────────────────────────
//
// Multi-bank master. Each row links to a leaf COA account (e.g. 1520, 1521).
// Used by bank reconciliation and payment routing.

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),

    accountName: varchar('account_name', { length: 255 }).notNull(),
    bankName: varchar('bank_name', { length: 255 }).notNull(),
    accountNumber: varchar('account_number', { length: 30 }).notNull(),
    ifscCode: varchar('ifsc_code', { length: 11 }),
    branch: varchar('branch', { length: 255 }),
    /** current | savings | od | cc (overdraft / cash-credit) */
    accountType: varchar('account_type', { length: 20 }).default('current').notNull(),

    /** Link to the GL leaf account in chart_of_accounts */
    coaAccountId: uuid('coa_account_id').notNull().references(() => chartOfAccounts.id),

    openingBalancePaise: bigint('opening_balance_paise', { mode: 'number' }).default(0).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),

    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('bank_accounts_company_idx').on(t.companyId),
    uniqueAccNo: unique('bank_accounts_company_accno_uq').on(t.companyId, t.accountNumber),
  })
);

// ─── Table: recurring_invoices ────────────────────────────────────────────────

export const recurringInvoices = pgTable(
  'recurring_invoices',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    /** 'supplier' or 'customer' */
    entityType: varchar('entity_type', { length: 20 }).notNull(),
    entityId: uuid('entity_id').notNull(), 
    frequency: varchar('frequency', { length: 20 }).notNull(), // monthly | weekly | yearly
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    nextRunDate: date('next_run_date').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyNextRunIdx: index('recurring_invoices_co_next_run_idx').on(t.companyId, t.nextRunDate),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type NewChartOfAccount = typeof chartOfAccounts.$inferInsert;
export type CompanyAccountConfig = typeof companyAccountConfig.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type NewJournalEntryLine = typeof journalEntryLines.$inferInsert;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;
export type BankStatement = typeof bankStatements.$inferSelect;
export type NewBankStatement = typeof bankStatements.$inferInsert;
export type BankStatementLine = typeof bankStatementLines.$inferSelect;
export type BankReconciliation = typeof bankReconciliations.$inferSelect;
