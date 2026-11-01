import type { FastifyInstance } from 'fastify';
import { eq, and, gt, or, sql, inArray } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import {
  db, users, sessions, companyLicense, userRoles,
  companies, plants, companyUsers,
} from '@erp/db';
import { loginSchema } from '@erp/shared';
import { config } from '../config.js';
import type { PermissionService } from '../services/permissions.js';

/**
 * Auth routes — all stateless JWT-based with httpOnly refresh token cookie.
 *
 * Flow:
 *  login  → returns access token (15m) + sets refresh cookie (7d)
 *  refresh → validates refresh cookie, rotates it, returns new access token
 *  logout → deletes session from DB, clears cookie
 *  me     → returns current user from access token (no DB hit)
 */
export default async function authRoutes(app: FastifyInstance) {

  // ── POST /api/auth/login ───────────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid input', issues: body.error.issues });
    }

    const { email, password } = body.data;
    const identifier = email.trim().toLowerCase();

    // Check if the identifier is a UUID (User ID)
    const identifierIsUuid = isUuid(identifier);

    const [user] = await db
      .select()
      .from(users)
      .where(
        identifierIsUuid
          ? eq(users.id, identifier)
          : or(eq(users.email, identifier), eq(sql`LOWER(${users.fullName})`, identifier))
      )
      .limit(1);

    // Constant-time response — don't leak whether email exists
    if (!user || !user.isActive) {
      // Still run verify to prevent timing attacks
      await argon2.verify('$argon2id$v=19$m=65536,t=3,p=4$placeholder', password).catch(() => {});
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const passwordMatch = await argon2.verify(user.passwordHash, password);
    if (!passwordMatch) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    // ── Concurrent-session (seat) licence check ───────────────────────────
    // If the company has a max_users limit, check how many DISTINCT users
    // currently have at least one valid (non-expired) session.
    // This user's own existing sessions don't count as an extra seat.
    const now = new Date();

    // Find all companies this user belongs to
    const userCompanies = await db
      .select({ companyId: userRoles.companyId })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));

    for (const { companyId } of userCompanies) {
      const [lic] = await db
        .select({ maxUsers: companyLicense.maxUsers })
        .from(companyLicense)
        .where(eq(companyLicense.companyId, companyId))
        .limit(1);

      if (!lic || lic.maxUsers === -1) continue; // unlimited

      // Count distinct OTHER users who have active sessions in this company
      const companyUserIds = await db
        .selectDistinct({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.companyId, companyId));

      const otherUserIds = companyUserIds
        .map((r) => r.userId)
        .filter((id) => id !== user.id);

      if (otherUserIds.length === 0) continue;

      const [{ activeCount }] = await db
        .select({ activeCount: sql<number>`count(distinct ${sessions.userId})::int` })
        .from(sessions)
        .where(
          and(
            inArray(sessions.userId, otherUserIds),
            gt(sessions.expiresAt, now)
          )
        );

      // Seat is available if: activeOthers + 1 (this user) <= maxUsers
      if (activeCount + 1 > lic.maxUsers) {
        return reply.code(403).send({
          error: 'concurrent_limit_reached',
          detail: 'All licensed seats are currently in use. Please ask another user to log out first.',
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    // Create session
    const refreshToken = randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.jwt.refreshExpiresDays);

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        refreshToken,
        userAgent: request.headers['user-agent'] ?? null,
        ipAddress: request.ip ?? null,
        expiresAt,
      })
      .returning({ id: sessions.id });

    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const accessToken = app.jwt.sign({
      sub: user.id,
      sessionId: session.id,
      email: user.email,
      fullName: user.fullName,
      isSystemAdmin: user.isSystemAdmin,
    });

    return reply
      .setCookie('refresh_token', refreshToken, cookieOptions(expiresAt, config.isProd))
      .send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isSystemAdmin: user.isSystemAdmin,
        },
      });
  });

  // ── POST /api/auth/refresh ─────────────────────────────────────────────────
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies['refresh_token'];
    if (!token) {
      return reply.code(401).send({ error: 'No refresh token' });
    }

    const now = new Date();
    const [session] = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        activeCompanyId: sessions.activeCompanyId,
        activePlantId: sessions.activePlantId,
      })
      .from(sessions)
      .where(and(eq(sessions.refreshToken, token), gt(sessions.expiresAt, now)))
      .limit(1);

    if (!session) {
      reply.clearCookie('refresh_token', { path: '/api/auth' });
      return reply.code(401).send({ error: 'Session expired or invalid' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return reply.code(401).send({ error: 'User not found or deactivated' });
    }

    // Rotate the refresh token (old one is replaced — prevents reuse)
    const newRefreshToken = randomBytes(64).toString('hex');
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + config.jwt.refreshExpiresDays);

    await db
      .update(sessions)
      .set({ refreshToken: newRefreshToken, expiresAt: newExpiresAt })
      .where(eq(sessions.id, session.id));

    const accessToken = app.jwt.sign({
      sub: user.id,
      sessionId: session.id,
      email: user.email,
      fullName: user.fullName,
      isSystemAdmin: user.isSystemAdmin,
      // Preserve the active tenant context across refresh so the client is not
      // forced to re-select a company on every token rotation.
      activeCompanyId: session.activeCompanyId,
      activePlantId: session.activePlantId,
    });

    return reply
      .setCookie('refresh_token', newRefreshToken, cookieOptions(newExpiresAt, config.isProd))
      .send({
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isSystemAdmin: user.isSystemAdmin,
        },
      });
  });

  // ── POST /api/auth/logout ──────────────────────────────────────────────────
  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const token = request.cookies['refresh_token'];
    if (token) {
      await db.delete(sessions).where(eq(sessions.refreshToken, token));
    }
    return reply
      .clearCookie('refresh_token', { path: '/api/auth' })
      .send({ success: true });
  });

  // ── GET /api/auth/me ───────────────────────────────────────────────────────
  // No DB hit — user info is in the access token payload.
  // Use this for fast "who am I" checks on the frontend.
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send({ user: request.user });
  });

  // ── POST /api/auth/change-password ───────────────────────────────────────
  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/change-password',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body || {};

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'Current password and new password are required' });
      }

      if (newPassword.length < 6) {
        return reply.code(400).send({ error: 'New password must be at least 6 characters long' });
      }

      const userId = (request.user as any).id;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const match = await argon2.verify(user.passwordHash, currentPassword);
      if (!match) {
        return reply.code(400).send({ error: 'Incorrect current password' });
      }

      const newHash = await argon2.hash(newPassword);

      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return reply.send({ message: 'Password changed successfully' });
    },
  );

  // ── GET /api/auth/permissions ─────────────────────────────────────────────
  app.get<{ Querystring: { companyId?: string; plantId?: string } }>(
    '/permissions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { companyId } = request.query;
      const plantId = request.query.plantId ?? (request.user as any)?.activePlantId ?? undefined;
      const user = request.user as any;

      if (user?.isSystemAdmin) {
        return reply.send({ permissions: ['*'] });
      }

      if (!companyId) {
        return reply.send({ permissions: [] });
      }

      const svc = (app as any).permissionService;
      if (!svc) {
        return reply.send({ permissions: ['*'] });
      }

      const effectiveSet = await svc.getEffectivePermissions(user.id, companyId, plantId);
      return reply.send({ permissions: Array.from(effectiveSet) });
    },
  );

  // ── GET /api/auth/context-options ──────────────────────────────────────────
  // Companies the authenticated user may select as their active tenant context.
  // A user may belong to several companies; the login token carries none, so the
  // client fetches the options here and then binds one via /select-context.
  app.get('/context-options', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user!;

    // System admins may operate on any active company; everyone else only on the
    // companies they are a member of (company_users, backfilled from user_roles).
    const rows = user.isSystemAdmin
      ? await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(eq(companies.isActive, true))
          .orderBy(companies.name)
      : await db
          .selectDistinct({ id: companies.id, name: companies.name })
          .from(companyUsers)
          .innerJoin(companies, eq(companyUsers.companyId, companies.id))
          .where(
            and(
              eq(companyUsers.userId, user.id),
              eq(companyUsers.isActive, true),
              eq(companies.isActive, true),
            ),
          )
          .orderBy(companies.name);

    return reply.send({ companies: rows });
  });

  // ── POST /api/auth/select-context ──────────────────────────────────────────
  // The client requests a company (and optional plant). The server VALIDATES the
  // selection, persists it on the session, and returns a new access token that
  // carries the validated active context. This is the only way tenant context is
  // ever bound — downstream routes never trust a client-supplied company id.
  app.post<{ Body: { companyId?: string; plantId?: string | null } }>(
    '/select-context',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const user = request.user!;
      const { companyId, plantId } = request.body ?? {};

      if (!companyId || !isUuid(companyId)) {
        return reply.code(400).send({ error: 'A valid companyId is required' });
      }
      if (plantId != null && !isUuid(plantId)) {
        return reply.code(400).send({ error: 'plantId must be a valid id' });
      }

      // 1. Company must exist and be active.
      const [company] = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.isActive, true)))
        .limit(1);
      if (!company) {
        return reply.code(404).send({ error: 'Company not found or inactive' });
      }

      // 2. User must be a member of the company. System admins may select any.
      if (!user.isSystemAdmin) {
        const [membership] = await db
          .select({ id: companyUsers.id })
          .from(companyUsers)
          .where(
            and(
              eq(companyUsers.companyId, companyId),
              eq(companyUsers.userId, user.id),
              eq(companyUsers.isActive, true),
            ),
          )
          .limit(1);

        let isMember = !!membership;
        if (!isMember) {
          // Fallback for any membership not yet backfilled into company_users.
          const [roleRow] = await db
            .select({ id: userRoles.id })
            .from(userRoles)
            .where(and(eq(userRoles.companyId, companyId), eq(userRoles.userId, user.id)))
            .limit(1);
          isMember = !!roleRow;
        }
        if (!isMember) {
          return reply.code(403).send({ error: 'You are not a member of this company' });
        }
      }

      // 3. Optional plant must belong to the company and be accessible.
      let resolvedPlantId: string | null = null;
      if (plantId) {
        const [plant] = await db
          .select({ id: plants.id })
          .from(plants)
          .where(
            and(
              eq(plants.id, plantId),
              eq(plants.companyId, companyId),
              eq(plants.isActive, true),
            ),
          )
          .limit(1);
        if (!plant) {
          return reply.code(404).send({ error: 'Plant not found in this company' });
        }
        if (!user.isSystemAdmin) {
          const svc = (app as any).permissionService as PermissionService | undefined;
          if (svc && !(await svc.hasPlantAccess(user.id, plantId))) {
            return reply.code(403).send({ error: 'No access to this plant' });
          }
        }
        resolvedPlantId = plantId;
      }

      // 4. Persist the validated context on the session (source of truth).
      await db
        .update(sessions)
        .set({ activeCompanyId: companyId, activePlantId: resolvedPlantId })
        .where(eq(sessions.id, user.sessionId));

      // 5. Issue a fresh access token carrying the validated active context.
      const accessToken = app.jwt.sign({
        sub: user.id,
        sessionId: user.sessionId,
        email: user.email,
        fullName: user.fullName,
        isSystemAdmin: user.isSystemAdmin,
        activeCompanyId: companyId,
        activePlantId: resolvedPlantId,
      });

      return reply.send({
        accessToken,
        context: { companyId, companyName: company.name, plantId: resolvedPlantId },
      });
    },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function cookieOptions(expires: Date, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/api/auth',   // cookie only sent to auth endpoints
    expires,
  };
}
