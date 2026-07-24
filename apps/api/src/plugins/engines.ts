import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { DocumentConfigService } from '../services/document-config.js';
import { NumberSeriesService } from '../services/number-series.js';
import { StatusEngine } from '../services/status-engine.js';
import { AuditEngine } from '../services/audit-engine.js';

/**
 * Registers all four Document Engine services as Fastify decorators.
 *
 * Services available after registration:
 *   app.docConfigService   — L1/L2 metadata resolution + custom field validation
 *   app.numberSeriesService — atomic, gap-free document number generation
 *   app.statusEngine       — status transition validation (static class, decorated for convenience)
 *   app.auditEngine        — immutable audit trail logging
 *
 * Usage in route files:
 *
 *   // Validate L2 custom fields
 *   const validation = await app.docConfigService.validateCustomData(
 *     companyId, 'purchase.po', body.customData, 'header'
 *   );
 *
 *   // Generate document number (within a db.transaction)
 *   const docNumber = await app.numberSeriesService.next(tx, companyId, 'purchase.po', {
 *     plantId: body.plantId,
 *     plantCode: plant.code,
 *   });
 *
 *   // Validate + prepare a status transition
 *   const result = StatusEngine.prepare('purchase.po', doc.status, 'approved', user.id);
 *   await tx.update(purchaseOrders).set(result.stampFields).where(...);
 *
 *   // Log the transition to audit trail
 *   await app.auditEngine.logTransition(ctx, doc.status, result, body.remarks, { tx });
 */
async function enginesPlugin(app: FastifyInstance) {
  // DocumentConfigService needs Redis for caching
  app.decorate('docConfigService', new DocumentConfigService(app.redis));

  // NumberSeriesService is stateless (pure logic + DB calls)
  app.decorate('numberSeriesService', new NumberSeriesService());

  // StatusEngine is a static class — decorate for consistent access pattern
  app.decorate('statusEngine', StatusEngine);

  // AuditEngine is stateless
  app.decorate('auditEngine', new AuditEngine());
}

export default fp(enginesPlugin, {
  name: 'engines',
  // Must register after redisPlugin (needs app.redis)
  dependencies: ['redis'],
});
