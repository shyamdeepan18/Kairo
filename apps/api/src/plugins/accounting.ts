import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { AccountMapService } from '../services/account-map.js';
import { PostingEngine } from '../services/posting-engine.js';
import { BUILT_IN_TEMPLATES } from '../services/posting-templates.js';

/**
 * Registers the Posting Engine and account map service on the Fastify instance.
 *
 * Services available after registration:
 *   app.accountMapService  — resolves posting categories → GL account UUIDs
 *   app.postingEngine      — posts and reverses journal entries
 *
 * All built-in templates (purchase.grn, purchase.invoice, purchase.payment,
 * sales.invoice, sales.payment) are registered at startup.
 *
 * To add a custom template for a new document type, call:
 *   app.postingEngine.register('my.doctype', myTemplateFn);
 *
 * Usage in a route handler (inside db.transaction):
 *
 *   const { fiscalYear, period } = fiscalPeriod(new Date());
 *   const journalEntryId = await app.postingEngine.post(tx, {
 *     companyId, plantId, documentType: 'purchase.grn',
 *     documentId: grn.id, documentNumber: grn.documentNumber,
 *     postingDate: new Date(grn.postingDate),
 *     fiscalYear, period,
 *     header: grn,
 *     lines: grnLines,
 *     taxLines,    // from Tax Engine (Phase 4) or computed inline
 *   }, request.user.id);
 *
 * Cancellation (inside db.transaction):
 *
 *   await app.postingEngine.reverse(tx, originalJournalEntryId, new Date(), userId, 'User cancelled');
 */
async function accountingPlugin(app: FastifyInstance) {
  const accountMapService = new AccountMapService(app.redis);
  const postingEngine = new PostingEngine(accountMapService, app.numberSeriesService);

  // Register all built-in templates
  for (const [docType, template] of Object.entries(BUILT_IN_TEMPLATES)) {
    postingEngine.register(docType, template);
  }

  app.decorate('accountMapService', accountMapService);
  app.decorate('postingEngine', postingEngine);
}

export default fp(accountingPlugin, {
  name: 'accounting',
  // Needs app.redis (from redisPlugin) and app.numberSeriesService (from enginesPlugin)
  dependencies: ['redis', 'engines'],
});
