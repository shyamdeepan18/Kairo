import { pgTable, uuid, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth.js';

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
