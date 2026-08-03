/**
 * System Admin API — Super-admin only routes
 *
 * Registered at: /api/admin
 *
 * ALL routes require isSystemAdmin = true in the JWT.
 * These routes allow Shyam18 (the platform owner) to:
 *   - Create / list / deactivate tenant companies
 *   - Create plants within a company
 *   - Create users and assign roles across any company
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { db } from '@erp/db';
import {
  companies, plants, users, roles, userRoles, companyLicense, userRoles as userRolesTable, companyUsers,
  permissions, rolePermissions, companyModules, documentNumberSeries
} from '@erp/db';
import { eq, and, inArray, desc, sql, getTableColumns, isNull } from 'drizzle-orm';
import argon2 from 'argon2';
import { LicenseService } from '../services/license-service.js';
import type { PermissionService } from '../services/permissions.js';

// ─── guard: system admin only ─────────────────────────────────────────────────

async function requireSystemAdmin(req: FastifyRequest, reply: any) {
  const user = req.user as { isSystemAdmin?: boolean };
  if (!user?.isSystemAdmin) {
    return reply.code(403).send({ error: 'System admin access required' });
  }
}

function randomPassword(len = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default async function adminRoutes(app: FastifyInstance) {

  // ── GET /api/admin/companies ──────────────────────────────────────────────
  app.get('/companies', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async () => {
    const list = await db.select({
      id: companies.id,
      name: companies.name,
      legalName: companies.legalName,
      gstin: companies.gstin,
      baseCurrency: companies.baseCurrency,
      isActive: companies.isActive,
      createdAt: companies.createdAt,
    }).from(companies).orderBy(desc(companies.createdAt));
    return { companies: list, total: list.length };
  });

  // ── POST /api/admin/companies ─────────────────────────────────────────────
  app.post<{
    Body: {
      name: string; legalName?: string; gstin?: string; pan?: string;
      address?: string; city?: string; state?: string; stateCode?: string;
      pincode?: string; phone?: string; email?: string; baseCurrency?: string;
    };
  }>('/companies', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { name, baseCurrency = 'INR', ...rest } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'Company name is required' });

    const company = await db.transaction(async (tx) => {
      const [newCompany] = await tx.insert(companies).values({
        name: name.trim(),
        baseCurrency,
        ...rest,
      }).returning();

      // Auto-provision a default trial license
      const validTo = new Date();
      validTo.setMonth(validTo.getMonth() + 1); // 1 month trial

      const [license] = await tx.insert(companyLicense).values({
        companyId: newCompany.id,
        edition: 'trial',
        maxUsers: 5,
        validFrom: new Date().toISOString().split('T')[0],
        validTo: validTo.toISOString().split('T')[0],
      }).returning();

      // Auto-enable core modules
      const coreModules = [
        'auth', 'settings', 'purchase', 'sales', 'inventory', 
        'accounting', 'manufacturing', 'hr', 'payroll'
      ];
      
      await tx.insert(companyModules).values(
        coreModules.map((module) => ({
          companyId: newCompany.id,
          module,
          isEnabled: true,
        }))
      );

      // Auto-provision standard number series
      const standardSeries = [
        { documentType: 'purchase.requisition', prefix: 'PR-' },
        { documentType: 'purchase.po', prefix: 'PO-' },
        { documentType: 'purchase.grn', prefix: 'GRN-' },
        { documentType: 'purchase.invoice', prefix: 'PI-' },
        { documentType: 'purchase.payment', prefix: 'PAY-' },
        { documentType: 'sales.quotation', prefix: 'SQ-' },
        { documentType: 'sales.so', prefix: 'SO-' },
        { documentType: 'sales.delivery', prefix: 'DN-' },
        { documentType: 'sales.invoice', prefix: 'SI-' },
        { documentType: 'sales.receipt', prefix: 'RC-' },
        { documentType: 'manufacturing.bom', prefix: 'BOM-' },
        { documentType: 'manufacturing.order', prefix: 'MO-' },
      ];

      await tx.insert(documentNumberSeries).values(
        standardSeries.map(s => ({
          companyId: newCompany.id,
          documentType: s.documentType,
          prefix: s.prefix,
          currentNumber: 1,
          padding: 4,
          isActive: true
        }))
      );

      return newCompany;
    });

    return reply.code(201).send({ company });
  });

  // ── PATCH /api/admin/companies/:id ────────────────────────────────────────
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/companies/:id', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const [updated] = await db.update(companies)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companies.id, req.params.id))
      .returning();
    if (!updated) return reply.code(404).send({ error: 'Company not found' });
    return { company: updated };
  });

  // ── PATCH /api/admin/companies/:id/toggle ─────────────────────────────────
  app.patch<{ Params: { id: string }; Body: { isActive: boolean } }>('/companies/:id/toggle', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const [updated] = await db.update(companies)
      .set({ isActive: req.body.isActive, updatedAt: new Date() })
      .where(eq(companies.id, req.params.id))
      .returning();
    if (!updated) return reply.code(404).send({ error: 'Company not found' });
    return { company: updated };
  });

  // ── GET /api/admin/companies/:id/plants ──────────────────────────────────
  app.get<{ Params: { id: string } }>('/companies/:id/plants', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const list = await db.select({
      ...getTableColumns(plants),
      userCount: sql<number>`cast(count(distinct ${userRoles.userId}) as integer)`,
    }).from(plants)
      .leftJoin(userRoles, eq(userRoles.plantId, plants.id))
      .where(eq(plants.companyId, req.params.id))
      .groupBy(plants.id)
      .orderBy(plants.name);
    return { plants: list, total: list.length };
  });

  // ── POST /api/admin/companies/:id/plants ─────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { name: string; code: string; gstin?: string; address?: string; city?: string; state?: string; stateCode?: string; };
  }>('/companies/:id/plants', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { name, code, ...rest } = req.body;
    if (!name?.trim() || !code?.trim()) return reply.code(400).send({ error: 'Plant name and code are required' });
    const [plant] = await db.insert(plants).values({
      companyId: req.params.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      ...rest,
    }).returning();
    return reply.code(201).send({ plant });
  });

  // ── PATCH /api/admin/companies/:id/plants/:plantId ───────────────────────
  app.patch<{
    Params: { id: string; plantId: string };
    Body: { name?: string; code?: string; gstin?: string; address?: string; city?: string; state?: string; stateCode?: string; isActive?: boolean };
  }>('/companies/:id/plants/:plantId', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { name, code, ...rest } = req.body;
    const updateData: Record<string, any> = { ...rest, updatedAt: new Date() };
    if (name?.trim()) updateData.name = name.trim();
    if (code?.trim()) updateData.code = code.trim().toUpperCase();

    const [updated] = await db.update(plants)
      .set(updateData)
      .where(and(eq(plants.id, req.params.plantId), eq(plants.companyId, req.params.id)))
      .returning();

    if (!updated) return reply.code(404).send({ error: 'Plant not found' });
    return reply.send({ plant: updated });
  });

  // ── GET /api/admin/companies/:id/users ───────────────────────────────────
  app.get<{ Params: { id: string } }>('/companies/:id/users', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const companyId = req.params.id;

    const companyMembers = await db.select({
      userId: companyUsers.userId,
    }).from(companyUsers).where(eq(companyUsers.companyId, companyId));

    if (companyMembers.length === 0) return { users: [], total: 0 };
    const userIds = companyMembers.map(m => m.userId);

    const userList = await db.select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(inArray(users.id, userIds));

    const assignments = await db.select({
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      plantId: userRoles.plantId,
      roleName: roles.name,
      plantName: plants.name,
      plantCode: plants.code,
    })
      .from(userRoles)
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(plants, eq(userRoles.plantId, plants.id))
      .where(and(eq(userRoles.companyId, companyId), inArray(userRoles.userId, userIds)));

    const result = userList.map((u) => ({
      ...u,
      roles: assignments.filter((a) => a.userId === u.id).map((a) => ({
        roleId: a.roleId,
        roleName: a.roleName,
        plantId: a.plantId,
        plantName: a.plantName,
        plantCode: a.plantCode,
      })),
    }));

    return { users: result, total: result.length };
  });

  // ── POST /api/admin/companies/:id/users ──────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { fullName: string; email: string; roleId?: string; plantId?: string; copyFromUserId?: string };
  }>('/companies/:id/users', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { fullName, email, roleId, plantId, copyFromUserId } = req.body;
    const companyId = req.params.id;

    if (!fullName?.trim() || !email?.trim()) {
      return reply.code(400).send({ error: 'fullName and email are required' });
    }

    if (!roleId && !copyFromUserId) {
      return reply.code(400).send({ error: 'Either roleId or copyFromUserId must be provided' });
    }

    const tempPassword = randomPassword();
    const passwordHash = await argon2.hash(tempPassword);

    const result = await db.transaction(async (tx) => {
      const existing = await tx.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
      let u = existing[0];
      if (!u) {
        [u] = await tx.insert(users).values({
          email: email.toLowerCase().trim(),
          fullName: fullName.trim(),
          passwordHash,
        }).returning();
      }

      const cu = await tx.select().from(companyUsers).where(and(eq(companyUsers.userId, u.id), eq(companyUsers.companyId, companyId))).limit(1);
      if (!cu.length) {
        await tx.insert(companyUsers).values({ companyId, userId: u.id });
      }

      if (copyFromUserId) {
        const sourceRoles = await tx.select().from(userRoles).where(
          and(eq(userRoles.userId, copyFromUserId), eq(userRoles.companyId, companyId))
        );
        for (const sr of sourceRoles) {
          const existingRole = await tx.select().from(userRoles).where(
            and(
              eq(userRoles.userId, u.id),
              eq(userRoles.companyId, companyId),
              eq(userRoles.roleId, sr.roleId),
              sr.plantId ? eq(userRoles.plantId, sr.plantId) : isNull(userRoles.plantId)
            )
          ).limit(1);
          if (!existingRole.length) {
            await tx.insert(userRoles).values({
              userId: u.id,
              companyId,
              roleId: sr.roleId,
              plantId: sr.plantId,
            });
          }
        }
      } else if (roleId) {
        const existingRole = await tx.select().from(userRoles).where(
          and(eq(userRoles.userId, u.id), eq(userRoles.companyId, companyId), eq(userRoles.roleId, roleId))
        ).limit(1);

        if (!existingRole.length) {
          await tx.insert(userRoles).values({
            userId: u.id,
            companyId,
            roleId,
            plantId: plantId ?? null,
          });
        }
      }

      return u;
    });

    return reply.code(201).send({
      user: { id: result.id, email: result.email, fullName: result.fullName },
      tempPassword,
      message: 'User created. Share the temporary password — it must be changed on first login.',
    });
  });

  // ── GET /api/admin/permissions ───────────────────────────────────────────
  app.get('/permissions', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async () => {
    const list = await db.select().from(permissions).orderBy(permissions.module, permissions.code);
    return { permissions: list, total: list.length };
  });

  // ── GET /api/admin/companies/:id/roles ───────────────────────────────────
  app.get<{ Params: { id: string } }>('/companies/:id/roles', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const list = await db.select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isSystemRole: roles.isSystemRole,
      isActive: roles.isActive,
    }).from(roles).where(
      sql`${roles.companyId} IS NULL OR ${roles.companyId} = ${req.params.id}`,
    ).orderBy(roles.isSystemRole, roles.name);
    return { roles: list, total: list.length };
  });

  // ── POST /api/admin/companies/:id/roles ──────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { name: string; description?: string; copyFromRoleIds?: string[] };
  }>('/companies/:id/roles', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { name, description, copyFromRoleIds } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'Role name is required' });

    const role = await db.transaction(async (tx) => {
      const [newRole] = await tx.insert(roles).values({
        companyId: req.params.id,
        name: name.trim(),
        description: description?.trim() || null,
        isSystemRole: false,
        isActive: true,
      }).returning();

      if (copyFromRoleIds && copyFromRoleIds.length > 0) {
        // Fetch all permissions belonging to the selected source roles
        const sourcePerms = await tx.select({ permissionId: rolePermissions.permissionId })
          .from(rolePermissions)
          .where(inArray(rolePermissions.roleId, copyFromRoleIds));

        // Deduplicate permission IDs
        const uniquePermIds = Array.from(new Set(sourcePerms.map((p) => p.permissionId)));

        if (uniquePermIds.length > 0) {
          await tx.insert(rolePermissions).values(
            uniquePermIds.map((pid) => ({
              roleId: newRole.id,
              permissionId: pid,
            }))
          );
        }
      }

      return newRole;
    });

    return reply.code(201).send({ role });
  });

  // ── PUT /api/admin/companies/:id/roles/:roleId ───────────────────────────
  app.put<{
    Params: { id: string; roleId: string };
    Body: { name: string; description?: string };
  }>('/companies/:id/roles/:roleId', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const [existing] = await db.select().from(roles).where(eq(roles.id, req.params.roleId));
    if (!existing) return reply.code(404).send({ error: 'Role not found' });
    if (existing.isSystemRole) return reply.code(400).send({ error: 'System roles cannot be edited' });

    const [updated] = await db.update(roles).set({
      name: req.body.name?.trim() || existing.name,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      updatedAt: new Date(),
    }).where(eq(roles.id, req.params.roleId)).returning();

    return reply.send({ role: updated });
  });

  // ── DELETE /api/admin/companies/:id/roles/:roleId ────────────────────────
  app.delete<{ Params: { id: string; roleId: string } }>('/companies/:id/roles/:roleId', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const [existing] = await db.select().from(roles).where(eq(roles.id, req.params.roleId));
    if (!existing) return reply.code(404).send({ error: 'Role not found' });
    if (existing.isSystemRole) return reply.code(400).send({ error: 'System roles cannot be deleted' });

    await db.delete(roles).where(eq(roles.id, req.params.roleId));
    return reply.send({ ok: true });
  });

  // ── GET /api/admin/companies/:id/roles/:roleId/permissions ──────────────
  app.get<{ Params: { id: string; roleId: string } }>('/companies/:id/roles/:roleId/permissions', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const list = await db.select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, req.params.roleId));
    return { permissionCodes: list.map((p) => p.code) };
  });

  // ── PUT /api/admin/companies/:id/roles/:roleId/permissions ──────────────
  app.put<{
    Params: { id: string; roleId: string };
    Body: { permissionCodes: string[] };
  }>('/companies/:id/roles/:roleId/permissions', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const [existingRole] = await db.select().from(roles).where(eq(roles.id, req.params.roleId));
    if (!existingRole) return reply.code(404).send({ error: 'Role not found' });
    if (existingRole.isSystemRole) return reply.code(400).send({ error: 'System roles cannot be edited' });

    const grantedCodes = req.body.permissionCodes || [];

    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, req.params.roleId));

      if (grantedCodes.length > 0) {
        const targetPerms = await tx
          .select({ id: permissions.id, code: permissions.code })
          .from(permissions)
          .where(inArray(permissions.code, grantedCodes));

        if (targetPerms.length > 0) {
          await tx.insert(rolePermissions).values(
            targetPerms.map((p) => ({
              roleId: req.params.roleId,
              permissionId: p.id,
            })),
          );
        }
      }
    });

    const permSvc = (app as any).permissionService as PermissionService;
    if (permSvc) {
      const affectedUsers = await db
        .selectDistinct({ userId: userRoles.userId })
        .from(userRoles)
        .where(and(eq(userRoles.companyId, req.params.id), eq(userRoles.roleId, req.params.roleId)));
      
      for (const u of affectedUsers) {
        await permSvc.invalidateUser(u.userId, req.params.id);
      }
    }

    return reply.send({ ok: true, grantedCount: grantedCodes.length });
  });

  // ── POST /api/admin/companies/:id/users/:userId/roles ────────────────────
  app.post<{
    Params: { id: string; userId: string };
    Body: { roleId: string; plantId?: string };
  }>('/companies/:id/users/:userId/roles', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { roleId, plantId } = req.body;
    const { id: companyId, userId } = req.params;
    await db.insert(userRoles).values({
      userId,
      companyId,
      roleId,
      plantId: plantId ?? null,
    }).onConflictDoNothing();

    const permSvc = (app as any).permissionService as PermissionService;
    if (permSvc) await permSvc.invalidateUser(userId, companyId);

    return reply.code(201).send({ ok: true });
  });

  // ── PUT /api/admin/companies/:id/users/:userId/roles/:roleId ─────────────
  app.put<{
    Params: { id: string; userId: string; roleId: string };
    Body: { plantId?: string | null };
  }>(
    '/companies/:id/users/:userId/roles/:roleId',
    {
      preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
    },
    async (req, reply) => {
      const { plantId } = req.body;
      const { id: companyId, userId, roleId } = req.params;
      await db.update(userRoles).set({
        plantId: plantId ?? null,
      }).where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.companyId, companyId),
          eq(userRoles.roleId, roleId),
        ),
      );

      const permSvc = (app as any).permissionService as PermissionService;
      if (permSvc) await permSvc.invalidateUser(userId, companyId);

      return reply.send({ ok: true });
    },
  );

  // ── DELETE /api/admin/companies/:id/users/:userId/roles/:roleId ──────────
  app.delete<{ Params: { id: string; userId: string; roleId: string } }>(
    '/companies/:id/users/:userId/roles/:roleId',
    {
      preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
    },
    async (req, reply) => {
      await db.delete(userRoles).where(
        and(
          eq(userRoles.userId, req.params.userId),
          eq(userRoles.companyId, req.params.id),
          eq(userRoles.roleId, req.params.roleId),
        ),
      );

      const permSvc = (app as any).permissionService as PermissionService;
      if (permSvc) await permSvc.invalidateUser(req.params.userId, req.params.id);

      return reply.send({ ok: true });
    },
  );

  // ── PATCH /api/admin/users/:userId/toggle ────────────────────────────────
  app.patch<{ Params: { userId: string }; Body: { isActive: boolean } }>(
    '/users/:userId/toggle',
    {
      preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
    },
    async (req, reply) => {
      const [updated] = await db.update(users)
        .set({ isActive: req.body.isActive, updatedAt: new Date() })
        .where(eq(users.id, req.params.userId))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'User not found' });
      return { user: { id: updated.id, email: updated.email, isActive: updated.isActive } };
    },
  );

  // ── DELETE /api/admin/users/:userId ───────────────────────────────────────
  app.delete<{ Params: { userId: string } }>(
    '/users/:userId',
    {
      preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
    },
    async (req, reply) => {
      const [u] = await db.select().from(users).where(eq(users.id, req.params.userId));
      if (!u) return reply.code(404).send({ error: 'User not found' });
      if (u.isSystemAdmin) return reply.code(400).send({ error: 'Cannot delete a System Admin' });
      if (u.isActive) return reply.code(400).send({ error: 'Cannot delete an active user. Please deactivate them first.' });

      await db.delete(users).where(eq(users.id, req.params.userId));
      return reply.send({ ok: true, message: 'User deleted' });
    }
  );

  // ── POST /api/admin/users/:userId/reset-password ────────────────────────
  app.post<{ Params: { userId: string } }>(
    '/users/:userId/reset-password',
    {
      preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
    },
    async (req, reply) => {
      const [u] = await db.select().from(users).where(eq(users.id, req.params.userId));
      if (!u) return reply.code(404).send({ error: 'User not found' });

      const tempPassword = randomPassword(10);
      const passwordHash = await argon2.hash(tempPassword);

      await db.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, req.params.userId));

      return reply.send({
        tempPassword,
        message: `Password reset successfully for ${u.email}. Share this temporary password with the user.`,
      });
    },
  );

  // ── GET /api/admin/companies/:id/license ─────────────────────────────────
  // Get the current license for a company (null if none installed)
  app.get<{ Params: { id: string } }>('/companies/:id/license', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const [license] = await db.select().from(companyLicense)
      .where(eq(companyLicense.companyId, req.params.id)).limit(1);

    // Count active users with role assignments in this company
    const activeUserRows = await db
      .selectDistinct({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.companyId, req.params.id));

    const activeUserCount = activeUserRows.length;

    return {
      license: license ?? null,
      activeUserCount,
      isOverLimit: license && license.maxUsers !== -1
        ? activeUserCount > license.maxUsers
        : false,
    };
  });

  // ── PUT /api/admin/companies/:id/license ──────────────────────────────────
  // Install or update a license for a company
  app.put<{
    Params: { id: string };
    Body: {
      edition: string;
      maxUsers: number;
      validFrom: string;
      validTo?: string;
    };
  }>('/companies/:id/license', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { edition, maxUsers, validFrom, validTo } = req.body;
    const companyId = req.params.id;

    if (typeof maxUsers !== 'number' || maxUsers < -1) {
      return reply.code(400).send({ error: 'maxUsers must be a number >= -1 (-1 = unlimited)' });
    }
    if (!validFrom) {
      return reply.code(400).send({ error: 'validFrom is required' });
    }

    const [license] = await db.insert(companyLicense).values({
      companyId,
      edition: edition ?? 'standard',
      maxUsers,
      validFrom: validFrom ?? null,
      validTo: validTo ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: companyLicense.companyId,
      set: {
        edition: edition ?? 'standard',
        maxUsers,
        validFrom: validFrom ?? null,
        validTo: validTo ?? null,
        updatedAt: new Date(),
      },
    }).returning();

    return reply.code(200).send({ license });
  });

  // ── DELETE /api/admin/companies/:id/license ───────────────────────────────
  // Revoke a company's license (blocks all access via license check)
  app.delete<{ Params: { id: string } }>('/companies/:id/license', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    await db.delete(companyLicense).where(eq(companyLicense.companyId, req.params.id));
    return reply.send({ ok: true, message: 'License revoked. Company access is now blocked.' });
  });

  // ── GET /api/admin/diagnostics/health ───────────────────────────────────────
  app.get('/diagnostics/health', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    try {
      // Query pg_stat_statements for top 10 slowest queries
      const slowQueriesResult = await db.execute(sql`
        SELECT query, calls, total_exec_time, mean_exec_time, rows 
        FROM pg_stat_statements 
        ORDER BY total_exec_time DESC 
        LIMIT 10
      `).catch(() => []);
      const slowQueries = Array.isArray(slowQueriesResult) ? slowQueriesResult : (slowQueriesResult as any)?.rows ?? [];

      // Query active connections
      const activeConnectionsResult = await db.execute(sql`
        SELECT count(*) as count 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `).catch(() => [{ count: 0 }]);
      const activeConnections = Array.isArray(activeConnectionsResult) ? activeConnectionsResult : (activeConnectionsResult as any)?.rows ?? [];
      const activeCount = Number(activeConnections[0]?.count ?? 0);

      return {
        ok: true,
        slowQueries,
        activeConnections: activeCount,
      };
    } catch (error: any) {
      if (error?.message?.includes('pg_stat_statements')) {
        return reply.code(500).send({ 
          ok: false, 
          error: 'pg_stat_statements extension is not installed or preloaded. Please restart the database container.' 
        });
      }
      throw error;
    }
  });

  // ── GET /api/admin/diagnostics/audit-logs ───────────────────────────────────
  app.get<{ Querystring: { limit?: number; offset?: number } }>('/diagnostics/audit-logs', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req) => {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const listResult = await db.execute(sql`
      SELECT 
        a.id, a.action, a.entity, a.entity_id as "entityId", 
        a.details, a.ip_address as "ipAddress", a.created_at as "createdAt",
        c.name as "companyName", u.email as "userEmail"
      FROM audit_logs a
      LEFT JOIN companies c ON a.company_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const logs = Array.isArray(listResult) ? listResult : (listResult as any)?.rows ?? [];

    // Get total count
    const countResult: any = await db.execute(sql`SELECT count(*) as count FROM audit_logs`);
    const countRows = Array.isArray(countResult) ? countResult : countResult?.rows ?? [];
    const total = Number(countRows[0]?.count ?? 0);

    return { 
      logs, 
      total 
    };
  });
}
