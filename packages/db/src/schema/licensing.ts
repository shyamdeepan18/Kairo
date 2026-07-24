import {
  pgTable, uuid, varchar, text, integer, boolean, timestamp, date, index, unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';

// ─── Company module activation / licensing (Permission roadmap item 2B) ─────
//
// Company-level gate: which modules a company may use and how many users. This
// is independent of per-user permissions — a user can hold sales.* permissions
// yet be blocked if the company hasn't licensed the sales module.

export const companyModules = pgTable(
  'company_modules',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    /** 'purchase' | 'inventory' | 'accounting' | 'sales' | 'manufacturing' | ... */
    module: varchar('module', { length: 30 }).notNull(),
    isEnabled: boolean('is_enabled').default(true).notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    /** null = no expiry */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueModule: unique('company_modules_company_module_uq').on(t.companyId, t.module),
    companyIdx: index('company_modules_company_idx').on(t.companyId),
  })
);

export const companyLicense = pgTable(
  'company_license',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }).unique(),
    edition: varchar('edition', { length: 50 }),
    /** Max active users. -1 = unlimited */
    maxUsers: integer('max_users').default(-1).notNull(),
    validFrom: date('valid_from'),
    /** null = perpetual */
    validTo: date('valid_to'),
    /** Signed license blob — verified offline (on-prem has no phone-home) */
    licenseKey: text('license_key'),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ companyIdx: index('company_license_company_idx').on(t.companyId) })
);

export type CompanyModule = typeof companyModules.$inferSelect;
export type NewCompanyModule = typeof companyModules.$inferInsert;
export type CompanyLicense = typeof companyLicense.$inferSelect;
export type NewCompanyLicense = typeof companyLicense.$inferInsert;
