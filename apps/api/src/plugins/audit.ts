import fp from 'fastify-plugin';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, auditLogs } from '@erp/db';
import { randomUUID } from 'crypto';

export default fp(async (app: FastifyInstance) => {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only log mutations (POST, PUT, PATCH, DELETE)
    if (['GET', 'OPTIONS', 'HEAD'].includes(request.method)) {
      return;
    }

    // Only log successful responses (or you can log failures too if desired)
    // We stick to successful state changes to avoid bloating the DB with validation errors
    if (reply.statusCode >= 400) {
      return;
    }

    // Try to identify the user from JWT (assuming auth hook populates request.user)
    const userId = request.user?.id || null;
    const companyId = request.user?.activeCompanyId || null;

    // Infer entity and action from the URL and method
    const urlParts = request.url.split('?')[0].split('/').filter(Boolean); // e.g. ['api', 'sales', 'invoices', '123']
    
    // Ignore auth endpoints like login/refresh to avoid logging passwords or standard auth flows
    if (urlParts.includes('auth')) {
        return;
    }

    let entity = urlParts[urlParts.length - 1] || 'Unknown';
    let entityId = null;

    // If the last part is a UUID or ID (e.g., invoices/123), the entity is the previous part
    if (urlParts.length > 1 && /^[0-9a-fA-F-]{36}$|^\d+$/.test(entity)) {
        entityId = entity;
        entity = urlParts[urlParts.length - 2];
    }

    // Format the action based on method
    let action = 'UNKNOWN';
    switch (request.method) {
      case 'POST': action = 'CREATE'; break;
      case 'PUT':
      case 'PATCH': action = 'UPDATE'; break;
      case 'DELETE': action = 'DELETE'; break;
    }

    try {
      // Asynchronously insert the audit log so we don't block the response stream
      db.insert(auditLogs).values({
        id: randomUUID(),
        companyId,
        userId,
        action,
        entity,
        entityId,
        ipAddress: request.ip,
        details: {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode
        },
        createdAt: new Date(),
      }).execute().catch(err => {
        app.log.error({ err, msg: 'Failed to insert audit log' });
      });
    } catch (err) {
      app.log.error({ err, msg: 'Error formulating audit log' });
    }
  });
});
