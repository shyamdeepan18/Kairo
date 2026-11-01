/**
 * Settings API — company-scoped admin routes
 *
 * Registered at: /api/settings/:companyId
 *
 * Every route runs authenticate + resolveTenantContext (the tenant is derived
 * from the trusted session/JWT, never the URL param) and is gated by authorize()
 * against a permission: company / number-series / tax-codes / custom-fields /
 * HSN use settings.company.*; plants and warehouses use settings.plant.* and
 * settings.warehouse.*; users use auth.users.*; roles use auth.roles.* and
 * auth.permissions.manage; chart of accounts uses accounting.coa.*; approval
 * workflows use settings.approvalworkflow.view and .manage.
 * Config routes whose params/body carry a plantId/warehouseId that names the
 * object being administered pass authorize's { noScope: true } so they are not
 * subject to operational plant/warehouse access grants.
 *
 * Phase 4: every write body is parsed by a strict Zod DTO. Server-owned fields
 * (id/companyId/audit) are removed by stripServerOwned() before parsing — never
 * mass-assignable, but tolerated if echoed back; any other stray key is rejected.
 * Client-supplied foreign keys (account parentId, warehouse/number-series plantId,
 * invite roleId/plantId, workflow approver role/user) are proven to belong to the
 * active tenant via assertOwned/assertOwnedOrGlobal.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '@erp/db';
import {
  companies, plants, warehouses, users, userRoles, roles, rolePermissions,
  permissions, chartOfAccounts, taxCodes, hsnSacCodes,
  documentNumberSeries, documentTypeConfig,
  userApprovalLimits, companyUsers,
  approvalWorkflows,
  approvalWorkflowLevels,
} from '@erp/db';
import type { L2Fields } from '@erp/db';
import { eq, and, inArray, isNull, desc, ilike, or, asc } from 'drizzle-orm';
import argon2 from 'argon2';
import { authorize } from '../middleware/authorize.js';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { byTenantId } from '../db/tenant-query.js';
import { assertOwned, assertOwnedOrGlobal } from '../db/fk-ownership.js';
import { stripServerOwned } from '../db/dto.js';

/**
 * 404 helper. @fastify/sensible was never installed/registered, so
 * `app.httpErrors` is undefined at runtime — the old calls threw a 500.
 * Fastify honours `err.statusCode`, giving a proper 404.
 */
function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 });
}

/** 400 helper for a failed DTO parse. */
function invalid(reply: FastifyReply, parsed: { error: z.ZodError }) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}

// ─── helpers: number series formatting ─────────────────────────────────────

/** Returns the fiscal year string for the current date (Indian FY Apr–Mar). FY 2026–27 → '2627' */
function currentFiscalYear(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`;
}

/** Build a sample formatted number for preview, e.g. PO/2627/MUM/0001 */
function previewNumber(s: {
  prefix: string; padding: number; includeFiscalYear: boolean;
  includePlantCode: boolean; fiscalYear: string | null; currentNumber: number;
}, plantCode?: string): string {
  const seq = String((s.currentNumber ?? 0) + 1).padStart(s.padding, '0');
  const parts = [s.prefix];
  if (s.includeFiscalYear && s.fiscalYear) parts.push(s.fiscalYear);
  if (s.includePlantCode) parts.push(plantCode ?? 'PLT');
  parts.push(seq);
  return parts.join('/');
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function randomPassword(len = 12) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Current user id. The authenticate decorator remaps the JWT to `request.user.id`
 * (the token's `sub`), so reading `.sub` off request.user returns undefined — the
 * previous `(req.user as { sub }).sub` silently nulled createdBy/updatedBy.
 */
const uid = (req: { user?: unknown }) => (req.user as { id?: string; sub?: string }).id
  ?? (req.user as { sub?: string }).sub ?? null;

// ─── Strict DTO schemas ─────────────────────────────────────────────────────
// Server-owned fields (id/companyId/audit) are removed by stripServerOwned()
// before parsing; these schemas allowlist everything else and reject stray keys.

const uuid = z.string().uuid();
const optStr = (max: number) => z.string().max(max).optional();

const companyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  legalName: optStr(255),
  gstin: z.string().length(15).optional(),
  pan: z.string().length(10).optional(),
  address: z.string().optional(),
  city: optStr(100),
  state: optStr(100),
  stateCode: z.string().length(2).optional(),
  pincode: optStr(6),
  phone: optStr(20),
  email: optStr(255),
  website: optStr(255),
  baseCurrency: optStr(3),
  financialYearStart: optStr(10),
}).strict();

const inviteUserSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(255),
  roleId: uuid,
  plantId: uuid.optional(),
}).strict();

const toggleUserSchema = z.object({ isActive: z.boolean() }).strict();

const roleCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: optStr(500),
}).strict();

const rolePermissionsSchema = z.object({
  grantedCodes: z.array(z.string().min(1).max(100)),
}).strict();

const accountCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  accountType: z.string().min(1).max(20),
  normalBalance: z.string().min(1).max(10),
  parentId: uuid.optional(),
  isGroup: z.boolean().optional(),
  postingCategory: optStr(100),
}).strict();
const accountUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  postingCategory: optStr(100),
  isActive: z.boolean().optional(),
}).strict();

const plantBase = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  gstin: z.string().length(15).optional(),
  address: z.string().optional(),
  city: optStr(100),
  state: optStr(100),
  stateCode: z.string().length(2).optional(),
  pincode: optStr(6),
  phone: optStr(20),
});
const plantCreateSchema = plantBase.strict();
const plantUpdateSchema = plantBase.extend({ isActive: z.boolean() }).partial().strict();

const warehouseTypeEnum = z.enum([
  'raw_material', 'work_in_progress', 'finished_goods', 'scrap', 'transit', 'consignment',
]);
const warehouseCreateSchema = z.object({
  plantId: uuid,
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  warehouseType: warehouseTypeEnum.optional(),
  isDefault: z.boolean().optional(),
}).strict();
const warehouseUpdateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  warehouseType: warehouseTypeEnum.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

const numberSeriesCreateSchema = z.object({
  documentType: z.string().min(1).max(50),
  prefix: z.string().min(1).max(20),
  plantId: uuid.optional(),
  fiscalYear: optStr(10),
  includeFiscalYear: z.boolean().optional(),
  includePlantCode: z.boolean().optional(),
  padding: z.number().int().min(1).max(12).optional(),
  currentNumber: z.number().int().nonnegative().optional(),
  resetOnNewYear: z.boolean().optional(),
}).strict();
const numberSeriesUpdateSchema = z.object({
  prefix: z.string().min(1).max(20).optional(),
  includeFiscalYear: z.boolean().optional(),
  includePlantCode: z.boolean().optional(),
  padding: z.number().int().min(1).max(12).optional(),
  currentNumber: z.number().int().nonnegative().optional(),
  resetOnNewYear: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

const taxCodeCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  rateType: z.string().min(1).max(20),
  gstRateBp: z.number().int().nonnegative(),
  cessRateBp: z.number().int().nonnegative().optional(),
}).strict();
const taxCodeUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
}).strict();

const l2FieldSchema = z.object({
  id: z.string().min(1),
  fieldName: z.string().min(1),
  label: z.string().min(1),
  fieldType: z.string().min(1),
  scope: z.enum(['header', 'line']),
  required: z.boolean(),
  showInList: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  linkTo: z.string().optional(),
  validations: z.object({
    minLength: z.number().int().optional(),
    maxLength: z.number().int().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).strict().optional(),
}).strict();
const customFieldsPutSchema = z.object({
  documentType: z.string().min(1).max(100),
  fields: z.array(l2FieldSchema),
}).strict();

const workflowLevelSchema = z.object({
  id: uuid.optional(),
  level: z.number().int().positive(),
  thresholdMinPaise: z.number().int().nonnegative(),
  thresholdMaxPaise: z.number().int().nonnegative().nullable(),
  approverType: z.enum(['user', 'role']),
  approverUserId: uuid.nullable().optional(),
  approverRoleId: uuid.nullable().optional(),
  requiredApprovals: z.number().int().positive(),
}).strict();
const workflowPutSchema = z.object({
  levels: z.array(workflowLevelSchema),
}).strict();

export default async function settingsRoutes(app: FastifyInstance) {
  // ── Chart of Accounts Static Alias ──────────────────────────────────────────
  app.get(
    '/coa',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('accounting.coa.view')] },
    async (req) => {
      const list = await db
        .select({
          id: chartOfAccounts.id,
          code: chartOfAccounts.code,
          name: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          normalBalance: chartOfAccounts.normalBalance,
          parentId: chartOfAccounts.parentId,
          isGroup: chartOfAccounts.isGroup,
          postingCategory: chartOfAccounts.postingCategory,
          isSystemAccount: chartOfAccounts.isSystemAccount,
          isActive: chartOfAccounts.isActive,
        })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.companyId, tenant(req).companyId))
        .orderBy(chartOfAccounts.code);
      return { accounts: list };
    }
  );

  // ── Company ────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.view')] },
    async (req) => {
      const [co] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, tenant(req).companyId));
      if (!co) notFound('Company not found');
      return { company: co };
    }
  );

  app.patch<{
    Params: { companyId: string };
    Body: {
      name?: string; legalName?: string; gstin?: string; pan?: string;
      address?: string; city?: string; state?: string; stateCode?: string;
      pincode?: string; phone?: string; email?: string; website?: string;
      baseCurrency?: string; financialYearStart?: string;
    };
  }>(
    '/:companyId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')] },
    async (req, reply) => {
      const parsed = companyUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const [updated] = await db
        .update(companies)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(companies.id, companyId))
        .returning();
      if (!updated) notFound('Company not found');
      return { company: updated };
    }
  );

  // ── Users ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/users',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.users.view')] },
    async (req) => {
      const { companyId } = tenant(req);

      // Get all user-role assignments for this company
      const assignments = await db
        .select({
          userId: userRoles.userId,
          roleId: userRoles.roleId,
          plantId: userRoles.plantId,
          roleName: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.companyId, companyId));

      // Get distinct user IDs
      const userIds = [...new Set(assignments.map((a) => a.userId))];
      if (userIds.length === 0) return { users: [] };

      const userList = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          isActive: users.isActive,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(inArray(users.id, userIds));

      // Attach roles to users
      const result = userList.map((u) => ({
        ...u,
        roles: assignments
          .filter((a) => a.userId === u.id)
          .map((a) => ({ roleId: a.roleId, roleName: a.roleName, plantId: a.plantId })),
      }));

      return { users: result };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: { email: string; fullName: string; roleId: string; plantId?: string };
  }>(
    '/:companyId/users/invite',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.users.create', { noScope: true })] },
    async (req, reply) => {
      const parsed = inviteUserSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const { email, fullName, roleId, plantId } = parsed.data;
      // The role (a tenant role or a shared system role) and the optional plant
      // must belong to this company — never a ref smuggled in from another tenant.
      await assertOwnedOrGlobal(roles, roleId, companyId, 'Role');
      await assertOwned(plants, plantId, companyId, 'Plant');

      // Check if user already exists
      let [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase()));

      let userId: string;
      let tempPassword: string | null = null;

      if (existing) {
        userId = existing.id;
      } else {
        // Create new user with temp password
        tempPassword = randomPassword();
        const hash = await argon2.hash(tempPassword, { type: argon2.argon2id });
        const [created] = await db
          .insert(users)
          .values({ email: email.toLowerCase(), fullName, passwordHash: hash })
          .returning({ id: users.id });
        userId = created.id;
      }

      // Assign role
      await db
        .insert(userRoles)
        .values({
          userId,
          roleId,
          companyId,
          plantId: plantId ?? null,
          grantedBy: uid(req),
        })
        .onConflictDoNothing();

      reply.code(201);
      return { userId, tempPassword, message: existing ? 'Role assigned to existing user.' : 'User created.' };
    }
  );

  app.patch<{
    Params: { companyId: string; userId: string };
    Body: { isActive: boolean };
  }>(
    '/:companyId/users/:userId/toggle',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.users.deactivate')] },
    async (req, reply) => {
      const parsed = toggleUserSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { userId } = req.params;
      const { companyId } = tenant(req);
      // Only toggle a user who is a member of the active company — otherwise a
      // user in company A could (de)activate an unrelated user in company B.
      const [membership] = await db.select({ id: userRoles.id }).from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.companyId, companyId))).limit(1);
      if (!membership) notFound('User not found in this company');
      const [updated] = await db
        .update(users)
        .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id, isActive: users.isActive });
      return { user: updated };
    }
  );

  // ── Roles ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/roles',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.roles.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const list = await db
        .select()
        .from(roles)
        .where(
          // Company's own roles + system roles (companyId = null)
          eq(roles.companyId, companyId)
        )
        .orderBy(roles.name);
      return { roles: list };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: { name: string; description?: string };
  }>(
    '/:companyId/roles',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.roles.manage')] },
    async (req, reply) => {
      const parsed = roleCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const [created] = await db
        .insert(roles)
        .values({ companyId, name: parsed.data.name, description: parsed.data.description })
        .returning();
      reply.code(201);
      return { role: created };
    }
  );

  // Get permissions granted to a role (returns permission codes)
  app.get<{ Params: { companyId: string; roleId: string } }>(
    '/:companyId/roles/:roleId/permissions',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.roles.view')] },
    async (req) => {
      const { roleId } = req.params;
      // The role must belong to the active tenant.
      const [role] = await db.select({ id: roles.id }).from(roles)
        .where(byTenantId(roles, roleId, tenant(req).companyId)).limit(1);
      if (!role) notFound('Role not found');
      const rows = await db
        .select({ code: permissions.code })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, roleId));
      return { grantedCodes: rows.map((r) => r.code) };
    }
  );

  // Bulk-replace permissions for a role
  app.put<{
    Params: { companyId: string; roleId: string };
    Body: { grantedCodes: string[] };
  }>(
    '/:companyId/roles/:roleId/permissions',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('auth.permissions.manage')] },
    async (req, reply) => {
      const parsed = rolePermissionsSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { roleId } = req.params;
      const { grantedCodes } = parsed.data;

      // The role must belong to the active tenant before its permissions change.
      const [role] = await db.select({ id: roles.id }).from(roles)
        .where(byTenantId(roles, roleId, tenant(req).companyId)).limit(1);
      if (!role) notFound('Role not found');

      await db.transaction(async (tx) => {
        // Delete all existing permissions for this role
        await tx
          .delete(rolePermissions)
          .where(eq(rolePermissions.roleId, roleId));

        if (grantedCodes.length === 0) return;

        // Look up permission IDs for the provided codes
        const permRows = await tx
          .select({ id: permissions.id, code: permissions.code })
          .from(permissions)
          .where(inArray(permissions.code, grantedCodes));

        if (permRows.length === 0) return;

        await tx.insert(rolePermissions).values(
          permRows.map((p) => ({ roleId, permissionId: p.id }))
        );
      });

      return { ok: true, count: grantedCodes.length };
    }
  );

  // ── Chart of Accounts ──────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/accounts',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('accounting.coa.view')] },
    async (req) => {
      const list = await db
        .select({
          id: chartOfAccounts.id,
          code: chartOfAccounts.code,
          name: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          normalBalance: chartOfAccounts.normalBalance,
          parentId: chartOfAccounts.parentId,
          isGroup: chartOfAccounts.isGroup,
          postingCategory: chartOfAccounts.postingCategory,
          isSystemAccount: chartOfAccounts.isSystemAccount,
          isActive: chartOfAccounts.isActive,
        })
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.companyId, tenant(req).companyId))
        .orderBy(chartOfAccounts.code);
      return { accounts: list };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: {
      code: string; name: string; accountType: string; normalBalance: string;
      parentId?: string; isGroup?: boolean; postingCategory?: string;
    };
  }>(
    '/:companyId/accounts',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('accounting.coa.manage')] },
    async (req, reply) => {
      const parsed = accountCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      await assertOwned(chartOfAccounts, parsed.data.parentId, companyId, 'Parent account');
      const [created] = await db
        .insert(chartOfAccounts)
        .values({
          ...parsed.data,
          companyId,
          isGroup: parsed.data.isGroup ?? false,
          createdBy: uid(req),
        })
        .returning();
      reply.code(201);
      return { account: created };
    }
  );

  app.patch<{
    Params: { companyId: string; accountId: string };
    Body: { name?: string; postingCategory?: string; isActive?: boolean };
  }>(
    '/:companyId/accounts/:accountId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('accounting.coa.manage')] },
    async (req, reply) => {
      const parsed = accountUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { accountId } = req.params;
      const [updated] = await db
        .update(chartOfAccounts)
        .set({ ...parsed.data, updatedAt: new Date(), updatedBy: uid(req) })
        .where(byTenantId(chartOfAccounts, accountId, tenant(req).companyId))
        .returning();
      if (!updated) notFound('Account not found');
      return { account: updated };
    }
  );

  // ── Plants ───────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/plants',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.plants.view')] },
    async (req) => {
      const list = await db
        .select()
        .from(plants)
        .where(eq(plants.companyId, tenant(req).companyId))
        .orderBy(asc(plants.code));
      return { plants: list };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: {
      code: string; name: string; gstin?: string; address?: string;
      city?: string; state?: string; stateCode?: string; pincode?: string; phone?: string;
    };
  }>(
    '/:companyId/plants',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.plant.create')] },
    async (req, reply) => {
      const parsed = plantCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const [created] = await db
        .insert(plants)
        .values({ ...parsed.data, companyId, createdBy: uid(req) })
        .returning();
      reply.code(201);
      return { plant: created };
    }
  );

  app.patch<{
    Params: { companyId: string; plantId: string };
    Body: {
      code?: string; name?: string; gstin?: string; address?: string;
      city?: string; state?: string; stateCode?: string; pincode?: string;
      phone?: string; isActive?: boolean;
    };
  }>(
    '/:companyId/plants/:plantId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.plant.edit', { noScope: true })] },
    async (req, reply) => {
      const parsed = plantUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { plantId } = req.params;
      const [updated] = await db
        .update(plants)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(byTenantId(plants, plantId, tenant(req).companyId))
        .returning();
      if (!updated) notFound('Plant not found');
      return { plant: updated };
    }
  );

  // ── Warehouses ─────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string }; Querystring: { plantId?: string } }>(
    '/:companyId/warehouses',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.plants.view', { noScope: true })] },
    async (req) => {
      const { companyId } = tenant(req);
      const { plantId } = req.query;
      const where = plantId
        ? and(eq(warehouses.companyId, companyId), eq(warehouses.plantId, plantId))
        : eq(warehouses.companyId, companyId);
      const list = await db
        .select()
        .from(warehouses)
        .where(where)
        .orderBy(asc(warehouses.code));
      return { warehouses: list };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: {
      plantId: string; code: string; name: string;
      warehouseType?: string; isDefault?: boolean;
    };
  }>(
    '/:companyId/warehouses',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.warehouse.create', { noScope: true })] },
    async (req, reply) => {
      const parsed = warehouseCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const { plantId, code, name, warehouseType, isDefault } = parsed.data;
      // The warehouse's plant must belong to this tenant.
      await assertOwned(plants, plantId, companyId, 'Plant');
      const [created] = await db
        .insert(warehouses)
        .values({
          companyId,
          plantId,
          code,
          name,
          warehouseType: warehouseType ?? 'raw_material',
          isDefault: isDefault ?? false,
          createdBy: uid(req),
        })
        .returning();
      reply.code(201);
      return { warehouse: created };
    }
  );

  app.patch<{
    Params: { companyId: string; warehouseId: string };
    Body: { code?: string; name?: string; warehouseType?: string; isDefault?: boolean; isActive?: boolean };
  }>(
    '/:companyId/warehouses/:warehouseId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.warehouse.edit', { noScope: true })] },
    async (req, reply) => {
      const parsed = warehouseUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { warehouseId } = req.params;
      const [updated] = await db
        .update(warehouses)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(byTenantId(warehouses, warehouseId, tenant(req).companyId))
        .returning();
      if (!updated) notFound('Warehouse not found');
      return { warehouse: updated };
    }
  );

  // ── Number series ────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/number-series',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.view')] },
    async (req) => {
      const list = await db
        .select()
        .from(documentNumberSeries)
        .where(eq(documentNumberSeries.companyId, tenant(req).companyId))
        .orderBy(asc(documentNumberSeries.documentType));

      // Attach plant codes for preview rendering
      const plantList = await db
        .select({ id: plants.id, code: plants.code })
        .from(plants)
        .where(eq(plants.companyId, tenant(req).companyId));
      const plantCode = new Map(plantList.map((p) => [p.id, p.code]));

      const series = list.map((s) => ({
        ...s,
        plantCode: s.plantId ? plantCode.get(s.plantId) ?? null : null,
        preview: previewNumber(s, s.plantId ? plantCode.get(s.plantId) : undefined),
      }));
      return { series, currentFiscalYear: currentFiscalYear() };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: {
      documentType: string; prefix: string; plantId?: string;
      fiscalYear?: string; includeFiscalYear?: boolean; includePlantCode?: boolean;
      padding?: number; currentNumber?: number; resetOnNewYear?: boolean;
    };
  }>(
    '/:companyId/number-series',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit', { noScope: true })] },
    async (req, reply) => {
      const parsed = numberSeriesCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const b = parsed.data;
      await assertOwned(plants, b.plantId, companyId, 'Plant');
      const [created] = await db
        .insert(documentNumberSeries)
        .values({
          companyId,
          documentType: b.documentType,
          prefix: b.prefix,
          plantId: b.plantId ?? null,
          fiscalYear: b.fiscalYear ?? currentFiscalYear(),
          includeFiscalYear: b.includeFiscalYear ?? true,
          includePlantCode: b.includePlantCode ?? false,
          padding: b.padding ?? 4,
          currentNumber: b.currentNumber ?? 0,
          resetOnNewYear: b.resetOnNewYear ?? true,
        })
        .returning();
      reply.code(201);
      return { series: created };
    }
  );

  app.patch<{
    Params: { companyId: string; seriesId: string };
    Body: {
      prefix?: string; includeFiscalYear?: boolean; includePlantCode?: boolean;
      padding?: number; currentNumber?: number; resetOnNewYear?: boolean; isActive?: boolean;
    };
  }>(
    '/:companyId/number-series/:seriesId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')] },
    async (req, reply) => {
      const parsed = numberSeriesUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { seriesId } = req.params;
      const [updated] = await db
        .update(documentNumberSeries)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(byTenantId(documentNumberSeries, seriesId, tenant(req).companyId))
        .returning();
      if (!updated) notFound('Number series not found');
      return { series: updated };
    }
  );

  // ── Tax codes ──────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/tax-codes',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.view')] },
    async (req) => {
      const list = await db
        .select()
        .from(taxCodes)
        .where(eq(taxCodes.companyId, tenant(req).companyId))
        .orderBy(asc(taxCodes.gstRateBp), asc(taxCodes.code));
      return { taxCodes: list };
    }
  );

  app.post<{
    Params: { companyId: string };
    Body: {
      code: string; name: string; rateType: string; gstRateBp: number; cessRateBp?: number;
    };
  }>(
    '/:companyId/tax-codes',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')] },
    async (req, reply) => {
      const parsed = taxCodeCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const { code, name, rateType, gstRateBp, cessRateBp } = parsed.data;
      const half = Math.round(gstRateBp / 2);
      const [created] = await db
        .insert(taxCodes)
        .values({
          companyId,
          code: code.toUpperCase(),
          name,
          rateType: rateType as any,
          gstRateBp,
          cgstRateBp: half,
          sgstRateBp: gstRateBp - half,   // keep cgst+sgst == gst exactly
          igstRateBp: gstRateBp,
          cessRateBp: cessRateBp ?? 0,
          createdBy: uid(req),
        })
        .returning();
      reply.code(201);
      return { taxCode: created };
    }
  );

  app.patch<{
    Params: { companyId: string; taxCodeId: string };
    Body: { name?: string; isActive?: boolean };
  }>(
    '/:companyId/tax-codes/:taxCodeId',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')] },
    async (req, reply) => {
      const parsed = taxCodeUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { taxCodeId } = req.params;
      const [updated] = await db
        .update(taxCodes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(byTenantId(taxCodes, taxCodeId, tenant(req).companyId))
        .returning();
      if (!updated) notFound('Tax code not found');
      return { taxCode: updated };
    }
  );

  // ── HSN / SAC search (global master) ─────────────────────────────────────────

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/hsn-codes',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.view')] },
    async (req) => {
      const q = (req.query.q ?? '').trim();
      const base = db.select().from(hsnSacCodes);
      const rows = q
        ? await base
            .where(or(ilike(hsnSacCodes.code, `${q}%`), ilike(hsnSacCodes.description, `%${q}%`)))
            .orderBy(asc(hsnSacCodes.code))
            .limit(50)
        : await base.orderBy(asc(hsnSacCodes.code)).limit(50);
      return { hsnCodes: rows };
    }
  );

  // ── Custom fields (L2) per document type ─────────────────────────────────────

  app.get<{ Params: { companyId: string }; Querystring: { documentType?: string } }>(
    '/:companyId/custom-fields',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const { documentType } = req.query;

      if (documentType) {
        const [row] = await db
          .select()
          .from(documentTypeConfig)
          .where(and(
            eq(documentTypeConfig.companyId, companyId),
            eq(documentTypeConfig.documentType, documentType),
          ))
          .limit(1);
        return { documentType, fields: row?.l2Fields?.fields ?? [] };
      }

      // No documentType → return counts per configured document type
      const rows = await db
        .select()
        .from(documentTypeConfig)
        .where(eq(documentTypeConfig.companyId, companyId));
      const configured = rows.map((r) => ({
        documentType: r.documentType,
        fieldCount: r.l2Fields?.fields?.length ?? 0,
      }));
      return { configured };
    }
  );

  app.put<{
    Params: { companyId: string };
    Body: unknown;
  }>(
    '/:companyId/custom-fields',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')] },
    async (req, reply) => {
      const parsed = customFieldsPutSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { companyId } = tenant(req);
      const { documentType, fields } = parsed.data;
      const l2Fields: L2Fields = { fields: fields as L2Fields['fields'] };

      const [existing] = await db
        .select({ id: documentTypeConfig.id })
        .from(documentTypeConfig)
        .where(and(
          eq(documentTypeConfig.companyId, companyId),
          eq(documentTypeConfig.documentType, documentType),
        ))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(documentTypeConfig)
          .set({ l2Fields, updatedAt: new Date(), updatedBy: uid(req) })
          .where(eq(documentTypeConfig.id, existing.id))
          .returning();
        return { config: updated };
      }

      const [created] = await db
        .insert(documentTypeConfig)
        .values({
          companyId,
          documentType,
          l2Fields,
          updatedBy: uid(req),
        })
        .returning();
      return { config: created };
    }
  );

  // ── Approval Workflows ────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string; documentType: string } }>(
    '/:companyId/workflows/:documentType',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.approvalworkflow.view')] },
    async (req) => {
      const { documentType } = req.params;
      const { companyId } = tenant(req);

      const [workflow] = await db
        .select()
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.companyId, companyId),
            eq(approvalWorkflows.documentType, documentType)
          )
        );

      if (!workflow) {
        return { levels: [] };
      }

      const levels = await db
        .select({
          id: approvalWorkflowLevels.id,
          level: approvalWorkflowLevels.level,
          thresholdMinPaise: approvalWorkflowLevels.thresholdMinPaise,
          thresholdMaxPaise: approvalWorkflowLevels.thresholdMaxPaise,
          approverType: approvalWorkflowLevels.approverType,
          approverUserId: approvalWorkflowLevels.approverUserId,
          approverRoleId: approvalWorkflowLevels.approverRoleId,
          requiredApprovals: approvalWorkflowLevels.requiredApprovals,
          isFinal: approvalWorkflowLevels.isFinal,
        })
        .from(approvalWorkflowLevels)
        .where(eq(approvalWorkflowLevels.workflowId, workflow.id))
        .orderBy(asc(approvalWorkflowLevels.level));

      return { levels };
    }
  );

  app.post<{
    Params: { companyId: string; documentType: string };
    Body: {
      levels: {
        id?: string;
        level: number;
        thresholdMinPaise: number;
        thresholdMaxPaise: number | null;
        approverType: 'user' | 'role';
        approverUserId?: string | null;
        approverRoleId?: string | null;
        requiredApprovals: number;
      }[];
    };
  }>(
    '/:companyId/workflows/:documentType',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('settings.approvalworkflow.manage')] },
    async (req, reply) => {
      const parsed = workflowPutSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { documentType } = req.params;
      const { companyId } = tenant(req);
      const { levels } = parsed.data;

      // Every approver reference must resolve within this tenant.
      for (const l of levels) {
        await assertOwnedOrGlobal(roles, l.approverRoleId, companyId, 'Approver role');
        if (l.approverUserId) {
          const [member] = await db.select({ id: userRoles.id }).from(userRoles)
            .where(and(eq(userRoles.userId, l.approverUserId), eq(userRoles.companyId, companyId))).limit(1);
          if (!member) {
            return reply.code(400).send({ error: 'Invalid input', detail: 'Approver user is not a member of this company' });
          }
        }
      }

      await db.transaction(async (tx) => {
        // Upsert workflow. NOTE: the column is `isActive` (schema), not `isEnabled`
        // — the old code wrote a non-existent `isEnabled` key so the active flag was
        // never actually set (audit finding #5).
        const [workflow] = await tx
          .insert(approvalWorkflows)
          .values({
            companyId,
            documentType,
            name: `${documentType} Workflow`,
            isActive: true,
            createdBy: uid(req),
          })
          .onConflictDoUpdate({
            target: [approvalWorkflows.companyId, approvalWorkflows.documentType],
            set: { isActive: true, updatedAt: new Date(), name: `${documentType} Workflow` },
          })
          .returning();

        // Delete existing levels
        await tx.delete(approvalWorkflowLevels).where(eq(approvalWorkflowLevels.workflowId, workflow.id));

        // Insert new levels
        if (levels && levels.length > 0) {
          const newLevels = levels.map((l) => ({
            workflowId: workflow.id,
            level: l.level,
            thresholdMinPaise: l.thresholdMinPaise,
            thresholdMaxPaise: l.thresholdMaxPaise,
            approverType: l.approverType,
            approverUserId: l.approverUserId || null,
            approverRoleId: l.approverRoleId || null,
            requiredApprovals: l.requiredApprovals || 1,
            isFinal: false,
          }));

          // Mark the last level as final
          newLevels[newLevels.length - 1].isFinal = true;

          await tx.insert(approvalWorkflowLevels).values(newLevels);
        }
      });

      reply.code(200);
      return { message: 'Workflow updated successfully' };
    }
  );
}
