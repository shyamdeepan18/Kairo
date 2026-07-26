import type { FastifyInstance } from 'fastify';
import { eq, and, gt, or, sql, inArray } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { db, users, sessions, companyLicense, userRoles } from '@erp/db';
import { loginSchema } from '@erp/shared';
import { config } from '../config.js';

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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = uuidRegex.test(identifier);

    const [user] = await db
      .select()
      .from(users)
      .where(
        isUuid 
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
      const { companyId, plantId } = request.query;
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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cookieOptions(expires: Date, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/api/auth',   // cookie only sent to auth endpoints
    expires,
  };
}
