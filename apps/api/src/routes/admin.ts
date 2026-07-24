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
  companies, plants, users, roles, userRoles, companyLicense, userRoles as userRolesTable,
  permissions, rolePermissions,
} from '@erp/db';
import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import argon2 from 'argon2';

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
    const [company] = await db.insert(companies).values({
      name: name.trim(),
      baseCurrency,
      ...rest,
    }).returning();
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
      ...plants,
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
      .where(eq(userRoles.companyId, companyId));

    if (assignments.length === 0) return { users: [], total: 0 };

    const userIds = [...new Set(assignments.map((a) => a.userId))];
    const userList = await db.select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(inArray(users.id, userIds));

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
    Body: { fullName: string; email: string; roleId: string; plantId?: string; };
  }>('/companies/:id/users', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { fullName, email, roleId, plantId } = req.body;
    const companyId = req.params.id;

    if (!fullName?.trim() || !email?.trim() || !roleId) {
      return reply.code(400).send({ error: 'fullName, email, and roleId are required' });
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

      const existingRole = await tx.select().from(userRoles).where(
        and(
          eq(userRoles.userId, u.id),
          eq(userRoles.companyId, companyId),
          eq(userRoles.roleId, roleId),
        ),
      ).limit(1);

      if (!existingRole.length) {
        await tx.insert(userRoles).values({
          userId: u.id,
          companyId,
          roleId,
          plantId: plantId ?? null,
        });
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
    Body: { name: string; description?: string };
  }>('/companies/:id/roles', {
    preHandler: [app.authenticate, (req, reply) => requireSystemAdmin(req, reply)],
  }, async (req, reply) => {
    const { name, description } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'Role name is required' });
    const [role] = await db.insert(roles).values({
      companyId: req.params.id,
      name: name.trim(),
      description: description?.trim() || null,
      isSystemRole: false,
      isActive: true,
    }).returning();
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
      validFrom?: string;
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
}
