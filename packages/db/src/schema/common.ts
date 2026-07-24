import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Standard columns shared across every ERP table.
 * Spread into pgTable definitions:
 *   export const myTable = pgTable('my_table', { ...baseColumns, ... })
 */
export const baseColumns = {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const makeAuditColumns = (usersTable: any) => ({
  createdBy: uuid('created_by').references(() => usersTable.id),
  updatedBy: uuid('updated_by').references(() => usersTable.id),
});
