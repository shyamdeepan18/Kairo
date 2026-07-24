/**
 * Settings API — company-scoped admin routes
 *
 * Registered at: /api/settings/:companyId
 *
 * All routes require authentication. The companyId URL param scopes every query.
 * Future: add authorization checks (settings.company.edit permission).
 */

import type { FastifyInstance } from 'fastify';
import { db } from '@erp/db';
import {
  companies, plants, warehouses, users, userRoles, roles, rolePermissions,
  permissions, chartOfAccounts, taxCodes, hsnSacCodes,
  documentNumberSeries, documentTypeConfig,
} from '@erp/db';
import type { L2FieldDef, L2Fields } from '@erp/db';
import { eq, and, inArray, isNull, desc, ilike, or, asc } from 'drizzle-orm';
import argon2 from 'argon2';

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

export default async function settingsRoutes(app: FastifyInstance) {
  // ── Company ────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId',
    { preHandler: [app.authenticate] },
    async (req) => {
      const [co] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, req.params.companyId));
      if (!co) throw app.httpErrors.notFound('Company not found');
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
      const [updated] = await db
        .update(companies)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(companies.id, companyId))
        .returning();
      if (!updated) throw app.httpErrors.notFound('Company not found');
      return { company: updated };
    }
  );

  // ── Users ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/users',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;

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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const { email, fullName, roleId, plantId } = req.body;

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
          grantedBy: (req.user as { sub: string }).sub,
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { userId } = req.params;
      const [updated] = await db
        .update(users)
        .set({ isActive: req.body.isActive, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id, isActive: users.isActive });
      return { user: updated };
    }
  );

  // ── Roles ──────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/roles',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const [created] = await db
        .insert(roles)
        .values({ companyId, name: req.body.name, description: req.body.description })
        .returning();
      reply.code(201);
      return { role: created };
    }
  );

  // Get permissions granted to a role (returns permission codes)
  app.get<{ Params: { companyId: string; roleId: string } }>(
    '/:companyId/roles/:roleId/permissions',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { roleId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { roleId } = req.params;
      const { grantedCodes } = req.body;

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
    { preHandler: [app.authenticate] },
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
        .where(eq(chartOfAccounts.companyId, req.params.companyId))
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const [created] = await db
        .insert(chartOfAccounts)
        .values({
          companyId,
          ...req.body,
          isGroup: req.body.isGroup ?? false,
          createdBy: (req.user as { sub: string }).sub,
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { accountId } = req.params;
      const [updated] = await db
        .update(chartOfAccounts)
        .set({ ...req.body, updatedAt: new Date(), updatedBy: (req.user as { sub: string }).sub })
        .where(eq(chartOfAccounts.id, accountId))
        .returning();
      return { account: updated };
    }
  );

  // ── Plants ───────────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/plants',
    { preHandler: [app.authenticate] },
    async (req) => {
      const list = await db
        .select()
        .from(plants)
        .where(eq(plants.companyId, req.params.companyId))
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const [created] = await db
        .insert(plants)
        .values({ companyId, ...req.body, createdBy: (req.user as { sub: string }).sub })
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { plantId } = req.params;
      const [updated] = await db
        .update(plants)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(plants.id, plantId))
        .returning();
      if (!updated) throw app.httpErrors.notFound('Plant not found');
      return { plant: updated };
    }
  );

  // ── Warehouses ─────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string }; Querystring: { plantId?: string } }>(
    '/:companyId/warehouses',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const { plantId, code, name, warehouseType, isDefault } = req.body;
      const [created] = await db
        .insert(warehouses)
        .values({
          companyId,
          plantId,
          code,
          name,
          warehouseType: (warehouseType as any) ?? 'raw_material',
          isDefault: isDefault ?? false,
          createdBy: (req.user as { sub: string }).sub,
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { warehouseId } = req.params;
      const [updated] = await db
        .update(warehouses)
        .set({ ...(req.body as any), updatedAt: new Date() })
        .where(eq(warehouses.id, warehouseId))
        .returning();
      if (!updated) throw app.httpErrors.notFound('Warehouse not found');
      return { warehouse: updated };
    }
  );

  // ── Number series ────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/number-series',
    { preHandler: [app.authenticate] },
    async (req) => {
      const list = await db
        .select()
        .from(documentNumberSeries)
        .where(eq(documentNumberSeries.companyId, req.params.companyId))
        .orderBy(asc(documentNumberSeries.documentType));

      // Attach plant codes for preview rendering
      const plantList = await db
        .select({ id: plants.id, code: plants.code })
        .from(plants)
        .where(eq(plants.companyId, req.params.companyId));
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const b = req.body;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { seriesId } = req.params;
      const [updated] = await db
        .update(documentNumberSeries)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(documentNumberSeries.id, seriesId))
        .returning();
      if (!updated) throw app.httpErrors.notFound('Number series not found');
      return { series: updated };
    }
  );

  // ── Tax codes ──────────────────────────────────────────────────────────────

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/tax-codes',
    { preHandler: [app.authenticate] },
    async (req) => {
      const list = await db
        .select()
        .from(taxCodes)
        .where(eq(taxCodes.companyId, req.params.companyId))
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
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const { code, name, rateType, gstRateBp, cessRateBp } = req.body;
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
          createdBy: (req.user as { sub: string }).sub,
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { taxCodeId } = req.params;
      const [updated] = await db
        .update(taxCodes)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(taxCodes.id, taxCodeId))
        .returning();
      if (!updated) throw app.httpErrors.notFound('Tax code not found');
      return { taxCode: updated };
    }
  );

  // ── HSN / SAC search (global master) ─────────────────────────────────────────

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/hsn-codes',
    { preHandler: [app.authenticate] },
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    Body: { documentType: string; fields: L2FieldDef[] };
  }>(
    '/:companyId/custom-fields',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
      const { documentType, fields } = req.body;
      const l2Fields: L2Fields = { fields };

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
          .set({ l2Fields, updatedAt: new Date(), updatedBy: (req.user as { sub: string }).sub })
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
          updatedBy: (req.user as { sub: string }).sub,
        })
        .returning();
      return { config: created };
    }
  );
}
