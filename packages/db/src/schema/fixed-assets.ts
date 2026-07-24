import {
  pgTable, uuid, varchar, text, integer, bigint, boolean,
  timestamp, date, numeric, index, unique, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, plants } from './company.js';
import { users } from './auth.js';
import { chartOfAccounts, journalEntries } from './accounting.js';
import { purchaseInvoices } from './purchase.js';

// ─── Phase 10 — Fixed Assets module ────────────────────────────────────────
//
// Tracks the lifecycle of capital assets:
//   Capitalization → Depreciation → Disposal / Write-off
//
// Conventions:
//   • Money in PAISE (bigint mode: 'number'). 1 INR = 100 paise. Never float.
//   • Depreciation posts to GL via PostingEngine (depreciationTemplate).
//     DR Depreciation Expense / CR Accumulated Depreciation. NO manual balances.
//   • Depreciation methods: SLM (Straight Line) and WDV (Written Down Value).
//   • Each asset links to a category that defines default GL accounts + rates.
//   • disposal posts a full JV: DR AccumDepn + DR Bank/Cash + DR/CR P&L on Disposal
//     / CR Fixed Asset (original cost).
//   • Append-only journal entries. No direct stock/balance updates.

// ─── Helpers ───────────────────────────────────────────────────────────────

/** A monetary column in paise. bigint avoids the integer paise overflow ceiling. */
const money = (name: string) => bigint(name, { mode: 'number' });

// ─── Enums ───────────────────────────────────────────────────────────────────

export const depreciationMethodEnum = pgEnum('depreciation_method', [
  'slm',   // Straight Line Method (Companies Act / books)
  'wdv',   // Written Down Value (Income Tax Act)
]);

export const assetStatusEnum = pgEnum('asset_status', [
  'active',
  'disposed',
  'written_off',
]);

// ─── Table: asset_categories ────────────────────────────────────────────────
//
// Master for grouping assets by depreciation method, rate, and GL accounts.
// e.g. "Plant & Machinery" → WDV 15%, account 1130, accum 1190, expense 4800.

export const assetCategories = pgTable(
  'asset_categories',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    depreciationMethod: depreciationMethodEnum('depreciation_method').default('slm').notNull(),
    /** Annual depreciation rate as a percentage, e.g. 15.00 */
    annualRatePercent: numeric('annual_rate_percent', { precision: 5, scale: 2 }).notNull(),
    /** Useful life in months (used for SLM; WDV uses rate only) */
    usefulLifeMonths: integer('useful_life_months'),

    // ── GL account mapping ────────────────────────────────────────────────
    /** Asset COA account, e.g. 1130 Plant & Machinery */
    assetCoaAccountId: uuid('asset_coa_account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    /** Accumulated depreciation contra account, e.g. 1190 */
    accumDepnCoaAccountId: uuid('accum_depn_coa_account_id')
      .notNull()
      .references(() => chartOfAccounts.id),
    /** Depreciation expense account, e.g. 4800 */
    depnExpenseCoaAccountId: uuid('depn_expense_coa_account_id')
      .notNull()
      .references(() => chartOfAccounts.id),

    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('asset_categories_company_idx').on(t.companyId),
    uniqueName: unique('asset_categories_company_name_uq').on(t.companyId, t.name),
  })
);

// ─── Table: fixed_assets ────────────────────────────────────────────────────
//
// Each row represents one physical asset (machine, vehicle, building, etc.).
// Capitalised from a Purchase Invoice or created manually.

export const fixedAssets = pgTable(
  'fixed_assets',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    plantId: uuid('plant_id').references(() => plants.id),

    /** Unique per company. e.g. 'FA-0001' */
    assetCode: varchar('asset_code', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),

    categoryId: uuid('category_id')
      .notNull()
      .references(() => assetCategories.id),

    // ── Acquisition ───────────────────────────────────────────────────────
    purchaseDate: date('purchase_date').notNull(),
    /** Optionally link to the purchase invoice that brought this asset in */
    purchaseInvoiceId: uuid('purchase_invoice_id').references(() => purchaseInvoices.id),

    /** Original purchase cost in paise */
    originalCostPaise: money('original_cost_paise').notNull(),
    /** Estimated residual value at end of useful life */
    salvageValuePaise: money('salvage_value_paise').default(0).notNull(),

    // ── Depreciation ──────────────────────────────────────────────────────
    /** Override category default if needed */
    depreciationMethod: depreciationMethodEnum('depreciation_method').notNull(),
    annualRatePercent: numeric('annual_rate_percent', { precision: 5, scale: 2 }).notNull(),
    usefulLifeMonths: integer('useful_life_months'),

    /** Running total of depreciation posted so far */
    accumulatedDepreciationPaise: money('accumulated_depreciation_paise').default(0).notNull(),
    /** originalCost - accumulatedDepreciation */
    currentBookValuePaise: money('current_book_value_paise').notNull(),

    /** Date from which depreciation starts (usually = purchaseDate or next month) */
    depreciationStartDate: date('depreciation_start_date').notNull(),
    /** Last date through which depreciation has been posted */
    lastDepreciationDate: date('last_depreciation_date'),

    // ── Status & disposal ─────────────────────────────────────────────────
    status: assetStatusEnum('status').default('active').notNull(),
    disposalDate: date('disposal_date'),
    disposalAmountPaise: money('disposal_amount_paise'),
    /** GL entry for the disposal */
    disposalJournalEntryId: uuid('disposal_journal_entry_id').references(() => journalEntries.id),
    disposalReason: text('disposal_reason'),

    // ── Location & tracking ───────────────────────────────────────────────
    location: varchar('location', { length: 255 }),
    serialNumber: varchar('serial_number', { length: 100 }),
    warrantyExpiryDate: date('warranty_expiry_date'),

    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCode: unique('fixed_assets_company_code_uq').on(t.companyId, t.assetCode),
    companyIdx: index('fixed_assets_company_idx').on(t.companyId),
    categoryIdx: index('fixed_assets_category_idx').on(t.categoryId),
    statusIdx: index('fixed_assets_status_idx').on(t.companyId, t.status),
  })
);

// ─── Table: depreciation_schedules ──────────────────────────────────────────
//
// One row per depreciation period per asset. Generated when depreciation is run.
// Links to the journal entry created on posting.

export const depreciationSchedules = pgTable(
  'depreciation_schedules',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => fixedAssets.id, { onDelete: 'cascade' }),

    /** Period covered by this depreciation entry */
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    fiscalYear: varchar('fiscal_year', { length: 5 }),

    depreciationAmountPaise: money('depreciation_amount_paise').notNull(),
    /** Book value AFTER this depreciation entry */
    bookValueAfterPaise: money('book_value_after_paise').notNull(),

    /** planned = not yet posted; posted = JE created */
    status: varchar('status', { length: 20 }).default('planned').notNull(),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => users.id),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    assetIdx: index('depreciation_schedules_asset_idx').on(t.assetId),
    statusIdx: index('depreciation_schedules_status_idx').on(t.status),
    periodIdx: index('depreciation_schedules_period_idx').on(t.periodStart, t.periodEnd),
  })
);

// ─── Drizzle inference types ───────────────────────────────────────────────

export type AssetCategory = typeof assetCategories.$inferSelect;
export type NewAssetCategory = typeof assetCategories.$inferInsert;
export type FixedAsset = typeof fixedAssets.$inferSelect;
export type NewFixedAsset = typeof fixedAssets.$inferInsert;
export type DepreciationSchedule = typeof depreciationSchedules.$inferSelect;
export type NewDepreciationSchedule = typeof depreciationSchedules.$inferInsert;
