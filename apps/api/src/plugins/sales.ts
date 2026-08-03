import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { PostingTemplateFn, RawJournalLine } from '../services/posting-engine.js';
import { StatusEngine } from '../services/status-engine.js';

/**
 * Phase 7 — Sales wiring that closes the two gaps the sales schema needs:
 *
 *  1. sales.delivery COGS posting template — the existing BUILT_IN_TEMPLATES
 *     (accounting plugin) cover sales.invoice and sales.payment, but NOT the
 *     COGS entry on dispatch. We register it here at runtime (no edit to the
 *     shared posting-templates.ts).
 *
 *  2. The customer-receipt lifecycle. salesReceipts uses documentType
 *     'sales.payment' so the registered salesPaymentTemplate fires, but the
 *     StatusEngine had no transitions for it — we register them here.
 *
 * Depends on the accounting plugin (needs app.postingEngine).
 */

// ─── sales.delivery — COGS posting ──────────────────────────────────────────
//
//   DR Cost of Goods Sold        (total COGS = Σ line WAC value)
//   CR Inventory (finished/raw)  (same total)
//
// ctx.lines carry lineAmountPaise = the COGS value of each delivered line
// (the weighted-average cost snapshot returned by StockLedgerService on the
// outward movement). No tax — COGS is cost only; revenue/GST is on the invoice.

export const salesDeliveryTemplate: PostingTemplateFn = (ctx, accountMap): RawJournalLine[] => {
  const totalCogs = ctx.lines.reduce((s, l) => s + ((l.lineAmountPaise as number) ?? 0), 0);
  if (totalCogs <= 0) return [];   // zero-cost issue (e.g. sample) — nothing to post

  const inventoryCategory = accountMap.has('inventory_finished')
    ? ('inventory_finished' as const)
    : ('inventory_raw_material' as const);

  const cogsCategory = accountMap.has('cogs')
    ? ('cogs' as const)
    : accountMap.has('raw_material_consumed')
    ? ('raw_material_consumed' as const)
    : ('purchases' as const);

  return [
    { accountCategory: cogsCategory, debitPaise: totalCogs, creditPaise: 0, narration: `COGS: ${ctx.documentNumber}` },
    { accountCategory: inventoryCategory, debitPaise: 0, creditPaise: totalCogs },
  ];
};

async function salesPlugin(app: FastifyInstance) {
  app.postingEngine.register('sales.delivery', salesDeliveryTemplate);

  StatusEngine.register('sales.payment', {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  });
}

export default fp(salesPlugin, {
  name: 'sales',
  dependencies: ['accounting'],   // needs app.postingEngine
});
