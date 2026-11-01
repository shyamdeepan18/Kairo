import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    type: varchar('type', { length: 50 }).default('info').notNull(), // 'info' | 'warning' | 'approval' | 'stock' | 'overdue'
    link: varchar('link', { length: 255 }),
    entityType: varchar('entity_type', { length: 100 }),
    entityId: varchar('entity_id', { length: 255 }),
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyUserIdx: index('notifications_company_user_idx').on(t.companyId, t.userId),
    isReadIdx: index('notifications_is_read_idx').on(t.isRead),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
