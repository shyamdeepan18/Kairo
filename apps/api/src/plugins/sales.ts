import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { PostingTemplateFn, RawJournalLine } from '../services/posting-engine.js';
import { StatusEngine } from '../services/status-engine.js';
import { PricingService } from '../services/pricing-service.js';

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

// ─── sales.return — COGS Reversal posting ──────────────────────────────────
//
// When customer returns goods, inventory is taken back into stock at COGS rate.
// Reverses sales.delivery:
//   DR Inventory (finished/raw)  (total COGS = Σ line WAC value)
//   CR Cost of Goods Sold        (same total)
//
export const salesReturnTemplate: PostingTemplateFn = (ctx, accountMap): RawJournalLine[] => {
  const totalCogs = ctx.lines.reduce((s, l) => s + ((l.lineAmountPaise as number) ?? 0), 0);
  if (totalCogs <= 0) return [];

  const inventoryCategory = accountMap.has('inventory_finished')
    ? ('inventory_finished' as const)
    : ('inventory_raw_material' as const);

  const cogsCategory = accountMap.has('cogs')
    ? ('cogs' as const)
    : accountMap.has('raw_material_consumed')
    ? ('raw_material_consumed' as const)
    : ('purchases' as const);

  return [
    { accountCategory: inventoryCategory, debitPaise: totalCogs, creditPaise: 0, narration: `Return Restock: ${ctx.documentNumber}` },
    { accountCategory: cogsCategory, debitPaise: 0, creditPaise: totalCogs, narration: `COGS Reversal: ${ctx.documentNumber}` },
  ];
};

// ─── sales.credit_note — AR & Revenue Reversal posting ────────────────────
//
// Credit note issued to customer (reverses sales.invoice):
//   DR Sales Revenue                    (net amount per line)
//   DR Output CGST / SGST / IGST        (tax amounts)
//   CR Accounts Receivable (customer)   (total amount incl. tax)
//
export const salesCreditNoteTemplate: PostingTemplateFn = (ctx, accountMap): RawJournalLine[] => {
  const lines: RawJournalLine[] = [];
  const customerId = ctx.header.customerId as string;
  let cgst = 0, sgst = 0, igst = 0;
  for (const t of ctx.taxLines ?? []) {
    if (t.taxType === 'cgst') cgst += t.taxAmountPaise;
    else if (t.taxType === 'sgst') sgst += t.taxAmountPaise;
    else if (t.taxType === 'igst') igst += t.taxAmountPaise;
  }
  const totalTax = cgst + sgst + igst;
  const totalNetPaise = ctx.lines.reduce((s, l) => s + (l.lineAmountPaise as number), 0);
  const totalCreditNotePaise = totalNetPaise + totalTax;

  // DR Revenue (one line per item line)
  for (const line of ctx.lines) {
    lines.push({
      accountCategory: 'sales_revenue',
      debitPaise: line.lineAmountPaise as number,
      creditPaise: 0,
      narration: `Credit: ${String(line.itemDescription ?? line.itemCode ?? '')}`,
    });
  }

  // DR Output GST
  if (cgst > 0 && accountMap.has('output_cgst')) {
    lines.push({ accountCategory: 'output_cgst', debitPaise: cgst, creditPaise: 0, taxCode: 'CGST' });
  }
  if (sgst > 0 && accountMap.has('output_sgst')) {
    lines.push({ accountCategory: 'output_sgst', debitPaise: sgst, creditPaise: 0, taxCode: 'SGST' });
  }
  if (igst > 0 && accountMap.has('output_igst')) {
    lines.push({ accountCategory: 'output_igst', debitPaise: igst, creditPaise: 0, taxCode: 'IGST' });
  }

  // CR Receivable
  lines.push({
    accountCategory: 'accounts_receivable',
    debitPaise: 0,
    creditPaise: totalCreditNotePaise,
    partyType: 'customer',
    partyId: customerId,
    narration: `Credit Note: ${ctx.documentNumber}`,
  });

  return lines;
};

async function salesPlugin(app: FastifyInstance) {
  app.postingEngine.register('sales.delivery', salesDeliveryTemplate);
  app.postingEngine.register('sales.return', salesReturnTemplate);
  app.postingEngine.register('sales.credit_note', salesCreditNoteTemplate);

  // Section B — sales pricing engine (price-list resolution)
  app.decorate('pricingService', new PricingService());

  StatusEngine.register('sales.payment', {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  });

  StatusEngine.register('sales.return', {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  [],
    cancelled: [],
  });

  StatusEngine.register('sales.credit_note', {
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
