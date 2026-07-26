import { pgTable, uuid, boolean, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.js';
import { companies } from './company.js';
// ─── Table: system_settings ──────────────────────────────────────────────────
// Global settings for the entire ERP deployment (superadmin only)

export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    
    // E.g., enable experimental features, maintenance mode
    maintenanceMode: boolean('maintenance_mode').default(false).notNull(),
    allowNewRegistrations: boolean('allow_new_registrations').default(false).notNull(),

    // Any generic global configurations
    config: jsonb('config').$type<Record<string, unknown>>().default({}),

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
  }
);

// ─── Table: audit_logs ───────────────────────────────────────────────────────
// Lean audit log restricted to tracking critical mutations globally.

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id').references(() => companies.id), // Nullable for system actions
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(), // 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  entity: varchar('entity', { length: 100 }).notNull(), // 'User', 'Invoice', 'Company'
  entityId: varchar('entity_id', { length: 255 }), // ID of the mutated record
  details: jsonb('details'), // Snapshot of changes or context
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
