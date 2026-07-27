import {
  pgTable, varchar, text, boolean,
  timestamp, uuid, index, uniqueIndex, pgEnum, numeric,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './auth.js';

export const companyUsers = pgTable('company_users', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  companyIdx: index('company_users_company_id_idx').on(t.companyId),
  userIdx: index('company_users_user_id_idx').on(t.userId),
  // One membership row per (company, user) — used as the authoritative source
  // for tenant context selection. Prevents duplicate memberships.
  companyUserUq: uniqueIndex('company_users_company_user_uq').on(t.companyId, t.userId),
}));

// ─── companies ───────────────────────────────────────────────────────────────
// One database can serve multiple companies (multi-tenant).
// All transactional data is scoped to a company.

export const companies = pgTable('companies', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  legalName: varchar('legal_name', { length: 255 }),   // full registered name
  gstin: varchar('gstin', { length: 15 }),              // company-level GSTIN
  pan: varchar('pan', { length: 10 }),
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  stateCode: varchar('state_code', { length: 2 }),      // GST state code (e.g. '29' for Karnataka)
  pincode: varchar('pincode', { length: 6 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 255 }),

  // Accounting
  baseCurrency: varchar('base_currency', { length: 3 }).default('INR').notNull(),
  financialYearStart: varchar('financial_year_start', { length: 5 }).default('04-01').notNull(), // MM-DD

  // Logo stored as path (Phase 9: served from static files)
  logoPath: text('logo_path'),

  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
});

// ─── plants ──────────────────────────────────────────────────────────────────
// A manufacturing unit / factory / branch within a company.
// Key GST concept: plants in different states have different GSTINs.

export const plants = pgTable('plants', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 20 }).notNull(),      // short code, e.g. 'MUM-01'
  name: varchar('name', { length: 255 }).notNull(),
  gstin: varchar('gstin', { length: 15 }),              // plant may have its own GSTIN
  address: text('address'),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 100 }),
  stateCode: varchar('state_code', { length: 2 }),
  pincode: varchar('pincode', { length: 6 }),
  phone: varchar('phone', { length: 20 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
}, (t) => ({
  companyIdx: index('plants_company_id_idx').on(t.companyId),
  codeIdx: index('plants_code_company_idx').on(t.companyId, t.code),
}));

// ─── warehouses ───────────────────────────────────────────────────────────────
// A physical storage location within a plant.
// Stock movements are always between warehouses.

export const warehouseTypeEnum = pgEnum('warehouse_type', [
  'raw_material',
  'work_in_progress',
  'finished_goods',
  'scrap',
  'transit',
  'consignment',
]);

export const warehouses = pgTable('warehouses', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')     // denormalized for easy joins
    .notNull()
    .references(() => companies.id),
  code: varchar('code', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  warehouseType: warehouseTypeEnum('warehouse_type').default('raw_material').notNull(),
  isDefault: boolean('is_default').default(false).notNull(), // default receiving warehouse for plant
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
}, (t) => ({
  plantIdx: index('warehouses_plant_id_idx').on(t.plantId),
  companyIdx: index('warehouses_company_id_idx').on(t.companyId),
}));

// ─── Table: company_settings ──────────────────────────────────────────────────

export const companySettings = pgTable(
  'company_settings',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }).unique(),
    
    // Feature flags and toggles
    enableBackorders: boolean('enable_backorders').default(false).notNull(),
    enableQualityControl: boolean('enable_quality_control').default(false).notNull(),
    allowNegativeStock: boolean('allow_negative_stock').default(false).notNull(),
    enforceStrictAccounting: boolean('enforce_strict_accounting').default(true).notNull(),

    // Finance/Tolerance settings
    grnInvoiceTolerancePct: numeric('grn_invoice_tolerance_pct', { precision: 5, scale: 2 }).default('0').notNull(),
    defaultTaxCodeId: uuid('default_tax_code_id'), // We can't refer to taxCodes here due to circular deps if we aren't careful, so we just use uuid

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
  }
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const companiesRelations = relations(companies, ({ many }) => ({
  plants: many(plants),
  warehouses: many(warehouses),
  companyUsers: many(companyUsers),
}));

export const plantsRelations = relations(plants, ({ one, many }) => ({
  company: one(companies, { fields: [plants.companyId], references: [companies.id] }),
  warehouses: many(warehouses),
}));

export const warehousesRelations = relations(warehouses, ({ one }) => ({
  plant: one(plants, { fields: [warehouses.plantId], references: [plants.id] }),
  company: one(companies, { fields: [warehouses.companyId], references: [companies.id] }),
}));

export const companyUsersRelations = relations(companyUsers, ({ one }) => ({
  company: one(companies, { fields: [companyUsers.companyId], references: [companies.id] }),
  user: one(users, { fields: [companyUsers.userId], references: [users.id] }),
}));

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Company    = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Plant      = typeof plants.$inferSelect;
export type NewPlant   = typeof plants.$inferInsert;
export type Warehouse  = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
export type CompanyUser = typeof companyUsers.$inferSelect;
export type NewCompanyUser = typeof companyUsers.$inferInsert;
