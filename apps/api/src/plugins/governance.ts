import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { ApprovalEngine } from '../services/approval-engine.js';
import { LicenseService } from '../services/license-service.js';
import {
  purchaseRequisitions, purchaseOrders, goodsReceiptNotes, purchaseInvoices, purchasePayments,
  salesQuotations, salesOrders, salesInvoices, salesReceipts,
  productionFormulas, productionOrders,
} from '@erp/db';

/**
 * Permission roadmap item 2 — registers the ApprovalEngine (multi-level approval
 * workflows) and LicenseService (company module activation + seat caps).
 *
 * The ApprovalEngine needs to know each approvable document type's header table so
 * it can stamp the final decision; we register them here at startup.
 */
async function governancePlugin(app: FastifyInstance) {
  const licenseService = new LicenseService(app.redis);
  const approvalEngine = new ApprovalEngine(app.auditEngine);

  approvalEngine.registerDocument('purchase.requisition', purchaseRequisitions);
  approvalEngine.registerDocument('purchase.po', purchaseOrders);
  approvalEngine.registerDocument('purchase.grn', goodsReceiptNotes);
  approvalEngine.registerDocument('purchase.invoice', purchaseInvoices);
  approvalEngine.registerDocument('purchase.payment', purchasePayments);
  approvalEngine.registerDocument('sales.quotation', salesQuotations);
  approvalEngine.registerDocument('sales.so', salesOrders);
  approvalEngine.registerDocument('sales.invoice', salesInvoices);
  approvalEngine.registerDocument('sales.payment', salesReceipts);
  approvalEngine.registerDocument('manufacturing.bom', productionFormulas);
  approvalEngine.registerDocument('manufacturing.order', productionOrders);

  app.decorate('licenseService', licenseService);
  app.decorate('approvalEngine', approvalEngine);
}

export default fp(governancePlugin, {
  name: 'governance',
  dependencies: ['redis', 'engines'],   // needs app.redis + app.auditEngine
});
