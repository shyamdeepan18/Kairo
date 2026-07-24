import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { TaxEngine } from '../services/tax-engine.js';
import { createIrpClient } from '../services/irp-client.js';

/**
 * Registers the Tax Engine and IRP client on the Fastify instance.
 *
 * Decorators available after registration:
 *   app.taxEngine   — stateless GST computation, GSTIN validation, e-invoice builder
 *   app.irpClient   — IRP API client (mock in dev, production with GSP credentials)
 *
 * IRP_MODE env var controls which client is created:
 *   IRP_MODE=mock        (default) — MockIrpClient, no real IRP calls
 *   IRP_MODE=production  — ProductionIrpClient, requires GSP credentials in .env
 *
 * ── Usage in route handlers ───────────────────────────────────────────────
 *
 * 1. Load tax code rates (once per unique tax code on the invoice):
 *      const rates = await app.taxEngine.loadTaxCode(companyId, 'GST18');
 *
 * 2. Compute tax for all lines:
 *      const taxResult = app.taxEngine.compute(
 *        lines.map(l => ({ ...l, ...rates })),
 *        company.gstin,
 *        customer.stateCode,   // place of supply
 *        'B2B'
 *      );
 *
 * 3. Persist tax lines (in the same db.transaction as the document):
 *      await tx.insert(documentTaxLines).values(
 *        taxResult.lines.map(l => ({
 *          companyId, documentType: 'sales.invoice',
 *          documentId: invoice.id, documentNumber: invoice.documentNumber,
 *          lineNumber: l.lineNumber, ...l,
 *          placeOfSupply: taxResult.placeOfSupply,
 *          isInterState: taxResult.isInterState,
 *          supplyType: taxResult.supplyType,
 *        }))
 *      );
 *
 * 4. After invoice is approved, generate e-invoice (if enabled):
 *      const payload = app.taxEngine.buildEInvoicePayload({ ...opts, taxResult });
 *      const irpResponse = await app.irpClient.generateIrn(payload);
 *      await db.insert(eInvoiceRecords).values({ ..., irn: irpResponse.irn, ... });
 *
 * 5. Validate a party GSTIN before saving:
 *      const { valid, errors } = app.taxEngine.validateGstin(body.gstin);
 *      if (!valid) return reply.code(400).send({ error: errors.join(', ') });
 */
async function taxPlugin(app: FastifyInstance) {
  app.decorate('taxEngine', new TaxEngine());
  app.decorate('irpClient', createIrpClient());
}

export default fp(taxPlugin, {
  name: 'tax',
  // No hard dependencies — taxEngine is stateless, irpClient needs only env vars
  dependencies: [],
});
