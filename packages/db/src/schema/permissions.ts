import {
  pgTable, varchar, text, boolean,
  timestamp, uuid, index, primaryKey, integer,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './auth.js';
import { companies, plants, warehouses } from './company.js';

// ─── permissions ──────────────────────────────────────────────────────────────
// Master list of every possible action in the system.
// Populated by the seed script — never by users.
//
// Permission code format: <module>.<document_type>.<action>
//   e.g. 'purchase.po.approve', 'inventory.stock.transfer'

export const permissions = pgTable('permissions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  code: varchar('code', { length: 100 }).notNull().unique(), // e.g. 'purchase.po.approve'
  module: varchar('module', { length: 50 }).notNull(),       // e.g. 'purchase'
  documentType: varchar('document_type', { length: 50 }),    // e.g. 'po' (null for module-level)
  action: varchar('action', { length: 50 }).notNull(),       // e.g. 'approve'
  label: varchar('label', { length: 255 }).notNull(),        // human-readable
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  moduleIdx: index('permissions_module_idx').on(t.module),
}));

// ─── roles ────────────────────────────────────────────────────────────────────
// Named bundles of permissions.
// System roles (is_system_role = true) are seeded and cannot be deleted.
// Companies can also create their own custom roles.

export const roles = pgTable('roles', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id')
    .references(() => companies.id, { onDelete: 'cascade' }),  // null = system role
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  isSystemRole: boolean('is_system_role').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  companyIdx: index('roles_company_id_idx').on(t.companyId),
}));

// ─── role_permissions ─────────────────────────────────────────────────────────
// Many-to-many: which permissions does a role grant?

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id')
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
}));

// ─── user_roles ───────────────────────────────────────────────────────────────
// Assigns a role to a user within a company.
// plant_id = null  → role applies to ALL plants in the company
// plant_id = <id>  → role applies only to that specific plant
//
// A user can have multiple rows — e.g.:
//   Purchase Manager at Plant A (plant_id = A)
//   Purchase User at Plant B    (plant_id = B)
//   Inventory Manager all plants (plant_id = null)

export const userRoles = pgTable('user_roles', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .references(() => plants.id, { onDelete: 'cascade' }),  // null = all plants
  grantedBy: uuid('granted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx:    index('user_roles_user_id_idx').on(t.userId),
  companyIdx: index('user_roles_company_id_idx').on(t.companyId),
  // Composite index used in permission resolution query
  userCompanyIdx: index('user_roles_user_company_idx').on(t.userId, t.companyId),
}));

// ─── user_permissions ─────────────────────────────────────────────────────────
// Direct per-user permission overrides.
// is_granted = true  → explicitly grant (extends what roles give)
// is_granted = false → explicitly DENY (overrides any role grant)
//
// Use sparingly — prefer role management over per-user overrides.
// Common use: deny a specific action to one user without creating a new role.

export const userPermissions = pgTable('user_permissions', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id')
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .references(() => plants.id, { onDelete: 'cascade' }),   // null = all plants
  isGranted: boolean('is_granted').notNull(),                 // true = grant, false = deny
  reason: text('reason'),                                     // audit trail for the override
  grantedBy: uuid('granted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userIdx: index('user_permissions_user_id_idx').on(t.userId),
  userCompanyIdx: index('user_permissions_user_company_idx').on(t.userId, t.companyId),
}));

// ─── user_plant_access ────────────────────────────────────────────────────────
// Explicit list of which plants a user can see data from.
// A user with a role scoped to Plant A implicitly gets plant access to Plant A.
// This table handles data-visibility: a user can SEE Plant B's stock but not TRANSACT.

export const userPlantAccess = pgTable('user_plant_access', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .notNull()
    .references(() => plants.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.plantId] }),
  userIdx: index('user_plant_access_user_id_idx').on(t.userId),
}));

// ─── user_warehouse_access ────────────────────────────────────────────────────
// Restricts which warehouses a user can issue from / receive into.
// If a user has no rows here for a warehouse, they can see stock but not transact.

export const userWarehouseAccess = pgTable('user_warehouse_access', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  canIssue: boolean('can_issue').default(true).notNull(),
  canReceive: boolean('can_receive').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.warehouseId] }),
}));

// ─── user_approval_limits ─────────────────────────────────────────────────────
// Monetary approval limits per user per document type.
// max_amount_paise = -1 means unlimited.
// If no row exists for a (user, doc_type, plant), the user has NO approval limit
// (unlimited) — so this table only needs rows to RESTRICT approvals.

export const userApprovalLimits = pgTable('user_approval_limits', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  plantId: uuid('plant_id')
    .references(() => plants.id, { onDelete: 'cascade' }),   // null = all plants
  documentType: varchar('document_type', { length: 100 }).notNull(), // e.g. 'purchase.po'
  // Stored in paise (1 INR = 100 paise) to avoid float precision issues
  // -1 = unlimited
  maxAmountPaise: integer('max_amount_paise').default(-1).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userDocIdx: index('user_approval_limits_user_doc_idx').on(t.userId, t.documentType),
}));

// ─── Relations ────────────────────────────────────────────────────────────────

export const rolesRelations = relations(roles, ({ one, many }) => ({
  company: one(companies, { fields: [roles.companyId], references: [companies.id] }),
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
  company: one(companies, { fields: [userRoles.companyId], references: [companies.id] }),
  plant: one(plants, { fields: [userRoles.plantId], references: [plants.id] }),
}));

// ─── Inferred types ──────────────────────────────────────────────────────────

export type Permission       = typeof permissions.$inferSelect;
export type Role             = typeof roles.$inferSelect;
export type NewRole          = typeof roles.$inferInsert;
export type UserRole         = typeof userRoles.$inferSelect;
export type NewUserRole      = typeof userRoles.$inferInsert;
export type UserPermission   = typeof userPermissions.$inferSelect;
export type UserApprovalLimit = typeof userApprovalLimits.$inferSelect;
