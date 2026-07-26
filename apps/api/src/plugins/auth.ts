import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Registers JWT + cookie plugins and adds the `authenticate` decorator.
 *
 * Usage on a route:
 *   { preHandler: [app.authenticate] }
 *
 * After authenticate runs, request.user is typed as AuthUser & { sessionId }.
 */
export default fp(async (app: FastifyInstance) => {
  await app.register(cookie, {
    secret: config.jwt.secret,
    hook: 'onRequest',
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.accessExpiresIn },
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        // Remap JWT payload -> request.user
        const p = request.user as any;
        request.user = {
          id: p.sub,
          sessionId: p.sessionId,
          email: p.email,
          fullName: p.fullName,
          isSystemAdmin: p.isSystemAdmin,
        };
      } catch (e: any) {
        request.log.error(e, 'JWT Verify failed');
        reply.code(401).send({ error: 'Unauthorized', details: e.message });
      }
    }
  );
});
