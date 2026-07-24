import {
  pgTable, varchar, text, boolean,
  timestamp, uuid, index,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';

// ─── users ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),

  // System admin can access all companies — separate from per-company roles
  isSystemAdmin: boolean('is_system_admin').default(false).notNull(),

  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── sessions ────────────────────────────────────────────────────────────────
// One row per active login. Refresh token is stored here (not in JWT).
// Deleting a row = immediate logout for that session.

export const sessions = pgTable('sessions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Random 128-char hex string — NOT the JWT
  refreshToken: text('refresh_token').notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx:  index('sessions_user_id_idx').on(t.userId),
  tokenIdx: index('sessions_refresh_token_idx').on(t.refreshToken),
  // Compound index — used when cleaning up expired sessions
  expiryIdx: index('sessions_expires_at_idx').on(t.expiresAt),
}));

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ─── Inferred types ──────────────────────────────────────────────────────────

export type User    = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session    = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
