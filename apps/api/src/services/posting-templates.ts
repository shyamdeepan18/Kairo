/**
 * Built-in posting templates for Phase 6 document types.
 *
 * Every template is a pure function:
 *   (ctx: PostingContext, accountMap: AccountMap) => RawJournalLine[]
 *
 * Rules every template must follow:
 *   1. SUM(debitPaise) must equal SUM(creditPaise) — enforced by PostingEngine
 *   2. Use accountMap.resolve(category) — never hardcode account UUIDs
 *   3. All amounts come from ctx.header or ctx.lines — already in paise
 *   4. For optional accounts (e.g. tax), use accountMap.has(category) before resolve()
 *
 * Register templates at startup in apps/api/src/plugins/accounting.ts.
 */

import type { PostingContext, PostingTemplateFn, RawJournalLine } from './posting-engine.js';
import type { AccountMap } from './account-map.js';

// ─── Helper: extract GST lines from ctx.taxLines ──────────────────────────

interface GstAmounts {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

function extractGst(ctx: PostingContext): GstAmounts {
  let cgst = 0, sgst = 0, igst = 0;
  for (const t of ctx.taxLines ?? []) {
    if (t.taxType === 'cgst') cgst += t.taxAmountPaise;
    else if (t.taxType === 'sgst') sgst += t.taxAmountPaise;
    else if (t.taxType === 'igst') igst += t.taxAmountPaise;
  }
  return { cgst, sgst, igst, total: cgst + sgst + igst };
}

// ─── purchase.grn ─────────────────────────────────────────────────────────
//
// Goods Receipt Note: supplier delivers goods into warehouse.
//
//   DR Inventory                     (net amount, per line)
//   DR Input CGST / SGST / IGST      (tax amounts from taxLines)
//   CR GR/IR Clearing                (net amount)
//   CR GR/IR Tax Clearing            (total tax amount)
//
// GR/IR Clearing is a suspense account that is cleared when the Purchase
// Invoice is booked (purchase.invoice template reverses these clearing entries).

export const purchaseGrnTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const lines: RawJournalLine[] = [];

  for (const line of ctx.lines) {
    const netAmountPaise = line.lineAmountPaise as number;

    lines.push({
      accountCategory: 'inventory_raw_material',
      debitPaise: netAmountPaise,
      creditPaise: 0,
      narration: `GRN: ${String(line.itemDescription ?? line.itemCode ?? '')}`,
    });
    lines.push({
      accountCategory: 'grn_clearing',
      debitPaise: 0,
      creditPaise: netAmountPaise,
    });
  }

  // Tax lines
  const gst = extractGst(ctx);
  const supplierId = ctx.header.supplierId as string | undefined;

  if (gst.cgst > 0 && accountMap.has('input_cgst')) {
    lines.push({ accountCategory: 'input_cgst', debitPaise: gst.cgst, creditPaise: 0, taxCode: 'CGST' });
    lines.push({ accountCategory: 'grn_tax_clearing', debitPaise: 0, creditPaise: gst.cgst });
  }
  if (gst.sgst > 0 && accountMap.has('input_sgst')) {
    lines.push({ accountCategory: 'input_sgst', debitPaise: gst.sgst, creditPaise: 0, taxCode: 'SGST' });
    lines.push({ accountCategory: 'grn_tax_clearing', debitPaise: 0, creditPaise: gst.sgst });
  }
  if (gst.igst > 0 && accountMap.has('input_igst')) {
    lines.push({ accountCategory: 'input_igst', debitPaise: gst.igst, creditPaise: 0, taxCode: 'IGST' });
    lines.push({ accountCategory: 'grn_tax_clearing', debitPaise: 0, creditPaise: gst.igst });
  }

  return lines;
};

// ─── purchase.invoice ─────────────────────────────────────────────────────
//
// Supplier invoice matched against GRN — clears the GR/IR suspense and
// creates a payable to the supplier.
//
//   DR GR/IR Clearing                (net amount — clears the GRN suspense)
//   DR GR/IR Tax Clearing            (tax amount — clears the GRN tax suspense)
//   CR Accounts Payable (supplier)   (total invoice amount incl. tax)

export const purchaseInvoiceTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const totalNetPaise = ctx.lines.reduce((s, l) => s + (l.lineAmountPaise as number), 0);
  const gst = extractGst(ctx);
  const totalInvoicePaise = totalNetPaise + gst.total;
  const supplierId = ctx.header.supplierId as string;

  const lines: RawJournalLine[] = [
    {
      accountCategory: 'grn_clearing',
      debitPaise: totalNetPaise,
      creditPaise: 0,
      narration: `Invoice match: ${ctx.documentNumber}`,
    },
  ];

  if (gst.total > 0) {
    lines.push({
      accountCategory: 'grn_tax_clearing',
      debitPaise: gst.total,
      creditPaise: 0,
    });
  }

  lines.push({
    accountCategory: 'accounts_payable',
    debitPaise: 0,
    creditPaise: totalInvoicePaise,
    partyType: 'supplier',
    partyId: supplierId,
    narration: `Payable: ${ctx.documentNumber}`,
  });

  return lines;
};

// ─── purchase.payment ─────────────────────────────────────────────────────
//
// Payment made to a supplier — reduces the AP balance.
//
//   DR Accounts Payable (supplier)   (payment amount)
//   CR Bank / Cash                   (payment amount)

export const purchasePaymentTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const amountPaise = ctx.header.amountPaise as number;
  const supplierId = ctx.header.supplierId as string;
  const bankAccount: 'bank' | 'cash' =
    ctx.header.paymentMode === 'cash' ? 'cash' : 'bank';

  return [
    {
      accountCategory: 'accounts_payable',
      debitPaise: amountPaise,
      creditPaise: 0,
      partyType: 'supplier',
      partyId: supplierId,
      narration: `Payment: ${ctx.documentNumber}`,
    },
    {
      accountCategory: bankAccount,
      debitPaise: 0,
      creditPaise: amountPaise,
    },
  ];
};

// ─── sales.invoice ────────────────────────────────────────────────────────
//
// Sales invoice issued to customer.
//
//   DR Accounts Receivable (customer)  (total amount incl. tax)
//   CR Sales Revenue                    (net amount per line)
//   CR Output CGST / SGST / IGST        (tax amounts)

export const salesInvoiceTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const lines: RawJournalLine[] = [];
  const customerId = ctx.header.customerId as string;
  const gst = extractGst(ctx);

  const totalNetPaise = ctx.lines.reduce((s, l) => s + (l.lineAmountPaise as number), 0);
  const totalInvoicePaise = totalNetPaise + gst.total;

  // DR Receivable
  lines.push({
    accountCategory: 'accounts_receivable',
    debitPaise: totalInvoicePaise,
    creditPaise: 0,
    partyType: 'customer',
    partyId: customerId,
    narration: `Invoice: ${ctx.documentNumber}`,
  });

  // CR Revenue (one line per doc line keeps narration granular)
  for (const line of ctx.lines) {
    lines.push({
      accountCategory: 'sales_revenue',
      debitPaise: 0,
      creditPaise: line.lineAmountPaise as number,
      narration: String(line.itemDescription ?? line.itemCode ?? ''),
    });
  }

  // CR Output GST
  if (gst.cgst > 0 && accountMap.has('output_cgst')) {
    lines.push({ accountCategory: 'output_cgst', debitPaise: 0, creditPaise: gst.cgst, taxCode: 'CGST' });
  }
  if (gst.sgst > 0 && accountMap.has('output_sgst')) {
    lines.push({ accountCategory: 'output_sgst', debitPaise: 0, creditPaise: gst.sgst, taxCode: 'SGST' });
  }
  if (gst.igst > 0 && accountMap.has('output_igst')) {
    lines.push({ accountCategory: 'output_igst', debitPaise: 0, creditPaise: gst.igst, taxCode: 'IGST' });
  }

  return lines;
};

// ─── sales.payment (customer receipt) ─────────────────────────────────────
//
//   DR Bank / Cash                     (receipt amount)
//   CR Accounts Receivable (customer)  (receipt amount)

export const salesPaymentTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const amountPaise = ctx.header.amountPaise as number;
  const customerId = ctx.header.customerId as string;
  const bankAccount: 'bank' | 'cash' =
    ctx.header.paymentMode === 'cash' ? 'cash' : 'bank';

  return [
    {
      accountCategory: bankAccount,
      debitPaise: amountPaise,
      creditPaise: 0,
    },
    {
      accountCategory: 'accounts_receivable',
      debitPaise: 0,
      creditPaise: amountPaise,
      partyType: 'customer',
      partyId: customerId,
      narration: `Receipt: ${ctx.documentNumber}`,
    },
  ];
};

// ─── manufacturing.issue ──────────────────────────────────────────────────
//
// Raw material / packing material issued to a production order.
// Each line carries the item's WAC at time of issue (valuationAmountPaise).
//
//   DR WIP                       (total value of all issued materials)
//   CR Raw Material Inventory    (per line, for raw_material items)
//   CR Stores Inventory          (per line, for consumable/packing items)
//
// ctx.lines: { itemType, valuationAmountPaise, itemCode }

export const manufacturingIssueTemplate: PostingTemplateFn = (ctx, _accountMap) => {
  const lines: RawJournalLine[] = [];

  let totalIssuedPaise = 0;
  for (const line of ctx.lines) {
    const valuePaise = line.valuationAmountPaise as number;
    totalIssuedPaise += valuePaise;

    const inventoryCategory =
      line.itemType === 'consumable' || line.itemType === 'packing'
        ? 'inventory_stores'
        : 'inventory_raw_material';

    lines.push({
      accountCategory: inventoryCategory,
      debitPaise: 0,
      creditPaise: valuePaise,
      narration: `Issue: ${String(line.itemCode ?? '')}`,
    });
  }

  // DR WIP for total issued value
  lines.unshift({
    accountCategory: 'inventory_wip',
    debitPaise: totalIssuedPaise,
    creditPaise: 0,
    narration: `Production issue: ${ctx.documentNumber}`,
  });

  return lines;
};

// ─── manufacturing.receipt ────────────────────────────────────────────────
//
// Finished goods (or semi-finished) received from a completed production order.
//
//   DR Finished Goods Inventory  (or inventory_wip for semi-finished)
//   CR WIP                       (at actual production cost)
//
// Optional production variance line (standard cost vs actual cost):
//   DR/CR Production Variance    (if std cost ≠ actual cost)
//
// ctx.header: { inventoryCategory, actualCostPaise, standardCostPaise? }

export const manufacturingReceiptTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const actualCost = ctx.header.actualCostPaise as number;
  const inventoryCategory =
    (ctx.header.inventoryCategory as string) ?? 'inventory_finished';

  const lines: RawJournalLine[] = [
    {
      accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
      debitPaise: actualCost,
      creditPaise: 0,
      narration: `Production receipt: ${ctx.documentNumber}`,
    },
    {
      accountCategory: 'inventory_wip',
      debitPaise: 0,
      creditPaise: actualCost,
    },
  ];

  // Standard cost variance (if standard cost configured)
  if (ctx.header.standardCostPaise !== undefined) {
    const standardCost = ctx.header.standardCostPaise as number;
    const variance = actualCost - standardCost;
    if (variance !== 0 && accountMap.has('production_variance')) {
      lines.push({
        accountCategory: 'production_variance',
        debitPaise: variance > 0 ? variance : 0,   // unfavorable variance = DR
        creditPaise: variance < 0 ? -variance : 0,  // favorable variance = CR
        narration: `Cost variance: ${ctx.documentNumber}`,
      });
      // Adjust FG / WIP lines to keep balance
      lines[0]!.debitPaise = standardCost;
      lines[1]!.creditPaise = standardCost;
    }
  }

  return lines;
};

// ─── stock.adjustment_in ─────────────────────────────────────────────────
//
// Physical stock count surplus — stock found in excess of system balance.
//
//   DR Inventory (appropriate category)
//   CR Stock Adjustment (P&L account)
//
// ctx.header: { inventoryCategory, totalValuePaise }

export const stockAdjustmentInTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const value = ctx.header.totalValuePaise as number;
  const inventoryCategory =
    (ctx.header.inventoryCategory as string) ?? 'inventory_raw_material';

  return [
    {
      accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
      debitPaise: value,
      creditPaise: 0,
      narration: `Stock adjustment (surplus): ${ctx.documentNumber}`,
    },
    {
      accountCategory: 'stock_adjustment',
      debitPaise: 0,
      creditPaise: value,
    },
  ];
};

// ─── stock.adjustment_out ────────────────────────────────────────────────
//
// Physical stock count deficit — stock missing vs system balance.
//
//   DR Stock Adjustment (P&L account)
//   CR Inventory (appropriate category)
//
// ctx.header: { inventoryCategory, totalValuePaise }

export const stockAdjustmentOutTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const value = ctx.header.totalValuePaise as number;
  const inventoryCategory =
    (ctx.header.inventoryCategory as string) ?? 'inventory_raw_material';

  return [
    {
      accountCategory: 'stock_adjustment',
      debitPaise: value,
      creditPaise: 0,
    },
    {
      accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
      debitPaise: 0,
      creditPaise: value,
      narration: `Stock adjustment (deficit): ${ctx.documentNumber}`,
    },
  ];
};

// ─── stock.scrap ─────────────────────────────────────────────────────────
//
// Material scrapped or written off.
//
//   DR Scrap Inventory           (if scrap has recovery value, e.g. metal turnings)
//   DR Stock Adjustment          (net loss = cost - recovery value)
//   CR Inventory                 (at WAC)
//
// ctx.header: { inventoryCategory, totalValuePaise, scrapRecoveryPaise? }

export const stockScrapTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const issuedValue = ctx.header.totalValuePaise as number;
  const scrapRecovery = (ctx.header.scrapRecoveryPaise as number | undefined) ?? 0;
  const netLoss = issuedValue - scrapRecovery;
  const inventoryCategory =
    (ctx.header.inventoryCategory as string) ?? 'inventory_raw_material';

  const lines: RawJournalLine[] = [];

  if (scrapRecovery > 0 && accountMap.has('inventory_scrap')) {
    lines.push({
      accountCategory: 'inventory_scrap',
      debitPaise: scrapRecovery,
      creditPaise: 0,
      narration: `Scrap recovery: ${ctx.documentNumber}`,
    });
  }

  if (netLoss > 0) {
    lines.push({
      accountCategory: 'stock_adjustment',
      debitPaise: netLoss,
      creditPaise: 0,
      narration: `Scrap write-off: ${ctx.documentNumber}`,
    });
  }

  lines.push({
    accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
    debitPaise: 0,
    creditPaise: issuedValue,
  });

  return lines;
};

// ─── accounting.jv (manual Journal Voucher) ───────────────────────────────
//
// Lines come directly from the user — each line specifies an accountId
// (not a category). The template's only job is to pass them through;
// PostingEngine still validates DR = CR.
//
// Note: manual JVs use a different account resolution path — the route
// handler must resolve accountIds to PostingCategories before calling post(),
// OR use PostingEngine.postRaw() which accepts direct account IDs.
// For now, manual JVs are handled directly by the route without this template.

// ─── inventory.adjustment (combined in+out) ────────────────────────────────
//
// Combined adjustment document where each line carries its own movementType.
// Each line is handled independently:
//   adjustment_in:  DR Inventory / CR Stock Adjustment
//   adjustment_out: DR Stock Adjustment / CR Inventory
//
// ctx.lines: [{ lineAmountPaise, movementType }]

export const inventoryAdjustmentTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const lines: RawJournalLine[] = [];
  for (const l of ctx.lines) {
    const amount = l.lineAmountPaise as number;
    if (!amount || amount === 0) continue;
    const isIn = (l.movementType as string) === 'adjustment_in';
    lines.push({
      accountCategory: 'inventory_raw_material',
      debitPaise:  isIn ? amount : 0,
      creditPaise: isIn ? 0 : amount,
      narration: `Adj ${isIn ? 'in' : 'out'}: ${ctx.documentNumber}`,
    });
    lines.push({
      accountCategory: 'stock_adjustment',
      debitPaise:  isIn ? 0 : amount,
      creditPaise: isIn ? amount : 0,
    });
  }
  // If all lines are zero, produce a no-op balanced pair to satisfy invariant
  if (lines.length === 0) {
    lines.push({ accountCategory: 'inventory_raw_material', debitPaise: 0, creditPaise: 0 });
    lines.push({ accountCategory: 'stock_adjustment',       debitPaise: 0, creditPaise: 0 });
  }
  return lines;
};

// ─── manufacturing.operation ─────────────────────────────────────────────
//
// Labour and overhead absorbed from routing operations into WIP.
//
//   DR WIP
//   CR Labour Absorption
//   CR Overhead Absorption
//
// ctx.header: { labourPaise, overheadPaise }

export const manufacturingOperationTemplate: PostingTemplateFn = (ctx, _accountMap) => {
  const labour = (ctx.header.labourPaise as number) || 0;
  const overhead = (ctx.header.overheadPaise as number) || 0;
  const total = labour + overhead;
  if (total === 0) return [];

  const lines: RawJournalLine[] = [];
  lines.push({
    accountCategory: 'inventory_wip',
    debitPaise: total,
    creditPaise: 0,
    narration: `Operation absorption: ${ctx.documentNumber}`,
  });
  if (labour > 0) {
    lines.push({
      accountCategory: 'labour_absorption',
      debitPaise: 0,
      creditPaise: labour,
    });
  }
  if (overhead > 0) {
    lines.push({
      accountCategory: 'overhead_absorption',
      debitPaise: 0,
      creditPaise: overhead,
    });
  }
  return lines;
};

// ─── manufacturing.close ───────────────────────────────────────────────
//
// Residual WIP variance at production order close.
//
//   DR Production Variance (if positive/unfavorable variance)
//   CR WIP (if positive/unfavorable variance)
//
// ctx.header: { variancePaise }

export const manufacturingCloseTemplate: PostingTemplateFn = (ctx, _accountMap) => {
  const variance = (ctx.header.variancePaise as number) || 0;
  if (variance === 0) return [];

  return [
    {
      accountCategory: 'production_variance',
      debitPaise: variance > 0 ? variance : 0,
      creditPaise: variance < 0 ? -variance : 0,
      narration: `Close variance: ${ctx.documentNumber}`,
    },
    {
      accountCategory: 'inventory_wip',
      debitPaise: variance < 0 ? -variance : 0,
      creditPaise: variance > 0 ? variance : 0,
    },
  ];
};

// ─── subcontracting.issue ───────────────────────────────────────────────
//
// Material issued to subcontractor.
//
//   DR WIP (Subcontracting WIP)
//   CR Inventory
//
// ctx.header: { totalValuePaise, inventoryCategory }

export const subconIssueTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const value = (ctx.header.totalValuePaise as number) || 0;
  const inventoryCategory = (ctx.header.inventoryCategory as string) ?? 'inventory_raw_material';

  return [
    {
      accountCategory: 'inventory_wip',
      debitPaise: value,
      creditPaise: 0,
      narration: `Subcon issue: ${ctx.documentNumber}`,
    },
    {
      accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
      debitPaise: 0,
      creditPaise: value,
    },
  ];
};

// ─── subcontracting.receipt ───────────────────────────────────────────────
//
// Material received from subcontractor.
//
//   DR Inventory (Finished Goods)
//   CR WIP (Subcontracting WIP)
//
// ctx.header: { totalValuePaise, inventoryCategory }

export const subconReceiptTemplate: PostingTemplateFn = (ctx, accountMap) => {
  const value = (ctx.header.totalValuePaise as number) || 0;
  const inventoryCategory = (ctx.header.inventoryCategory as string) ?? 'inventory_finished';

  return [
    {
      accountCategory: inventoryCategory as Parameters<typeof accountMap.resolve>[0],
      debitPaise: value,
      creditPaise: 0,
      narration: `Subcon receipt: ${ctx.documentNumber}`,
    },
    {
      accountCategory: 'inventory_wip',
      debitPaise: 0,
      creditPaise: value,
    },
  ];
};

// All built-in templates as a record for easy bulk-registration
export const BUILT_IN_TEMPLATES: Record<string, PostingTemplateFn> = {
  // Purchase
  'purchase.grn':             purchaseGrnTemplate,
  'purchase.invoice':         purchaseInvoiceTemplate,
  'purchase.payment':         purchasePaymentTemplate,
  // Sales
  'sales.invoice':            salesInvoiceTemplate,
  'sales.payment':            salesPaymentTemplate,
  // Manufacturing (Phase 5)
  'manufacturing.issue':      manufacturingIssueTemplate,
  'manufacturing.receipt':    manufacturingReceiptTemplate,
  'manufacturing.operation':  manufacturingOperationTemplate,
  'manufacturing.close':      manufacturingCloseTemplate,
  'manufacturing.subcon_issue': subconIssueTemplate,
  'manufacturing.subcon_receipt': subconReceiptTemplate,
  // Stock adjustments (Phase 5)
  'stock.adjustment_in':      stockAdjustmentInTemplate,
  'stock.adjustment_out':     stockAdjustmentOutTemplate,
  'stock.scrap':              stockScrapTemplate,
  // Inventory module
  'inventory.adjustment':     inventoryAdjustmentTemplate,
};
