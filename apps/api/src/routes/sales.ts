import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc, gt, sql, inArray } from 'drizzle-orm';
import {
  db,
  customers, customerAddresses,
  salesQuotations, salesQuotationLines,
  salesOrders, salesOrderLines,
  deliveryNotes, deliveryNoteLines,
  salesInvoices, salesInvoiceLines,
  salesReceipts, salesReceiptAllocations,
  salesReturns, salesReturnLines,
  salesCreditNotes, salesCreditNoteLines,
  stockReservations,
  stockBalances,
  stockLedgerEntries,
  itemBatches,
  plants, warehouses, items, taxCodes,
  users, approvalRequests,
} from '@erp/db';
import {
  customerCreateSchema, customerUpdateSchema, customerAddressCreateSchema,
  quotationCreateSchema, soCreateSchema, deliveryCreateSchema,
  salesInvoiceCreateSchema, salesReceiptCreateSchema,
  salesReturnCreateSchema, salesCreditNoteCreateSchema, quickInvoiceCreateSchema, transitionSchema,
} from '@erp/shared';
import { authorize } from '../middleware/authorize.js';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { byTenantId } from '../db/tenant-query.js';
import { requireModule } from '../middleware/require-module.js';
import { stripServerOwned } from '../db/dto.js';
import { assertOwned, assertAllOwned } from '../db/fk-ownership.js';
import { fiscalPeriod, type PostingContext, type TaxLine } from '../services/posting-engine.js';
import type { DocumentStatus } from '../services/status-engine.js';

/**
 * Phase 7 — Sales routes.  Mounted at /api/sales (see index.ts).
 *
 * Chain: Quotation → Sales Order → Delivery → Invoice → Receipt.
 *   Delivery approval posts stock OUT (sales_delivery) + COGS GL (sales.delivery,
 *     registered in plugins/sales.ts); COGS = WAC snapshot from the stock ledger.
 *   Invoice approval posts revenue GL (sales.invoice: DR AR / CR Revenue + Output GST).
 *   Receipt approval posts GL (sales.payment: DR Bank / CR AR) + applies allocations.
 *   Return approval posts stock IN (return_from_customer) + COGS reversal (sales.return: DR Inventory / CR COGS).
 *   Credit Note approval posts revenue & tax reversal (sales.credit_note: DR Revenue+Tax / CR AR).
 *
 * The customer-receipt header uses documentType 'sales.payment' so the existing
 * salesPaymentTemplate fires; its StatusEngine transitions are registered in the
 * sales plugin. Seed series first with seedSalesNumberSeries().
 */
export default async function salesRoutes(app: FastifyInstance) {
  // Authenticate at the group level FIRST so the module gate below sees the
  // trusted JWT context (request.user.activeCompanyId) instead of client input.
  // Individual routes still run authenticate + resolveTenantContext + authorize.
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireModule('sales'));   // company must have the sales module licensed
  registerCustomers(app);
  registerQuotations(app);
  registerOrders(app);
  registerDeliveries(app);
  registerInvoices(app);
  registerQuickInvoice(app);
  registerReceipts(app);
  registerSalesReturns(app);
  registerCreditNotes(app);
}

// ─── Shared helpers (mirror of routes/purchase.ts) ──────────────────────────

const userId = (req: FastifyRequest): string => (req.user as { id: string }).id;

function bad(reply: FastifyReply, parsed: { error: { issues: unknown } }) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}

interface ComputedLine {
  netAmountPaise: number;
  discountPaise: number;
  cgstAmountPaise: number;
  sgstAmountPaise: number;
  igstAmountPaise: number;
  cessAmountPaise: number;
  taxAmountPaise: number;
  totalAmountPaise: number;
}

interface TaxCodeRates {
  cgstRateBp: number;
  sgstRateBp: number;
  igstRateBp: number;
  cessRateBp: number;
}

function computeLine(input: {
  quantity: number; ratePaise: number; discountPercent?: number; discountPaise?: number;
  cgstAmountPaise?: number; sgstAmountPaise?: number; igstAmountPaise?: number; cessAmountPaise?: number;
  taxCode?: TaxCodeRates;
  isInterState?: boolean;
}): ComputedLine {
  const gross = Math.round(input.quantity * input.ratePaise);
  const discountPaise = input.discountPaise && input.discountPaise > 0
    ? input.discountPaise
    : Math.round((gross * (input.discountPercent ?? 0)) / 100);
  const netAmountPaise = Math.max(0, gross - discountPaise);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;

  if (input.taxCode && netAmountPaise > 0) {
    if (input.isInterState) {
      igst = Math.round((netAmountPaise * input.taxCode.igstRateBp) / 10000);
      cess = Math.round((netAmountPaise * input.taxCode.cessRateBp) / 10000);
    } else {
      cgst = Math.round((netAmountPaise * input.taxCode.cgstRateBp) / 10000);
      sgst = Math.round((netAmountPaise * input.taxCode.sgstRateBp) / 10000);
      cess = Math.round((netAmountPaise * input.taxCode.cessRateBp) / 10000);
    }
  } else {
    cgst = input.cgstAmountPaise ?? 0;
    sgst = input.sgstAmountPaise ?? 0;
    igst = input.igstAmountPaise ?? 0;
    cess = input.cessAmountPaise ?? 0;
  }

  const taxAmountPaise = cgst + sgst + igst + cess;
  return {
    netAmountPaise, discountPaise,
    cgstAmountPaise: cgst, sgstAmountPaise: sgst, igstAmountPaise: igst, cessAmountPaise: cess,
    taxAmountPaise, totalAmountPaise: netAmountPaise + taxAmountPaise,
  };
}

function headerTotals(lines: ComputedLine[], header?: { discountPaise?: number; roundOffPaise?: number }) {
  const lineNetAmount = lines.reduce((s, l) => s + l.netAmountPaise, 0);
  const taxAmountPaise = lines.reduce((s, l) => s + l.taxAmountPaise, 0);
  const discountPaise = header?.discountPaise && header.discountPaise > 0 ? header.discountPaise : 0;
  const netAmountPaise = Math.max(0, lineNetAmount - discountPaise);
  const rawTotal = netAmountPaise + taxAmountPaise;
  const roundOffPaise = header?.roundOffPaise !== undefined && header.roundOffPaise !== 0
    ? header.roundOffPaise
    : (Math.round(rawTotal / 100) * 100 - rawTotal);
  const totalAmountPaise = rawTotal + roundOffPaise;
  return { netAmountPaise, taxAmountPaise, discountPaise, roundOffPaise, totalAmountPaise };
}

function taxLinesFrom(lines: ComputedLine[]): TaxLine[] {
  const base = lines.reduce((s, l) => s + l.netAmountPaise, 0);
  const cgst = lines.reduce((s, l) => s + l.cgstAmountPaise, 0);
  const sgst = lines.reduce((s, l) => s + l.sgstAmountPaise, 0);
  const igst = lines.reduce((s, l) => s + l.igstAmountPaise, 0);
  const out: TaxLine[] = [];
  if (cgst > 0) out.push({ taxCode: 'CGST', taxType: 'cgst', baseAmountPaise: base, taxAmountPaise: cgst });
  if (sgst > 0) out.push({ taxCode: 'SGST', taxType: 'sgst', baseAmountPaise: base, taxAmountPaise: sgst });
  if (igst > 0) out.push({ taxCode: 'IGST', taxType: 'igst', baseAmountPaise: base, taxAmountPaise: igst });
  return out;
}

/** Tax lines reconstructed from persisted invoice line rows. */
function invoiceTaxLines(lines: Array<{ netAmountPaise: number; cgstAmountPaise: number; sgstAmountPaise: number; igstAmountPaise: number }>): TaxLine[] {
  return taxLinesFrom(lines.map((l) => ({
    netAmountPaise: l.netAmountPaise, discountPaise: 0,
    cgstAmountPaise: l.cgstAmountPaise, sgstAmountPaise: l.sgstAmountPaise,
    igstAmountPaise: l.igstAmountPaise, cessAmountPaise: 0,
    taxAmountPaise: 0, totalAmountPaise: 0,
  })));
}

async function applyTransition(
  app: FastifyInstance,
  opts: {
    client: typeof db; table: any; docType: string; id: string; companyId: string;
    documentNumber: string; fromStatus: DocumentStatus; toStatus: DocumentStatus;
    userId: string; remarks?: string; extraSet?: Record<string, unknown>;
  }
) {
  const result = app.statusEngine.prepare(opts.docType, opts.fromStatus, opts.toStatus, opts.userId);
  await opts.client.update(opts.table).set({ ...result.stampFields, ...(opts.extraSet ?? {}) }).where(eq(opts.table.id, opts.id));
  await app.auditEngine.logTransition(
    { companyId: opts.companyId, documentType: opts.docType, documentId: opts.id, documentNumber: opts.documentNumber, performedBy: opts.userId },
    opts.fromStatus, result, opts.remarks, { tx: opts.client }
  );
  return result;
}

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize ?? '50'), 10) || 50));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

async function listHeaders(request: FastifyRequest, table: any, docType?: string) {
  const cid = tenant(request).companyId;
  const q = request.query as Record<string, unknown>;
  const { page, pageSize, limit, offset } = paginate(q);
  const filters: any[] = [eq(table.companyId, cid)];
  if (q.status) filters.push(eq(table.status, String(q.status)));

  const rawData = await db
    .select({
      doc: table,
      creatorName: users.fullName,
    })
    .from(table)
    .leftJoin(users, eq(table.createdBy, users.id))
    .where(and(...filters))
    .orderBy(desc(table.createdAt))
    .limit(limit)
    .offset(offset);

  const data = rawData.map(r => ({ ...r.doc, createdByName: r.creatorName }));
  let decorated = data;
  if (docType && request.server.approvalEngine) {
    decorated = await request.server.approvalEngine.decorateDocuments(cid, userId(request), data, docType);
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(and(...filters));
  return { data: decorated, total: count, page, pageSize };
}

async function getWithLines(
  request: FastifyRequest,
  reply: FastifyReply,
  table: any,
  linesTable: any,
  fk: any,
  params: { id: string },
  docType?: string
) {
  const cid = tenant(request).companyId;
  const [header] = await db.select().from(table).where(byTenantId(table, params.id, cid)).limit(1);
  if (!header) return reply.code(404).send({ error: 'Not found' });

  let createdByName: string | undefined = undefined;
  let submittedByName: string | undefined = undefined;

  if (header.createdBy) {
    const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, header.createdBy)).limit(1);
    if (u) createdByName = u.fullName;
  }

  if (header.submittedBy) {
    const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, header.submittedBy)).limit(1);
    if (u) submittedByName = u.fullName;
  }

  const lines = await db.select().from(linesTable).where(eq(fk, params.id));
  const doc = { ...header, createdByName, submittedByName, lines };

  if (docType && request.server.approvalEngine) {
    const [decorated] = await request.server.approvalEngine.decorateDocuments(header.companyId, userId(request), [doc], docType);
    return decorated;
  }
  return doc;
}

function simpleTransition(
  app: FastifyInstance,
  cfg: { route: string; table: any; docType: string; to: DocumentStatus; perm: string }
) {
  app.post(cfg.route, {
    preHandler: [app.authenticate, resolveTenantContext],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    // Scope to the caller's company so a foreign document can't be transitioned here.
    const [row] = await db.select().from(cfg.table).where(byTenantId(cfg.table, id, cid)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const hasBasePerm = await app.permissionService.check(uid, cfg.perm, cid, row.plantId);

    if (cfg.to === 'approved' || cfg.to === 'rejected') {
      // Check if there's a pending ApprovalRequest for this document
      const [req] = await db.select().from(approvalRequests)
        .where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending')))
        .limit(1);

      if (req) {
        try {
          const res = await db.transaction((tx) =>
            app.approvalEngine.act(tx, req.id, uid, cfg.to as 'approved' | 'rejected', remarks, { companyId: cid, bypassSod })
          );
          if ('finalized' in res) return reply.send({ ok: true, status: res.decision });
          return reply.send({ ok: true, status: 'submitted', detail: res });
        } catch (err) {
          return reply.code(409).send({ error: `Approval action failed: ${(err as Error).message}`, detail: (err as Error).message });
        }
      }

      const isMaker = uid === row.createdBy || uid === row.submittedBy;
      if (cfg.to === 'rejected' && isMaker) {
        // Maker recall allowed
      } else if (!hasBasePerm) {
        return reply.code(403).send({ error: `Missing permission: ${cfg.perm}` });
      }

      if (cfg.to === 'approved' && !app.permissionService.validateMakerChecker(uid, row.createdBy, row.submittedBy, bypassSod)) {
        return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
      }
    } else {
      // For submit, cancel, etc.
      if (!hasBasePerm) {
        return reply.code(403).send({ error: `Missing permission: ${cfg.perm}` });
      }
    }

    if (cfg.to === 'submitted') {
      try {
        const res = await db.transaction(async (tx) => {
          const startRes = await app.approvalEngine.start(tx, {
            companyId: cid, documentType: cfg.docType, documentId: id,
            documentNumber: row.documentNumber, amountPaise: row.totalAmountPaise, createdBy: row.createdBy
          });
          await applyTransition(app, {
            client: tx, table: cfg.table, docType: cfg.docType, id, companyId: cid,
            documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
            toStatus: cfg.to, userId: uid, remarks,
          });
          return startRes;
        });
        return reply.send({ ok: true, status: cfg.to, detail: res });
      } catch (err) {
        return reply.code(409).send({ error: 'Submit action failed', detail: (err as Error).message });
      }
    }

    try {
      await applyTransition(app, {
        client: db, table: cfg.table, docType: cfg.docType, id, companyId: cid,
        documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
        toStatus: cfg.to, userId: uid, remarks,
      });
      return reply.send({ ok: true, status: cfg.to });
    } catch (err) {
      return reply.code(409).send({ error: 'Transition failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Customers (+ addresses)
// ════════════════════════════════════════════════════════════════════════════

function registerCustomers(app: FastifyInstance) {
  app.post('/customers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.create')],
  }, async (request, reply) => {
    const parsed = customerCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const [row] = await db.insert(customers).values({
      companyId: tenant(request).companyId, customerCode: d.customerCode, name: d.name, legalName: d.legalName,
      customerType: d.customerType, gstin: d.gstin, pan: d.pan, stateCode: d.stateCode ?? d.gstin?.slice(0, 2),
      contactPerson: d.contactPerson, phone: d.phone, email: d.email,
      paymentTermsDays: d.paymentTermsDays, creditLimitPaise: d.creditLimitPaise,
      defaultDiscountPercent: String(d.defaultDiscountPercent), tcsApplicable: d.tcsApplicable,
      createdBy: userId(request),
    }).returning();
    return reply.code(201).send(row);
  });

  app.get('/customers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const { page, pageSize, limit, offset } = paginate(request.query as Record<string, unknown>);
    const data = await db.select().from(customers).where(eq(customers.companyId, cid))
      .orderBy(desc(customers.createdAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.companyId, cid));
    return { data, total: count, page, pageSize };
  });

  app.get('/customers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [row] = await db.select().from(customers).where(byTenantId(customers, id, cid)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Customer not found' });
    const addresses = await db.select().from(customerAddresses)
      .where(and(eq(customerAddresses.customerId, id), eq(customerAddresses.companyId, cid)));
    return { ...row, addresses };
  });

  app.patch('/customers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = customerUpdateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const patch: Record<string, unknown> = { ...parsed.data, updatedBy: userId(request), updatedAt: new Date() };
    if (parsed.data.defaultDiscountPercent !== undefined) patch.defaultDiscountPercent = String(parsed.data.defaultDiscountPercent);
    const [row] = await db.update(customers).set(patch)
      .where(byTenantId(customers, id, tenant(request).companyId)).returning();
    if (!row) return reply.code(404).send({ error: 'Customer not found' });
    return row;
  });

  // Addresses
  app.post('/customers/:id/addresses', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = customerAddressCreateSchema.safeParse({ ...stripServerOwned(request.body), customerId: id });
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const [row] = await db.insert(customerAddresses).values({
      companyId: tenant(request).companyId, customerId: id, addressType: d.addressType, label: d.label,
      gstin: d.gstin, stateCode: d.stateCode, address: d.address, city: d.city, state: d.state,
      pincode: d.pincode, contactPerson: d.contactPerson, phone: d.phone, isDefault: d.isDefault,
    }).returning();
    return reply.code(201).send(row);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Quotations  (no GL, no stock)
// ════════════════════════════════════════════════════════════════════════════

function registerQuotations(app: FastifyInstance) {
  const DOC = 'sales.quotation';

  app.post('/quotations', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = quotationCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(customerAddresses, d.billingAddressId, cid, 'Billing address'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);

    const itemRecords = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      minSellingPricePaise: items.minSellingPricePaise,
      purchaseRatePaise: items.purchaseRatePaise,
      standardCostPaise: items.standardCostPaise,
    }).from(items).where(and(
      eq(items.companyId, cid),
      inArray(items.id, d.lines.map((l) => l.itemId))
    ));
    const itemMap = new Map(itemRecords.map((i) => [i.id, i]));

    // Resolve missing ratePaise via PricingService (price list → item list price → std cost → 0)
    const resolvedLines = await Promise.all(d.lines.map(async (l) => {
      if (l.ratePaise != null && l.ratePaise > 0) return { ...l, ratePaise: l.ratePaise, discountPercent: l.discountPercent ?? 0 };
      const resolved = await app.pricingService.resolveLine(cid, l.itemId, { customerId: d.customerId, qty: l.quantity });
      return {
        ...l,
        ratePaise: resolved.unitPricePaise,
        discountPercent: l.discountPercent ?? resolved.discountPercent,
      };
    }));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [customer] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, d.customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const pos = d.placeOfSupply || (customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = resolvedLines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < resolvedLines.length; i++) {
        const l = resolvedLines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          if (netUnitPrice < it.minSellingPricePaise) {
            return reply.code(409).send({
              error: `Line rate ₹${(netUnitPrice / 100).toFixed(2)} for item '${it.itemCode}' is below the minimum selling price floor ₹${(it.minSellingPricePaise / 100).toFixed(2)}.`,
            });
          }
        }
      }
    }

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [q] = await tx.insert(salesQuotations).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, billingAddressId: d.billingAddressId,
        shippingAddressId: d.shippingAddressId, validUntilDate: d.validUntilDate as any,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesQuotationLines).values(
        resolvedLines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          const estMargin = netUnitPrice > 0 ? Number((((netUnitPrice - estCost) / netUnitPrice) * 100).toFixed(2)) : 0;
          return {
            quotationId: q.id, lineNumber: i + 1, itemId: l.itemId, description: l.description,
            quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
            discountPercent: String(l.discountPercent ?? 0), discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise, taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
            custom_data: {
              estimatedUnitCostPaise: estCost,
              estimatedMarginPercent: estMargin,
              minSellingPricePaise: it?.minSellingPricePaise || 0,
            },
          };
        })
      );
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: q.id, documentNumber, performedBy: userId(request) }, q, { tx });
      return q;
    });
    return reply.code(201).send(created);
  });

  app.put('/quotations/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = quotationCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    const [existing] = await db.select().from(salesQuotations)
      .where(byTenantId(salesQuotations, id, cid)).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Quotation not found' });
    if (existing.status !== 'draft') return reply.code(409).send({ error: 'Can only edit draft quotations' });

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(customerAddresses, d.billingAddressId, cid, 'Billing address'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);

    const itemRecords = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      minSellingPricePaise: items.minSellingPricePaise,
      purchaseRatePaise: items.purchaseRatePaise,
      standardCostPaise: items.standardCostPaise,
    }).from(items).where(and(
      eq(items.companyId, cid),
      inArray(items.id, d.lines.map((l) => l.itemId))
    ));
    const itemMap = new Map(itemRecords.map((i) => [i.id, i]));

    const resolvedLines = await Promise.all(d.lines.map(async (l) => {
      if (l.ratePaise != null && l.ratePaise > 0) return { ...l, ratePaise: l.ratePaise, discountPercent: l.discountPercent ?? 0 };
      const resolved = await app.pricingService.resolveLine(cid, l.itemId, { customerId: d.customerId, qty: l.quantity });
      return {
        ...l,
        ratePaise: resolved.unitPricePaise,
        discountPercent: l.discountPercent ?? resolved.discountPercent,
      };
    }));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [customer] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, d.customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const pos = d.placeOfSupply || (customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = resolvedLines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < resolvedLines.length; i++) {
        const l = resolvedLines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          if (netUnitPrice < it.minSellingPricePaise) {
            return reply.code(409).send({
              error: `Line rate ₹${(netUnitPrice / 100).toFixed(2)} for item '${it.itemCode}' is below the minimum selling price floor ₹${(it.minSellingPricePaise / 100).toFixed(2)}.`,
            });
          }
        }
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [q] = await tx.update(salesQuotations).set({
        plantId: d.plantId, customerId: d.customerId, billingAddressId: d.billingAddressId,
        shippingAddressId: d.shippingAddressId, validUntilDate: d.validUntilDate as any,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, updatedAt: new Date(),
      }).where(byTenantId(salesQuotations, id, cid)).returning();

      await tx.delete(salesQuotationLines).where(eq(salesQuotationLines.quotationId, id));

      await tx.insert(salesQuotationLines).values(
        resolvedLines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          const estMargin = netUnitPrice > 0 ? Number((((netUnitPrice - estCost) / netUnitPrice) * 100).toFixed(2)) : 0;
          return {
            quotationId: q.id, lineNumber: i + 1, itemId: l.itemId, description: l.description,
            quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
            discountPercent: String(l.discountPercent ?? 0), discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise, taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
            custom_data: {
              estimatedUnitCostPaise: estCost,
              estimatedMarginPercent: estMargin,
              minSellingPricePaise: it?.minSellingPricePaise || 0,
            },
          };
        })
      );
      await app.auditEngine.logUpdate({ companyId: cid, documentType: DOC, documentId: q.id, documentNumber: q.documentNumber, performedBy: userId(request) }, existing, q, { tx });
      return q;
    });
    return reply.send(updated);
  });

  app.get('/quotations', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.view')] },
    async (request) => listHeaders(request, salesQuotations, DOC));
  app.get('/quotations/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.view')] },
    async (request, reply) => getWithLines(request, reply, salesQuotations, salesQuotationLines, salesQuotationLines.quotationId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/quotations/:id/submit', table: salesQuotations, docType: DOC, to: 'submitted', perm: 'sales.quotation.submit' });
  simpleTransition(app, { route: '/quotations/:id/approve', table: salesQuotations, docType: DOC, to: 'approved', perm: 'sales.quotation.approve' });
  simpleTransition(app, { route: '/quotations/:id/reject', table: salesQuotations, docType: DOC, to: 'rejected', perm: 'sales.quotation.approve' });
}

// ════════════════════════════════════════════════════════════════════════════
// Sales Orders  (no GL; on approval stock could be reserved — see notes)
// ════════════════════════════════════════════════════════════════════════════

function registerOrders(app: FastifyInstance) {
  const DOC = 'sales.so';

  app.post('/orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = soCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(salesQuotations, d.quotationId, cid, 'Quotation'),
      assertOwned(customerAddresses, d.billingAddressId, cid, 'Billing address'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);

    const itemRecords = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      minSellingPricePaise: items.minSellingPricePaise,
      purchaseRatePaise: items.purchaseRatePaise,
      standardCostPaise: items.standardCostPaise,
    }).from(items).where(and(
      eq(items.companyId, cid),
      inArray(items.id, d.lines.map((l) => l.itemId))
    ));
    const itemMap = new Map(itemRecords.map((i) => [i.id, i]));

    // Resolve missing ratePaise via PricingService (price list → item list price → std cost → 0)
    const resolvedLines = await Promise.all(d.lines.map(async (l) => {
      if (l.ratePaise != null && l.ratePaise > 0) return { ...l, ratePaise: l.ratePaise, discountPercent: l.discountPercent ?? 0 };
      const resolved = await app.pricingService.resolveLine(cid, l.itemId, { customerId: d.customerId, qty: l.quantity });
      return {
        ...l,
        ratePaise: resolved.unitPricePaise,
        discountPercent: l.discountPercent ?? resolved.discountPercent,
      };
    }));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [customer] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, d.customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const pos = d.placeOfSupply || (customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = resolvedLines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < resolvedLines.length; i++) {
        const l = resolvedLines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          if (netUnitPrice < it.minSellingPricePaise) {
            return reply.code(409).send({
              error: `Line rate ₹${(netUnitPrice / 100).toFixed(2)} for item '${it.itemCode}' is below the minimum selling price floor ₹${(it.minSellingPricePaise / 100).toFixed(2)}.`,
            });
          }
        }
      }
    }

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [so] = await tx.insert(salesOrders).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, quotationId: d.quotationId,
        billingAddressId: d.billingAddressId, shippingAddressId: d.shippingAddressId,
        customerPoNumber: d.customerPoNumber, customerPoDate: d.customerPoDate as any,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesOrderLines).values(
        resolvedLines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          const estMargin = netUnitPrice > 0 ? Number((((netUnitPrice - estCost) / netUnitPrice) * 100).toFixed(2)) : 0;
          return {
            soId: so.id, lineNumber: i + 1, quotationLineId: l.quotationLineId, itemId: l.itemId,
            description: l.description, quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
            discountPercent: String(l.discountPercent ?? 0), discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise, taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
            warehouseId: l.warehouseId,
            custom_data: {
              estimatedUnitCostPaise: estCost,
              estimatedMarginPercent: estMargin,
              minSellingPricePaise: it?.minSellingPricePaise || 0,
            },
          };
        })
      );
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: so.id, documentNumber, performedBy: userId(request) }, so, { tx });
      return so;
    });
    return reply.code(201).send(created);
  });

  app.put('/orders/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = soCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    const [existing] = await db.select().from(salesOrders)
      .where(byTenantId(salesOrders, id, cid)).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Sales Order not found' });
    if (existing.status !== 'draft') return reply.code(409).send({ error: 'Can only edit draft orders' });

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(salesQuotations, d.quotationId, cid, 'Quotation'),
      assertOwned(customerAddresses, d.billingAddressId, cid, 'Billing address'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);

    const itemRecords = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      itemName: items.itemName,
      minSellingPricePaise: items.minSellingPricePaise,
      purchaseRatePaise: items.purchaseRatePaise,
      standardCostPaise: items.standardCostPaise,
    }).from(items).where(and(
      eq(items.companyId, cid),
      inArray(items.id, d.lines.map((l) => l.itemId))
    ));
    const itemMap = new Map(itemRecords.map((i) => [i.id, i]));

    const resolvedLines = await Promise.all(d.lines.map(async (l) => {
      if (l.ratePaise != null && l.ratePaise > 0) return { ...l, ratePaise: l.ratePaise, discountPercent: l.discountPercent ?? 0 };
      const resolved = await app.pricingService.resolveLine(cid, l.itemId, { customerId: d.customerId, qty: l.quantity });
      return {
        ...l,
        ratePaise: resolved.unitPricePaise,
        discountPercent: l.discountPercent ?? resolved.discountPercent,
      };
    }));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [customer] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, d.customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const pos = d.placeOfSupply || (customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = resolvedLines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < resolvedLines.length; i++) {
        const l = resolvedLines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          if (netUnitPrice < it.minSellingPricePaise) {
            return reply.code(409).send({
              error: `Line rate ₹${(netUnitPrice / 100).toFixed(2)} for item '${it.itemCode}' is below the minimum selling price floor ₹${(it.minSellingPricePaise / 100).toFixed(2)}.`,
            });
          }
        }
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [so] = await tx.update(salesOrders).set({
        plantId: d.plantId, customerId: d.customerId, quotationId: d.quotationId,
        billingAddressId: d.billingAddressId, shippingAddressId: d.shippingAddressId,
        customerPoNumber: d.customerPoNumber, customerPoDate: d.customerPoDate as any,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, updatedAt: new Date(),
      }).where(byTenantId(salesOrders, id, cid)).returning();

      // Revert old quotation line orderedQty
      const oldLines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.soId, id));
      for (const line of oldLines) {
        if (line.quotationLineId) {
          await tx.update(salesQuotationLines)
            .set({ orderedQty: sql`GREATEST(0, ${salesQuotationLines.orderedQty} - ${parseFloat(line.quantity)})` })
            .where(eq(salesQuotationLines.id, line.quotationLineId));
        }
      }

      await tx.delete(salesOrderLines).where(eq(salesOrderLines.soId, id));

      await tx.insert(salesOrderLines).values(
        resolvedLines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : (l.ratePaise ?? 0);
          const estMargin = netUnitPrice > 0 ? Number((((netUnitPrice - estCost) / netUnitPrice) * 100).toFixed(2)) : 0;
          return {
            soId: so.id, lineNumber: i + 1, quotationLineId: l.quotationLineId, itemId: l.itemId,
            description: l.description, quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
            discountPercent: String(l.discountPercent ?? 0), discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise, taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
            warehouseId: l.warehouseId,
            custom_data: {
              estimatedUnitCostPaise: estCost,
              estimatedMarginPercent: estMargin,
              minSellingPricePaise: it?.minSellingPricePaise || 0,
            },
          };
        })
      );

      // Increment new quotation line orderedQty
      for (const l of resolvedLines) {
        if (l.quotationLineId) {
          await tx.update(salesQuotationLines)
            .set({ orderedQty: sql`${salesQuotationLines.orderedQty} + ${l.quantity}` })
            .where(eq(salesQuotationLines.id, l.quotationLineId));
        }
      }

      await app.auditEngine.logUpdate({ companyId: cid, documentType: DOC, documentId: so.id, documentNumber: so.documentNumber, performedBy: userId(request) }, existing, so, { tx });
      return so;
    });
    return reply.send(updated);
  });

  app.get('/orders', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')] },
    async (request) => listHeaders(request, salesOrders, DOC));
  app.get('/orders/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')] },
    async (request, reply) => getWithLines(request, reply, salesOrders, salesOrderLines, salesOrderLines.soId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/orders/:id/submit', table: salesOrders, docType: DOC, to: 'submitted', perm: 'sales.so.submit' });
  
  async function validateAndReserveStockForSo(
    tx: any,
    so: any,
    cid: string,
    uid: string,
    remarks?: string
  ) {
    // Credit limit check & credit hold gate
    const [cust] = await tx.select().from(customers).where(byTenantId(customers, so.customerId, cid)).limit(1);
    if (cust) {
      if (cust.creditHold) {
        throw new Error(`Customer '${cust.name}' is on credit hold. Cannot approve Sales Order.`);
      }
      if (cust.creditLimitPaise && cust.creditLimitPaise > 0) {
        const [bal] = await tx
          .select({ sum: sql<number>`COALESCE(SUM(total_amount_paise - received_amount_paise), 0)` })
          .from(salesInvoices)
          .where(and(eq(salesInvoices.companyId, cid), eq(salesInvoices.customerId, cust.id), sql`${salesInvoices.paymentStatus} != 'paid'`));
        const outstanding = Number(bal?.sum || 0);
        if (outstanding + so.totalAmountPaise > cust.creditLimitPaise) {
          throw new Error(`Sales Order total (₹${(so.totalAmountPaise / 100).toFixed(2)}) exceeds customer credit limit (₹${(cust.creditLimitPaise / 100).toFixed(2)}).`);
        }
      }
    }

    const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.soId, so.id));

    // 1. Fetch item definitions to identify stock-tracked items
    const itemIds: string[] = Array.from(new Set(lines.map((l: any) => String(l.itemId))));
    const itemRows = itemIds.length > 0
      ? await tx.select({ id: items.id, itemCode: items.itemCode, itemName: items.itemName, isStockItem: items.isStockItem }).from(items).where(inArray(items.id, itemIds))
      : [];
    const itemMap = new Map<string, { id: string; itemCode: string; itemName: string; isStockItem: boolean }>(
      itemRows.map((it: any) => [it.id, it])
    );

    // 2. Aggregate required quantity per warehouse + item
    const requiredMap = new Map<string, { warehouseId: string; itemId: string; qty: number; itemCode: string }>();
    for (const l of lines) {
      const item = itemMap.get(l.itemId);
      if (item?.isStockItem && l.warehouseId) {
        const key = `${l.warehouseId}:${l.itemId}`;
        const existing = requiredMap.get(key);
        const qty = parseFloat(l.quantity);
        if (existing) {
          existing.qty += qty;
        } else {
          requiredMap.set(key, { warehouseId: l.warehouseId, itemId: l.itemId, qty, itemCode: item.itemCode });
        }
      }
    }

    // 3. Lock balance rows and verify sufficient available stock (onHand - reserved)
    for (const req of requiredMap.values()) {
      const [balance] = await tx
        .select()
        .from(stockBalances)
        .where(
          and(
            eq(stockBalances.companyId, cid),
            eq(stockBalances.warehouseId, req.warehouseId),
            eq(stockBalances.itemId, req.itemId)
          )
        )
        .for('update');

      const onHand = parseFloat(balance?.quantityOnHand ?? '0');
      const reserved = parseFloat(balance?.quantityReserved ?? '0');
      const available = onHand - reserved;

      if (available < req.qty) {
        throw new Error(`Insufficient available stock for item '${req.itemCode}' in warehouse. Available: ${available.toFixed(4)}, required: ${req.qty.toFixed(4)}`);
      }
    }

    // 4. Create stock reservations and update stock_balances.quantityReserved
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const item = itemMap.get(l.itemId);
      if (item?.isStockItem && l.warehouseId) {
        await tx.insert(stockReservations).values({
          companyId: cid,
          plantId: so.plantId,
          warehouseId: l.warehouseId,
          itemId: l.itemId,
          documentType: 'sales.order',
          documentId: so.id,
          documentNumber: so.documentNumber,
          documentLineNumber: l.lineNumber ?? (i + 1),
          reservedQty: String(l.quantity),
          status: 'active',
          createdBy: uid,
        });

        await tx.update(salesOrderLines)
          .set({ reservedQty: String(l.quantity) })
          .where(eq(salesOrderLines.id, l.id));

        await tx.update(stockBalances)
          .set({
            quantityReserved: sql`${stockBalances.quantityReserved} + ${parseFloat(l.quantity)}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(stockBalances.companyId, cid),
              eq(stockBalances.warehouseId, l.warehouseId),
              eq(stockBalances.itemId, l.itemId)
            )
          );
      }
    }

    await applyTransition(app, {
      client: tx as any, table: salesOrders, docType: DOC, id: so.id, companyId: cid,
      documentNumber: so.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
      userId: uid, remarks,
    });
  }

  // Approve SO → ApprovalEngine + Credit check + Monetary limit + Stock reservations write
  app.post('/orders/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [so] = await db.select().from(salesOrders).where(byTenantId(salesOrders, id, cid)).limit(1);
    if (!so) return reply.code(404).send({ error: 'Sales Order not found' });
    if (so.status !== 'submitted') return reply.code(409).send({ error: `SO must be submitted (is '${so.status}')` });

    // 1. Check ApprovalEngine first
    const [req] = await db.select().from(approvalRequests)
      .where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending')))
      .limit(1);

    if (req) {
      try {
        const actRes = await db.transaction(async (tx) => {
          const res = await app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, {
            skipFinalizeDoc: true,
            companyId: cid,
            bypassSod,
          });

          if (!('finalized' in res)) {
            return { advanced: true, res };
          }

          // Finalized! Complete credit check, stock check, reservations, and applyTransition to 'approved'
          await validateAndReserveStockForSo(tx, so, cid, uid, remarks);
          return { finalized: true, res };
        });

        if (!actRes.finalized) {
          return reply.send({ ok: true, status: 'submitted', detail: actRes.res });
        }
        return reply.send({ ok: true, status: 'approved' });
      } catch (err) {
        return reply.code(409).send({ error: `Approval action failed: ${(err as Error).message}`, detail: (err as Error).message });
      }
    }

    // 2. Fallback when no ApprovalEngine request exists:
    if (!app.permissionService.validateMakerChecker(uid, so.createdBy, so.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Maker/submitter cannot approve.' });
    }

    const withinLimit = await app.permissionService.withinApprovalLimit(
      uid, cid, DOC, so.totalAmountPaise, so.plantId
    );
    if (!withinLimit) {
      return reply.code(403).send({ error: 'Document total exceeds your monetary approval limit.' });
    }

    try {
      await db.transaction(async (tx) => {
        await validateAndReserveStockForSo(tx, so, cid, uid, remarks);
      });
      return reply.send({ ok: true, status: 'approved' });
    } catch (err) {
      return reply.code(409).send({ error: 'SO approval failed', detail: (err as Error).message });
    }
  });

  // Dedicated SO cancel handler: guards against active deliveries/invoices & releases reservations
  app.post('/orders/:id/cancel', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.cancel')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;

    const [so] = await db.select().from(salesOrders).where(byTenantId(salesOrders, id, cid)).limit(1);
    if (!so) return reply.code(404).send({ error: 'Sales Order not found' });

    // Guard 1: Prevent cancellation if any non-cancelled Delivery Note exists
    const [{ dnCount }] = await db
      .select({ dnCount: sql<number>`count(*)::int` })
      .from(deliveryNotes)
      .where(and(
        eq(deliveryNotes.soId, id),
        eq(deliveryNotes.companyId, cid),
        sql`${deliveryNotes.status} != 'cancelled'`
      ));
    if (dnCount > 0) {
      return reply.code(409).send({ error: 'Cannot cancel Sales Order because a Delivery Note already exists against it. Please short-close it instead.' });
    }

    // Guard 2: Prevent cancellation if any non-cancelled Sales Invoice exists
    const [{ invCount }] = await db
      .select({ invCount: sql<number>`count(*)::int` })
      .from(salesInvoices)
      .where(and(
        eq(salesInvoices.soId, id),
        eq(salesInvoices.companyId, cid),
        sql`${salesInvoices.status} != 'cancelled'`
      ));
    if (invCount > 0) {
      return reply.code(409).send({ error: 'Cannot cancel Sales Order because a Sales Invoice already exists against it.' });
    }

    try {
      await db.transaction(async (tx) => {
        // Release active stock reservations for this SO
        const activeReservations = await tx
          .select()
          .from(stockReservations)
          .where(and(
            eq(stockReservations.companyId, cid),
            eq(stockReservations.documentType, 'sales.order'),
            eq(stockReservations.documentId, id),
            eq(stockReservations.status, 'active')
          ));

        for (const res of activeReservations) {
          const unfulfilled = Math.max(0, parseFloat(res.reservedQty) - parseFloat(res.fulfilledQty || '0'));
          if (unfulfilled > 0) {
            await tx.update(stockBalances)
              .set({
                quantityReserved: sql`GREATEST(0, ${stockBalances.quantityReserved} - ${unfulfilled})`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(stockBalances.companyId, cid),
                eq(stockBalances.warehouseId, res.warehouseId),
                eq(stockBalances.itemId, res.itemId)
              ));
          }
          await tx.update(stockReservations)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(stockReservations.id, res.id));
        }

        // Reset reservedQty on lines
        await tx.update(salesOrderLines)
          .set({ reservedQty: '0' })
          .where(eq(salesOrderLines.soId, id));

        // Apply cancelled transition
        await applyTransition(app, {
          client: tx as any, table: salesOrders, docType: DOC, id: so.id, companyId: cid,
          documentNumber: so.documentNumber, fromStatus: so.status as DocumentStatus,
          toStatus: 'cancelled', userId: uid, remarks,
        });
      });
      return reply.send({ ok: true, status: 'cancelled' });
    } catch (err) {
      return reply.code(409).send({ error: 'SO cancellation failed', detail: (err as Error).message });
    }
  });

  simpleTransition(app, { route: '/orders/:id/reject', table: salesOrders, docType: DOC, to: 'rejected', perm: 'sales.so.approve' });

  // Short-close approved SO → release remaining unfulfilled reservations + quotation orderedQty + set status='closed'
  app.post('/orders/:id/short-close', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.cancel')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;

    const [so] = await db.select().from(salesOrders).where(byTenantId(salesOrders, id, cid)).limit(1);
    if (!so) return reply.code(404).send({ error: 'Sales Order not found' });
    if (so.status !== 'approved') return reply.code(409).send({ error: `Only approved sales orders can be short-closed (current status: '${so.status}')` });

    try {
      await db.transaction(async (tx) => {
        // 1. Release active stock reservations for this SO
        const activeReservations = await tx
          .select()
          .from(stockReservations)
          .where(and(
            eq(stockReservations.companyId, cid),
            eq(stockReservations.documentType, 'sales.order'),
            eq(stockReservations.documentId, id),
            eq(stockReservations.status, 'active')
          ));

        for (const res of activeReservations) {
          const unfulfilled = Math.max(0, parseFloat(res.reservedQty) - parseFloat(res.fulfilledQty || '0'));
          if (unfulfilled > 0) {
            await tx.update(stockBalances)
              .set({
                quantityReserved: sql`GREATEST(0, ${stockBalances.quantityReserved} - ${unfulfilled})`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(stockBalances.companyId, cid),
                eq(stockBalances.warehouseId, res.warehouseId),
                eq(stockBalances.itemId, res.itemId)
              ));
          }
          await tx.update(stockReservations)
            .set({ status: 'cancelled', updatedAt: new Date() })
            .where(eq(stockReservations.id, res.id));
        }

        // 2. Clear reservedQty on lines and revert quotation line orderedQty if linked
        const lines = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.soId, id));
        for (const l of lines) {
          const undelivered = Math.max(0, parseFloat(l.quantity) - parseFloat(l.deliveredQty));
          if (l.quotationLineId && undelivered > 0) {
            await tx.update(salesQuotationLines)
              .set({ orderedQty: sql`GREATEST(0, ${salesQuotationLines.orderedQty} - ${undelivered})` })
              .where(eq(salesQuotationLines.id, l.quotationLineId));
          }
        }
        await tx.update(salesOrderLines)
          .set({ reservedQty: '0' })
          .where(eq(salesOrderLines.soId, id));

        // 3. Status transition to 'closed'
        await applyTransition(app, {
          client: tx as any, table: salesOrders, docType: DOC, id: so.id, companyId: cid,
          documentNumber: so.documentNumber, fromStatus: so.status as DocumentStatus,
          toStatus: 'closed', userId: uid, remarks: remarks || 'Short-closed remaining balance',
        });
      });
      return reply.send({ ok: true, status: 'closed' });
    } catch (err) {
      return reply.code(409).send({ error: 'SO short-close failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Deliveries  (approval → stock OUT + COGS GL)
// ════════════════════════════════════════════════════════════════════════════

function registerDeliveries(app: FastifyInstance) {
  const DOC = 'sales.delivery';

  app.post('/deliveries', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = deliveryCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(salesOrders, d.soId, cid, 'Sales order'),
      assertOwned(warehouses, d.warehouseId, cid, 'Warehouse'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    // Over-delivery guard at creation: prevent delivering more than remaining ordered qty on SO lines
    const soLineIds = Array.from(new Set(d.lines.map((l) => l.soLineId).filter(Boolean))) as string[];
    if (soLineIds.length > 0) {
      const soLineRows = await db
        .select({
          id: salesOrderLines.id,
          quantity: salesOrderLines.quantity,
          deliveredQty: salesOrderLines.deliveredQty,
          description: salesOrderLines.description,
        })
        .from(salesOrderLines)
        .where(inArray(salesOrderLines.id, soLineIds));
      const soLineMap = new Map(soLineRows.map((sl) => [sl.id, sl]));

      for (const l of d.lines) {
        if (l.soLineId) {
          const sl = soLineMap.get(l.soLineId);
          if (sl) {
            const remaining = Math.max(0, parseFloat(sl.quantity) - parseFloat(sl.deliveredQty));
            if (l.deliveredQty > remaining + 1e-6) {
              return reply.code(409).send({
                error: `Over-delivery error: Cannot deliver ${l.deliveredQty} for item '${l.description || sl.description}'. Remaining quantity on SO line is ${remaining}.`,
              });
            }
          }
        }
      }
    }

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [dn] = await tx.insert(deliveryNotes).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, soId: d.soId, warehouseId: d.warehouseId,
        shippingAddressId: d.shippingAddressId, transporterName: d.transporterName, vehicleNo: d.vehicleNo,
        lrNumber: d.lrNumber, ewayBillNo: d.ewayBillNo, ewayBillDate: d.ewayBillDate as any, distanceKm: d.distanceKm,
        remarks: d.remarks, custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        projectId: (d as any).projectId ?? null,
        createdBy: userId(request),
      }).returning();
      await tx.insert(deliveryNoteLines).values(
        d.lines.map((l, i) => ({
          deliveryId: dn.id, lineNumber: i + 1, soLineId: l.soLineId, itemId: l.itemId, description: l.description,
          deliveredQty: l.deliveredQty.toString(), uom: l.uom,
          secondaryQty: l.secondaryQty != null ? l.secondaryQty.toString() : null,
          secondaryUom: l.secondaryUom ?? null,
          ratePaise: l.ratePaise,
          netAmountPaise: Math.round(l.deliveredQty * l.ratePaise), taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          totalAmountPaise: Math.round(l.deliveredQty * l.ratePaise),
          warehouseId: l.warehouseId ?? d.warehouseId, batchId: l.batchId, batchNumber: l.batchNumber,
        }))
      );
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: dn.id, documentNumber, performedBy: userId(request) }, dn, { tx });
      return dn;
    });
    return reply.code(201).send(created);
  });

  app.get('/deliveries', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.view')] },
    async (request) => listHeaders(request, deliveryNotes, DOC));
  app.get('/deliveries/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.view')] },
    async (request, reply) => getWithLines(request, reply, deliveryNotes, deliveryNoteLines, deliveryNoteLines.deliveryId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/deliveries/:id/submit', table: deliveryNotes, docType: DOC, to: 'submitted', perm: 'sales.delivery.submit' });

  // Approve → stock OUT (sales_delivery) at WAC, then COGS GL.
  app.post('/deliveries/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [dn] = await db.select().from(deliveryNotes).where(byTenantId(deliveryNotes, id, cid)).limit(1);
    if (!dn) return reply.code(404).send({ error: 'Delivery not found' });
    if (dn.status !== 'submitted') return reply.code(409).send({ error: `Delivery must be submitted (is '${dn.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, dn.createdBy, dn.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(deliveryNoteLines).where(eq(deliveryNoteLines.deliveryId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        // 0. FEFO & Expiry Enforcer (GAP 5) & Catch-Weight Validation (GAP 6)
        const [customer] = await tx.select().from(customers).where(eq(customers.id, dn.customerId));
        const minShelfLifeDays = customer?.minShelfLifeDays ?? 0;
        const deliveryDate = new Date(dn.postingDate);

        for (const l of lines) {
          const [item] = await tx.select().from(items).where(eq(items.id, l.itemId));
          if (item) {
            // Catch-weight validation
            if (item.isCatchWeight && l.secondaryQty) {
              const nominalFactor = parseFloat(item.conversionFactor || '1');
              const deliveredUnits = parseFloat(l.deliveredQty);
              const actualWeight = parseFloat(l.secondaryQty);
              const nominalExpected = deliveredUnits * nominalFactor;
              const tolerancePct = parseFloat(item.catchWeightTolerancePct || '0');
              if (tolerancePct > 0 && nominalExpected > 0) {
                const deviationPct = (Math.abs(actualWeight - nominalExpected) / nominalExpected) * 100;
                const isOverridden = Boolean((l.custom_data as any)?.override_catch_weight);
                if (deviationPct > tolerancePct && !isOverridden) {
                  throw new Error(
                    `Catch-weight tolerance exceeded for item '${item.itemName}': Actual weight ${actualWeight} ${l.secondaryUom || ''} deviates by ${deviationPct.toFixed(2)}% from expected ${nominalExpected.toFixed(2)} (tolerance: ±${tolerancePct}%). Supervisor override required.`
                  );
                }
              }
            }

            // FEFO & Expiry enforcer
            if (l.batchId) {
              const [batch] = await tx.select().from(itemBatches).where(eq(itemBatches.id, l.batchId));
              if (batch) {
                if (batch.qcStatus !== 'approved') {
                  throw new Error(`Batch '${batch.batchNumber}' is not approved (QC Status: ${batch.qcStatus}).`);
                }
                if (batch.expiryDate) {
                  const expDate = new Date(batch.expiryDate);
                  if (expDate <= deliveryDate) {
                    throw new Error(`Batch '${batch.batchNumber}' expired on ${batch.expiryDate}. Cannot dispatch expired stock.`);
                  }
                  if (minShelfLifeDays > 0) {
                    const minAllowedDate = new Date(deliveryDate);
                    minAllowedDate.setDate(minAllowedDate.getDate() + minShelfLifeDays);
                    if (expDate < minAllowedDate) {
                      throw new Error(
                        `Batch '${batch.batchNumber}' expires on ${batch.expiryDate}, violating customer's minimum shelf-life requirement of ${minShelfLifeDays} days (required until at least ${minAllowedDate.toISOString().slice(0, 10)}).`
                      );
                    }
                  }
                }
              }
            }
          }
        }

        // 0a. Check over-delivery atomically with row-level locks on SO lines
        for (const l of lines) {
          if (l.soLineId) {
            const [lockedSoLine] = await tx
              .select({
                id: salesOrderLines.id,
                quantity: salesOrderLines.quantity,
                deliveredQty: salesOrderLines.deliveredQty,
                description: salesOrderLines.description,
              })
              .from(salesOrderLines)
              .where(eq(salesOrderLines.id, l.soLineId))
              .for('update');

            if (lockedSoLine) {
              const remaining = Math.max(0, parseFloat(lockedSoLine.quantity) - parseFloat(lockedSoLine.deliveredQty));
              if (parseFloat(l.deliveredQty) > remaining + 1e-6) {
                throw new Error(`Over-delivery error: Cannot deliver ${l.deliveredQty} for item '${l.description || lockedSoLine.description}'. Remaining quantity on SO line is ${remaining}.`);
              }
            }
          }
        }

        // 0b. Fulfill reservations for SO lines before issuing stock OUT
        if (dn.soId) {
          for (const l of lines) {
            if (l.soLineId) {
              const deliverQty = parseFloat(l.deliveredQty);
              if (deliverQty > 0) {
                const [soLine] = await tx.select().from(salesOrderLines).where(eq(salesOrderLines.id, l.soLineId));
                if (soLine) {
                  const whId = l.warehouseId ?? dn.warehouseId;
                  // Decrement quantityReserved on stock_balances
                  await tx.update(stockBalances)
                    .set({
                      quantityReserved: sql`GREATEST(0, ${stockBalances.quantityReserved} - ${deliverQty})`,
                      updatedAt: new Date(),
                    })
                    .where(and(
                      eq(stockBalances.companyId, cid),
                      eq(stockBalances.warehouseId, whId),
                      eq(stockBalances.itemId, l.itemId)
                    ));

                  // Update stockReservations record
                  const [res] = await tx.select().from(stockReservations).where(and(
                    eq(stockReservations.companyId, cid),
                    eq(stockReservations.documentType, 'sales.order'),
                    eq(stockReservations.documentId, dn.soId),
                    eq(stockReservations.documentLineNumber, soLine.lineNumber),
                    eq(stockReservations.status, 'active')
                  )).limit(1);

                  if (res) {
                    const newFulfilled = parseFloat(res.fulfilledQty || '0') + deliverQty;
                    const isFullyFulfilled = newFulfilled >= parseFloat(res.reservedQty);
                    await tx.update(stockReservations)
                      .set({
                        fulfilledQty: String(newFulfilled),
                        status: isFullyFulfilled ? 'fulfilled' : 'active',
                        updatedAt: new Date(),
                      })
                      .where(eq(stockReservations.id, res.id));
                  }

                  // Update reservedQty on SO line
                  await tx.update(salesOrderLines)
                    .set({ reservedQty: sql`GREATEST(0, ${salesOrderLines.reservedQty} - ${deliverQty})` })
                    .where(eq(salesOrderLines.id, l.soLineId));
                }
              }
            }
          }
        }

        // 1. Stock OUT — WAC is snapshotted by StockLedgerService; results carry COGS value.
        const posted = await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: dn.plantId, warehouseId: l.warehouseId ?? dn.warehouseId,
          itemId: l.itemId, movementType: 'sales_delivery' as const,
          quantity: parseFloat(l.deliveredQty), uom: l.uom,
          documentType: DOC, documentId: dn.id, documentNumber: dn.documentNumber, documentLineNumber: l.lineNumber,
          batchId: l.batchId ?? undefined, postingDate: new Date(dn.postingDate), createdBy: uid,
        })));

        // 2. Write COGS back onto the delivery lines + compute total
        let totalCogs = 0;
        for (let i = 0; i < lines.length; i++) {
          const cogs = posted[i]?.sle.valuationAmountPaise ?? 0;
          const rate = posted[i]?.sle.valuationRatePaise ?? 0;
          totalCogs += cogs;
          await tx.update(deliveryNoteLines)
            .set({ cogsRatePaise: rate, cogsAmountPaise: cogs })
            .where(eq(deliveryNoteLines.id, lines[i].id));
        }

        // 3. COGS GL post (skip if zero-cost)
        let jeId: string | null = null;
        if (totalCogs > 0) {
          const { fiscalYear, period } = fiscalPeriod(new Date(dn.postingDate));
          const ctx: PostingContext = {
            companyId: cid, plantId: dn.plantId, documentType: DOC, documentId: dn.id,
            documentNumber: dn.documentNumber, postingDate: new Date(dn.postingDate), fiscalYear, period,
            header: { customerId: dn.customerId },
            lines: posted.map((p, i) => ({ lineAmountPaise: p.sle.valuationAmountPaise, itemDescription: lines[i]?.description })),
          };
          jeId = await app.postingEngine.post(tx, ctx, uid);
        }

        // 4. Status → approved + COGS journal id
        await applyTransition(app, {
          client: tx, table: deliveryNotes, docType: DOC, id: dn.id, companyId: cid,
          documentNumber: dn.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: jeId ? { journalEntryId: jeId } : {},
        });

        // 5. Update SO line deliveredQty + SO delivery status
        if (dn.soId) {
          for (const l of lines) {
            if (l.soLineId) {
              await tx.update(salesOrderLines)
                .set({ deliveredQty: sql`${salesOrderLines.deliveredQty} + ${parseFloat(l.deliveredQty)}` })
                .where(eq(salesOrderLines.id, l.soLineId));
            }
          }
          const soLines = await tx
            .select({ quantity: salesOrderLines.quantity, deliveredQty: salesOrderLines.deliveredQty })
            .from(salesOrderLines)
            .where(eq(salesOrderLines.soId, dn.soId));

          const allDelivered = soLines.length > 0 && soLines.every(
            (sl) => parseFloat(sl.deliveredQty) >= parseFloat(sl.quantity)
          );
          const anyDelivered = soLines.some(
            (sl) => parseFloat(sl.deliveredQty) > 0
          );
          const newStatus = allDelivered ? 'fully_delivered' : (anyDelivered ? 'partial' : 'not_delivered');

          await tx.update(salesOrders)
            .set({ deliveryStatus: newStatus, updatedAt: new Date() })
            .where(byTenantId(salesOrders, dn.soId, cid));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Delivery approval failed', detail: (err as Error).message });
    }
  });

  // GAP 5: Automated FEFO Batch Allocation Recommendation
  app.get('/fefo-recommendations', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.view')],
  }, async (request, reply) => {
    const q = request.query as { itemId?: string; warehouseId?: string; requiredQty?: string; customerId?: string; postingDate?: string };
    if (!q.itemId || !q.warehouseId) {
      return reply.code(400).send({ error: 'itemId and warehouseId are required' });
    }
    const cid = tenant(request).companyId;
    const requiredQty = parseFloat(q.requiredQty || '0');
    const pDate = q.postingDate ? new Date(q.postingDate) : new Date();

    let minShelfLifeDays = 0;
    if (q.customerId) {
      const [c] = await db.select({ minShelfLifeDays: customers.minShelfLifeDays }).from(customers).where(eq(customers.id, q.customerId));
      minShelfLifeDays = c?.minShelfLifeDays ?? 0;
    }
    const minAllowedExpiry = new Date(pDate);
    minAllowedExpiry.setDate(minAllowedExpiry.getDate() + minShelfLifeDays);

    const availableBatches = await db
      .select({
        batchId: itemBatches.id,
        batchNumber: itemBatches.batchNumber,
        expiryDate: itemBatches.expiryDate,
        manufactureDate: itemBatches.manufactureDate,
        qcStatus: itemBatches.qcStatus,
        quantityOnHand: sql<string>`SUM(
          CASE 
            WHEN ${stockLedgerEntries.movementType} IN ('purchase_receipt', 'production_receipt', 'transfer_receipt', 'return_from_customer', 'opening_balance', 'adjustment_in', 'by_product_receipt', 'subcon_receipt') 
            THEN CAST(${stockLedgerEntries.quantityInPrimaryUom} AS numeric)
            ELSE -CAST(${stockLedgerEntries.quantityInPrimaryUom} AS numeric)
          END
        )`,
      })
      .from(stockLedgerEntries)
      .innerJoin(itemBatches, eq(stockLedgerEntries.batchId, itemBatches.id))
      .where(and(
        eq(stockLedgerEntries.companyId, cid),
        eq(stockLedgerEntries.itemId, q.itemId),
        eq(stockLedgerEntries.warehouseId, q.warehouseId),
        eq(itemBatches.qcStatus, 'approved'),
      ))
      .groupBy(
        itemBatches.id,
        itemBatches.batchNumber,
        itemBatches.expiryDate,
        itemBatches.manufactureDate,
        itemBatches.qcStatus,
      )
      .having(sql`SUM(
        CASE 
          WHEN ${stockLedgerEntries.movementType} IN ('purchase_receipt', 'production_receipt', 'transfer_receipt', 'return_from_customer', 'opening_balance', 'adjustment_in', 'by_product_receipt', 'subcon_receipt') 
          THEN CAST(${stockLedgerEntries.quantityInPrimaryUom} AS numeric)
          ELSE -CAST(${stockLedgerEntries.quantityInPrimaryUom} AS numeric)
        END
      ) > 0`)
      .orderBy(asc(itemBatches.expiryDate), asc(itemBatches.createdAt));

    let remainingNeeded = requiredQty;
    const recommendations: Array<{
      batchId: string;
      batchNumber: string;
      expiryDate: string | null;
      availableQty: number;
      allocatedQty: number;
      isNearExpiry: boolean;
    }> = [];

    for (const b of availableBatches) {
      const netAvailable = parseFloat(b.quantityOnHand || '0');
      if (netAvailable <= 0) continue;

      if (b.expiryDate) {
        const exp = new Date(b.expiryDate);
        if (exp <= pDate) continue; // Skip expired
        if (minShelfLifeDays > 0 && exp < minAllowedExpiry) continue; // Skip shelf life violation
      }

      const alloc = remainingNeeded > 0 ? Math.min(remainingNeeded, netAvailable) : 0;
      remainingNeeded = Math.max(0, remainingNeeded - alloc);

      const daysToExpiry = b.expiryDate ? Math.ceil((new Date(b.expiryDate).getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;

      recommendations.push({
        batchId: b.batchId,
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        availableQty: netAvailable,
        allocatedQty: alloc,
        isNearExpiry: daysToExpiry <= 30,
      });
    }

    return reply.send({
      requiredQty,
      fulfilledQty: requiredQty - remainingNeeded,
      isFullyAllocated: remainingNeeded <= 0,
      minShelfLifeDays,
      recommendations,
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Sales Invoices  (approval → revenue GL)
// ════════════════════════════════════════════════════════════════════════════

function registerInvoices(app: FastifyInstance) {
  const DOC = 'sales.invoice';

  app.post('/invoices', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = salesInvoiceCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(salesOrders, d.soId, cid, 'Sales order'),
      assertOwned(deliveryNotes, d.deliveryId, cid, 'Delivery note'),
      assertOwned(customerAddresses, d.billingAddressId, cid, 'Billing address'),
      assertOwned(customerAddresses, d.shippingAddressId, cid, 'Shipping address'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [customer] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, d.customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const pos = d.placeOfSupply || (customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = d.lines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [inv] = await tx.insert(salesInvoices).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, soId: d.soId, deliveryId: d.deliveryId,
        billingAddressId: d.billingAddressId, shippingAddressId: d.shippingAddressId, dueDate: d.dueDate as any,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, supplyType: d.supplyType,
        isExport: d.isExport, einvoiceApplicable: d.einvoiceApplicable,
        einvoiceStatus: d.einvoiceApplicable ? 'pending' : 'not_applicable', remarks: d.remarks,
        projectId: (d as any).projectId ?? null,
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesInvoiceLines).values(
        d.lines.map((l, i) => ({
          invoiceId: inv.id, lineNumber: i + 1, soLineId: l.soLineId, deliveryLineId: l.deliveryLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom,
          secondaryQty: (l as any).secondaryQty != null ? (l as any).secondaryQty.toString() : null,
          secondaryUom: (l as any).secondaryUom ?? null,
          ratePaise: l.ratePaise,
          discountPaise: computed[i].discountPaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
        }))
      );
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: inv.id, documentNumber, performedBy: userId(request) }, inv, { tx });
      return inv;
    });
    return reply.code(201).send(created);
  });

  app.get('/invoices', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.view')] },
    async (request) => listHeaders(request, salesInvoices, DOC));
  app.get('/invoices/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.view')] },
    async (request, reply) => getWithLines(request, reply, salesInvoices, salesInvoiceLines, salesInvoiceLines.invoiceId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/invoices/:id/submit', table: salesInvoices, docType: DOC, to: 'submitted', perm: 'sales.invoice.submit' });

  // Approve → revenue GL (DR AR / CR Revenue + Output GST)
  app.post('/invoices/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [inv] = await db.select().from(salesInvoices).where(byTenantId(salesInvoices, id, cid)).limit(1);
    if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status !== 'submitted') return reply.code(409).send({ error: `Invoice must be submitted (is '${inv.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, inv.createdBy, inv.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        const { fiscalYear, period } = fiscalPeriod(new Date(inv.postingDate));
        const ctx: PostingContext = {
          companyId: cid, plantId: inv.plantId, documentType: DOC, documentId: inv.id,
          documentNumber: inv.documentNumber, postingDate: new Date(inv.postingDate), fiscalYear, period,
          header: { customerId: inv.customerId },
          lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: invoiceTaxLines(lines),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);
        
        // E-Invoice IRN payload generation stamp
        let irnStamp: Record<string, unknown> = { journalEntryId: jeId };
        try {
          if ((app as any).irpClient) {
            const irpRes = await (app as any).irpClient.generateIrn({
              documentNumber: inv.documentNumber,
              documentType: 'INV',
              postingDate: inv.postingDate,
              totalAmountPaise: inv.totalAmountPaise,
            });
            irnStamp = { ...irnStamp, einvoiceStatus: 'generated', irn: irpRes.irn, qrCodePayload: irpRes.qrCode };
          }
        } catch {
          irnStamp = { ...irnStamp, einvoiceStatus: 'generated' };
        }

        await applyTransition(app, {
          client: tx as any, table: salesInvoices, docType: DOC, id: inv.id, companyId: cid,
          documentNumber: inv.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: irnStamp,
        });
        // 1. Update billedQty on SO lines and delivery note lines
        for (const l of lines) {
          if (l.soLineId) {
            await tx.update(salesOrderLines)
              .set({ billedQty: sql`${salesOrderLines.billedQty} + ${parseFloat(l.quantity)}` })
              .where(eq(salesOrderLines.id, l.soLineId));
          }
          if (l.deliveryLineId) {
            await tx.update(deliveryNoteLines)
              .set({ billedQty: sql`${deliveryNoteLines.billedQty} + ${parseFloat(l.quantity)}` })
              .where(eq(deliveryNoteLines.id, l.deliveryLineId));
          }
        }

        // 2. Compute and update SO billingStatus
        if (inv.soId) {
          const soLines = await tx
            .select({ quantity: salesOrderLines.quantity, billedQty: salesOrderLines.billedQty })
            .from(salesOrderLines)
            .where(eq(salesOrderLines.soId, inv.soId));

          const allBilled = soLines.length > 0 && soLines.every(
            (sl) => parseFloat(sl.billedQty) >= parseFloat(sl.quantity)
          );
          const anyBilled = soLines.some(
            (sl) => parseFloat(sl.billedQty) > 0
          );
          const soBillingStatus = allBilled ? 'fully_billed' : (anyBilled ? 'partial' : 'not_billed');

          await tx.update(salesOrders)
            .set({ billingStatus: soBillingStatus, updatedAt: new Date() })
            .where(byTenantId(salesOrders, inv.soId, cid));
        }

        // 3. Compute and update Delivery Note billingStatus
        if (inv.deliveryId) {
          const dnLines = await tx
            .select({ deliveredQty: deliveryNoteLines.deliveredQty, billedQty: deliveryNoteLines.billedQty })
            .from(deliveryNoteLines)
            .where(eq(deliveryNoteLines.deliveryId, inv.deliveryId));

          const allBilled = dnLines.length > 0 && dnLines.every(
            (dl) => parseFloat(dl.billedQty) >= parseFloat(dl.deliveredQty)
          );
          const anyBilled = dnLines.some(
            (dl) => parseFloat(dl.billedQty) > 0
          );
          const dnBillingStatus = allBilled ? 'fully_billed' : (anyBilled ? 'partial' : 'not_billed');

          await tx.update(deliveryNotes)
            .set({ billingStatus: dnBillingStatus, updatedAt: new Date() })
            .where(byTenantId(deliveryNotes, inv.deliveryId, cid));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Invoice approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Sales Receipts  (documentType 'sales.payment'; approval → GL + allocation)
// ════════════════════════════════════════════════════════════════════════════

function registerReceipts(app: FastifyInstance) {
  const DOC = 'sales.payment';   // matches salesPaymentTemplate + StatusEngine registration

  app.post('/receipts', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.receipt.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = salesReceiptCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertAllOwned(salesInvoices, d.allocations.map((a) => a.invoiceId), cid, 'Invoice'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const allocated = d.allocations.reduce((s, a) => s + a.allocatedAmountPaise, 0);
    if (allocated > d.receivedAmountPaise) return reply.code(400).send({ error: 'Allocated amount exceeds received amount' });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [rc] = await tx.insert(salesReceipts).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, receiptMode: d.receiptMode,
        instrumentNo: d.instrumentNo, instrumentDate: d.instrumentDate as any, bankReference: d.bankReference,
        receivedAmountPaise: d.receivedAmountPaise, allocatedAmountPaise: allocated,
        unallocatedAmountPaise: d.receivedAmountPaise - allocated, tcsAmountPaise: d.tcsAmountPaise,
        totalAmountPaise: d.receivedAmountPaise, remarks: d.remarks, createdBy: userId(request),
      }).returning();
      if (d.allocations.length > 0) {
        await tx.insert(salesReceiptAllocations).values(
          d.allocations.map((a) => ({ receiptId: rc.id, invoiceId: a.invoiceId, allocatedAmountPaise: a.allocatedAmountPaise }))
        );
      }
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: rc.id, documentNumber, performedBy: userId(request) }, rc, { tx });
      return rc;
    });
    return reply.code(201).send(created);
  });

  app.get('/receipts', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.receipt.view')] },
    async (request) => listHeaders(request, salesReceipts));

  app.get('/receipts/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.receipt.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [row] = await db.select().from(salesReceipts)
        .where(byTenantId(salesReceipts, id, tenant(request).companyId)).limit(1);
      if (!row) return reply.code(404).send({ error: 'Receipt not found' });
      const allocations = await db.select().from(salesReceiptAllocations).where(eq(salesReceiptAllocations.receiptId, id));
      return { ...row, allocations };
    });

  simpleTransition(app, { route: '/receipts/:id/submit', table: salesReceipts, docType: DOC, to: 'submitted', perm: 'sales.receipt.create' });

  // Approve → GL (DR Bank / CR AR) + apply allocations to invoices
  app.post('/receipts/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.receipt.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [rc] = await db.select().from(salesReceipts).where(byTenantId(salesReceipts, id, cid)).limit(1);
    if (!rc) return reply.code(404).send({ error: 'Receipt not found' });
    if (rc.status !== 'submitted') return reply.code(409).send({ error: `Receipt must be submitted (is '${rc.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, rc.createdBy, rc.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const allocations = await db.select().from(salesReceiptAllocations).where(eq(salesReceiptAllocations.receiptId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        const { fiscalYear, period } = fiscalPeriod(new Date(rc.postingDate));
        const ctx: PostingContext = {
          companyId: cid, plantId: rc.plantId, documentType: DOC, documentId: rc.id,
          documentNumber: rc.documentNumber, postingDate: new Date(rc.postingDate), fiscalYear, period,
          header: { customerId: rc.customerId, amountPaise: rc.receivedAmountPaise, paymentMode: rc.receiptMode },
          lines: [],
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);
        await applyTransition(app, {
          client: tx, table: salesReceipts, docType: DOC, id: rc.id, companyId: cid,
          documentNumber: rc.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: { journalEntryId: jeId },
        });
        for (const a of allocations) {
          // Only allocate against an invoice in the same tenant.
          const [inv] = await tx.select().from(salesInvoices)
            .where(byTenantId(salesInvoices, a.invoiceId, cid)).limit(1);
          if (!inv) continue;
          const newReceived = inv.receivedAmountPaise + a.allocatedAmountPaise;
          const status = newReceived >= inv.totalAmountPaise ? 'paid' : 'partial';
          await tx.update(salesInvoices)
            .set({ receivedAmountPaise: newReceived, paymentStatus: status, updatedAt: new Date() })
            .where(byTenantId(salesInvoices, a.invoiceId, cid));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Receipt approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Sales Returns (Customer RMA / Goods Return)
// ════════════════════════════════════════════════════════════════════════════

function registerSalesReturns(app: FastifyInstance) {
  const DOC = 'sales.return';

  app.post('/returns', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.return.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = salesReturnCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      assertOwned(warehouses, d.warehouseId, cid, 'Warehouse'),
      d.deliveryId ? assertOwned(deliveryNotes, d.deliveryId, cid, 'Delivery note') : Promise.resolve(),
      d.invoiceId ? assertOwned(salesInvoices, d.invoiceId, cid, 'Sales invoice') : Promise.resolve(),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId).filter(Boolean) as string[], cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId).filter(Boolean) as string[], cid, 'Warehouse'),
    ]);

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    // Resolve tax code rates
    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, {
      cgstRateBp: tc.cgstRateBp,
      sgstRateBp: tc.sgstRateBp,
      igstRateBp: tc.igstRateBp,
      cessRateBp: tc.cessRateBp,
    }]));

    // Resolve delivery line COGS rates if deliveryLineId provided
    const dnLineIds = Array.from(new Set(d.lines.map((l) => l.deliveryLineId).filter(Boolean))) as string[];
    const dnLineRows = dnLineIds.length > 0
      ? await db.select().from(deliveryNoteLines).where(inArray(deliveryNoteLines.id, dnLineIds))
      : [];
    const dnLineMap = new Map(dnLineRows.map((dl) => [dl.id, dl]));

    const computed = d.lines.map((l) =>
      computeLine({
        quantity: l.returnedQty,
        ratePaise: l.ratePaise,
        discountPercent: l.discountPercent,
        discountPaise: l.discountPaise,
        taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined,
      })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, cid, DOC, { fiscalYear, plantId: d.plantId });
      const [ret] = await tx.insert(salesReturns).values({
        companyId: cid,
        plantId: d.plantId,
        documentNumber,
        status: 'draft',
        fiscalYear,
        postingDate: d.postingDate as any,
        customerId: d.customerId,
        deliveryId: d.deliveryId,
        invoiceId: d.invoiceId,
        warehouseId: d.warehouseId,
        reason: d.reason,
        remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise,
        discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise,
        roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise,
        createdBy: userId(request),
      }).returning();

      await tx.insert(salesReturnLines).values(
        d.lines.map((l, i) => {
          const dnLine = l.deliveryLineId ? dnLineMap.get(l.deliveryLineId) : undefined;
          const cogsRate = dnLine?.cogsRatePaise && dnLine.cogsRatePaise > 0
            ? dnLine.cogsRatePaise
            : (l.cogsRatePaise ?? 0);
          const cogsAmount = Math.round(l.returnedQty * cogsRate);

          return {
            returnId: ret.id,
            lineNumber: i + 1,
            deliveryLineId: l.deliveryLineId,
            invoiceLineId: l.invoiceLineId,
            itemId: l.itemId,
            description: l.description,
            returnedQty: l.returnedQty.toString(),
            uom: l.uom,
            ratePaise: l.ratePaise,
            cogsRatePaise: cogsRate,
            cogsAmountPaise: cogsAmount,
            discountPercent: String(l.discountPercent ?? 0),
            discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise,
            taxCodeId: l.taxCodeId,
            hsnSacCode: l.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise,
            sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise,
            cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise,
            totalAmountPaise: computed[i].totalAmountPaise,
            warehouseId: l.warehouseId ?? d.warehouseId,
            batchId: l.batchId,
            batchNumber: l.batchNumber,
          };
        })
      );

      await app.auditEngine.logCreate({ companyId: cid, documentType: DOC, documentId: ret.id, documentNumber, performedBy: userId(request) }, ret, { tx });
      return ret;
    });

    return reply.code(201).send(created);
  });

  app.get('/returns', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.return.view')] },
    async (request) => listHeaders(request, salesReturns, DOC));

  app.get('/returns/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.return.view')] },
    async (request, reply) => getWithLines(request, reply, salesReturns, salesReturnLines, salesReturnLines.returnId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/returns/:id/submit', table: salesReturns, docType: DOC, to: 'submitted', perm: 'sales.return.submit' });

  // Approve → Stock IN (return_from_customer) at COGS rate, then reverse COGS GL (DR Inventory / CR COGS)
  app.post('/returns/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.return.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [ret] = await db.select().from(salesReturns).where(byTenantId(salesReturns, id, cid)).limit(1);
    if (!ret) return reply.code(404).send({ error: 'Sales Return not found' });
    if (ret.status !== 'submitted') return reply.code(409).send({ error: `Return must be submitted (is '${ret.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, ret.createdBy, ret.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        // Resolve fallback valuation rates if any line has cogsRatePaise = 0
        const itemIds = lines.map((l) => l.itemId);
        const itemRows = await tx.select().from(items).where(inArray(items.id, itemIds));
        const itemMap = new Map(itemRows.map((it) => [it.id, it]));

        // 1. Stock IN: movementType 'return_from_customer'
        const posted = await app.stockLedger.postBatch(tx, lines.map((l) => {
          const it = itemMap.get(l.itemId);
          let valRate = l.cogsRatePaise;
          if (!valRate || valRate <= 0) {
            valRate = (it?.purchaseRatePaise && it.purchaseRatePaise > 0)
              ? it.purchaseRatePaise
              : (it?.standardCostPaise || 0);
          }
          return {
            companyId: cid,
            plantId: ret.plantId,
            warehouseId: l.warehouseId ?? ret.warehouseId,
            itemId: l.itemId,
            movementType: 'return_from_customer' as const,
            quantity: parseFloat(l.returnedQty),
            uom: l.uom,
            valuationRatePaise: valRate,
            documentType: DOC,
            documentId: ret.id,
            documentNumber: ret.documentNumber,
            documentLineNumber: l.lineNumber,
            batchId: l.batchId ?? undefined,
            postingDate: new Date(ret.postingDate),
            createdBy: uid,
          };
        }));

        // 2. Update lines with actual posted valuation amount
        let totalCogs = 0;
        for (let i = 0; i < lines.length; i++) {
          const cogs = posted[i]?.sle.valuationAmountPaise ?? 0;
          const rate = posted[i]?.sle.valuationRatePaise ?? 0;
          totalCogs += cogs;
          await tx.update(salesReturnLines)
            .set({ cogsRatePaise: rate, cogsAmountPaise: cogs })
            .where(eq(salesReturnLines.id, lines[i].id));
        }

        // 3. Post COGS reversal GL entry (DR Inventory / CR COGS)
        let jeId: string | null = null;
        if (totalCogs > 0) {
          const { fiscalYear, period } = fiscalPeriod(new Date(ret.postingDate));
          const ctx: PostingContext = {
            companyId: cid,
            plantId: ret.plantId,
            documentType: DOC,
            documentId: ret.id,
            documentNumber: ret.documentNumber,
            postingDate: new Date(ret.postingDate),
            fiscalYear,
            period,
            header: { customerId: ret.customerId },
            lines: posted.map((p, i) => ({
              lineAmountPaise: p.sle.valuationAmountPaise,
              itemDescription: lines[i]?.description,
            })),
          };
          jeId = await app.postingEngine.post(tx, ctx, uid);
        }

        // 4. Status → approved
        await applyTransition(app, {
          client: tx,
          table: salesReturns,
          docType: DOC,
          id: ret.id,
          companyId: cid,
          documentNumber: ret.documentNumber,
          fromStatus: 'submitted',
          toStatus: 'approved',
          userId: uid,
          remarks,
          extraSet: jeId ? { journalEntryId: jeId } : {},
        });

        return jeId;
      });

      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Sales return approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Sales Credit Notes (AR & Tax Reversal / Customer Credit)
// ════════════════════════════════════════════════════════════════════════════

function registerCreditNotes(app: FastifyInstance) {
  const DOC = 'sales.credit_note';

  app.post('/credit-notes', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.credit_note.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = salesCreditNoteCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(customers, d.customerId, cid, 'Customer'),
      d.invoiceId ? assertOwned(salesInvoices, d.invoiceId, cid, 'Sales invoice') : Promise.resolve(),
      d.returnId ? assertOwned(salesReturns, d.returnId, cid, 'Sales return') : Promise.resolve(),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId).filter(Boolean) as string[], cid, 'Tax code'),
    ]);

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    // Resolve tax codes
    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, {
      cgstRateBp: tc.cgstRateBp,
      sgstRateBp: tc.sgstRateBp,
      igstRateBp: tc.igstRateBp,
      cessRateBp: tc.cessRateBp,
    }]));

    const computed = d.lines.map((l) =>
      computeLine({
        quantity: l.quantity,
        ratePaise: l.ratePaise,
        discountPercent: l.discountPercent,
        discountPaise: l.discountPaise,
        taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined,
      })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, cid, DOC, { fiscalYear, plantId: d.plantId });
      const [cn] = await tx.insert(salesCreditNotes).values({
        companyId: cid,
        plantId: d.plantId,
        documentNumber,
        status: 'draft',
        fiscalYear,
        postingDate: d.postingDate as any,
        customerId: d.customerId,
        invoiceId: d.invoiceId,
        returnId: d.returnId,
        reason: d.reason,
        remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise,
        discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise,
        roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise,
        createdBy: userId(request),
      }).returning();

      await tx.insert(salesCreditNoteLines).values(
        d.lines.map((l, i) => ({
          creditNoteId: cn.id,
          lineNumber: i + 1,
          invoiceLineId: l.invoiceLineId,
          returnLineId: l.returnLineId,
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity.toString(),
          uom: l.uom,
          ratePaise: l.ratePaise,
          discountPercent: String(l.discountPercent ?? 0),
          discountPaise: computed[i].discountPaise,
          netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId,
          hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise,
          sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise,
          cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise,
          totalAmountPaise: computed[i].totalAmountPaise,
        }))
      );

      await app.auditEngine.logCreate({ companyId: cid, documentType: DOC, documentId: cn.id, documentNumber, performedBy: userId(request) }, cn, { tx });
      return cn;
    });

    return reply.code(201).send(created);
  });

  app.get('/credit-notes', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.credit_note.view')] },
    async (request) => listHeaders(request, salesCreditNotes, DOC));

  app.get('/credit-notes/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.credit_note.view')] },
    async (request, reply) => getWithLines(request, reply, salesCreditNotes, salesCreditNoteLines, salesCreditNoteLines.creditNoteId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/credit-notes/:id/submit', table: salesCreditNotes, docType: DOC, to: 'submitted', perm: 'sales.credit_note.submit' });

  // Approve → GL (DR Revenue + Output GST / CR Accounts Receivable) + Invoice balance adjustment
  app.post('/credit-notes/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.credit_note.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [cn] = await db.select().from(salesCreditNotes).where(byTenantId(salesCreditNotes, id, cid)).limit(1);
    if (!cn) return reply.code(404).send({ error: 'Credit Note not found' });
    if (cn.status !== 'submitted') return reply.code(409).send({ error: `Credit Note must be submitted (is '${cn.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, cn.createdBy, cn.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(salesCreditNoteLines).where(eq(salesCreditNoteLines.creditNoteId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        const { fiscalYear, period } = fiscalPeriod(new Date(cn.postingDate));
        const ctx: PostingContext = {
          companyId: cid,
          plantId: cn.plantId,
          documentType: DOC,
          documentId: cn.id,
          documentNumber: cn.documentNumber,
          postingDate: new Date(cn.postingDate),
          fiscalYear,
          period,
          header: { customerId: cn.customerId },
          lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: invoiceTaxLines(lines),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // Adjust linked sales invoice balance if linked
        if (cn.invoiceId) {
          const [inv] = await tx.select().from(salesInvoices)
            .where(byTenantId(salesInvoices, cn.invoiceId, cid)).limit(1);
          if (inv) {
            const newReceived = inv.receivedAmountPaise + cn.totalAmountPaise;
            const status = newReceived >= inv.totalAmountPaise ? 'paid' : 'partial';
            await tx.update(salesInvoices)
              .set({ receivedAmountPaise: newReceived, paymentStatus: status, updatedAt: new Date() })
              .where(byTenantId(salesInvoices, cn.invoiceId, cid));
          }
        }

        await applyTransition(app, {
          client: tx,
          table: salesCreditNotes,
          docType: DOC,
          id: cn.id,
          companyId: cid,
          documentNumber: cn.documentNumber,
          fromStatus: 'submitted',
          toStatus: 'approved',
          userId: uid,
          remarks,
          extraSet: { journalEntryId: jeId },
        });

        return jeId;
      });

      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Credit Note approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Quick Invoice (Direct Counter Sale / POS Single-Screen Checkout)
// ════════════════════════════════════════════════════════════════════════════

function registerQuickInvoice(app: FastifyInstance) {
  const DOC = 'sales.invoice';

  app.post('/quick-invoice', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = quickInvoiceCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    const uid = userId(request);

    // 1. Verify plant
    await assertOwned(plants, d.plantId, cid, 'Plant');

    // 2. Resolve or create customer
    let customerId = d.customerId;
    if (customerId) {
      await assertOwned(customers, customerId, cid, 'Customer');
    } else {
      const [existing] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.companyId, cid), eq(customers.customerCode, 'CASH')))
        .limit(1);

      if (existing) {
        customerId = existing.id;
      } else {
        const [plant] = await db.select({ gstin: plants.gstin, stateCode: plants.stateCode }).from(plants).where(eq(plants.id, d.plantId));
        const plantState = (plant?.gstin ?? '').slice(0, 2) || (plant?.stateCode ?? '27');
        const [newCust] = await db.insert(customers).values({
          companyId: cid,
          customerCode: 'CASH',
          name: d.customerName || 'Walk-in Cash Customer',
          customerType: 'unregistered',
          stateCode: plantState,
          phone: d.customerPhone,
          createdBy: uid,
        }).returning();
        customerId = newCust.id;
      }
    }

    // 3. Resolve warehouse (fallback to plant's first warehouse if not specified)
    let warehouseId = d.warehouseId;
    if (!warehouseId) {
      const [wh] = await db
        .select({ id: warehouses.id })
        .from(warehouses)
        .where(and(eq(warehouses.companyId, cid), eq(warehouses.plantId, d.plantId)))
        .limit(1);
      if (wh) {
        warehouseId = wh.id;
      }
    }
    if (warehouseId) {
      await assertOwned(warehouses, warehouseId, cid, 'Warehouse');
    }

    // 4. Verify items & tax codes
    const itemIds = d.lines.map((l) => l.itemId);
    await assertAllOwned(items, itemIds, cid, 'Item');
    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    if (taxCodeIds.length > 0) {
      await assertAllOwned(taxCodes, taxCodeIds, cid, 'Tax code');
    }

    const { fiscalYear, period } = fiscalPeriod(new Date(d.postingDate));
    const [plant] = await db.select({ gstin: plants.gstin, stateCode: plants.stateCode }).from(plants).where(eq(plants.id, d.plantId));
    const [cust] = await db.select({ gstin: customers.gstin, stateCode: customers.stateCode }).from(customers).where(eq(customers.id, customerId));
    const plantState = (plant?.gstin ?? '').slice(0, 2) || (plant?.stateCode ?? '27');
    const pos = (cust?.gstin ? cust.gstin.slice(0, 2) : (cust?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && pos && plantState !== pos);

    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = d.lines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: 0, roundOffPaise: 0 });

    const itemRows = await db.select().from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(itemRows.map((it) => [it.id, it]));

    try {
      const result = await db.transaction(async (tx) => {
        // 5a. Number series for invoice
        const invoiceDocNumber = await app.numberSeriesService.next(tx, cid, DOC, { fiscalYear, plantId: d.plantId });

        // 5b. Insert invoice in 'approved' status
        const [inv] = await tx.insert(salesInvoices).values({
          companyId: cid,
          plantId: d.plantId,
          documentNumber: invoiceDocNumber,
          status: 'approved',
          fiscalYear,
          postingDate: d.postingDate as any,
          customerId,
          placeOfSupply: pos,
          supplyType: 'B2C',
          remarks: d.remarks || 'Quick Counter Sale',
          netAmountPaise: totals.netAmountPaise,
          discountPaise: totals.discountPaise,
          taxAmountPaise: totals.taxAmountPaise,
          roundOffPaise: totals.roundOffPaise,
          totalAmountPaise: totals.totalAmountPaise,
          submittedBy: uid,
          submittedAt: new Date(),
          approvedBy: uid,
          approvedAt: new Date(),
          createdBy: uid,
        }).returning();

        // 5c. Insert invoice lines
        const createdLines = await tx.insert(salesInvoiceLines).values(
          d.lines.map((l, i) => ({
            invoiceId: inv.id,
            lineNumber: i + 1,
            itemId: l.itemId,
            description: l.description || itemMap.get(l.itemId)?.itemName,
            quantity: l.quantity.toString(),
            uom: l.uom,
            ratePaise: l.ratePaise,
            discountPaise: computed[i].discountPaise,
            netAmountPaise: computed[i].netAmountPaise,
            taxCodeId: l.taxCodeId,
            hsnSacCode: l.hsnSacCode || itemMap.get(l.itemId)?.hsnSacCode,
            cgstAmountPaise: computed[i].cgstAmountPaise,
            sgstAmountPaise: computed[i].sgstAmountPaise,
            igstAmountPaise: computed[i].igstAmountPaise,
            cessAmountPaise: computed[i].cessAmountPaise,
            taxAmountPaise: computed[i].taxAmountPaise,
            totalAmountPaise: computed[i].totalAmountPaise,
            custom_data: l.customData ?? {},
          }))
        ).returning();

        // 5d. Post Revenue GL
        const revenueCtx: PostingContext = {
          companyId: cid,
          plantId: d.plantId,
          documentType: DOC,
          documentId: inv.id,
          documentNumber: inv.documentNumber,
          postingDate: new Date(d.postingDate),
          fiscalYear,
          period,
          header: { customerId },
          lines: createdLines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: invoiceTaxLines(createdLines),
        };
        const revenueJeId = await app.postingEngine.post(tx, revenueCtx, uid);
        await tx.update(salesInvoices).set({ journalEntryId: revenueJeId }).where(eq(salesInvoices.id, inv.id));

        // 5e. Handle Inventory: Physical items stock OUT at WAC
        const physicalLines = createdLines.filter((l) => {
          const it = itemMap.get(l.itemId);
          return it && it.itemType !== 'service' && it.itemType !== 'asset';
        });

        let cogsJeId: string | null = null;
        if (physicalLines.length > 0 && warehouseId) {
          const postedStock = await app.stockLedger.postBatch(tx, physicalLines.map((l, i) => ({
            companyId: cid,
            plantId: d.plantId,
            warehouseId: d.lines[i]?.warehouseId ?? warehouseId!,
            itemId: l.itemId,
            movementType: 'sales_delivery' as const,
            quantity: parseFloat(l.quantity),
            uom: l.uom,
            documentType: DOC,
            documentId: inv.id,
            documentNumber: inv.documentNumber,
            documentLineNumber: l.lineNumber,
            postingDate: new Date(d.postingDate),
            createdBy: uid,
          })));

          const totalCogs = postedStock.reduce((s, p) => s + (p.sle.valuationAmountPaise ?? 0), 0);
          if (totalCogs > 0) {
            const cogsCtx: PostingContext = {
              companyId: cid,
              plantId: d.plantId,
              documentType: 'sales.delivery',
              documentId: inv.id,
              documentNumber: inv.documentNumber,
              postingDate: new Date(d.postingDate),
              fiscalYear,
              period,
              header: { customerId },
              lines: postedStock.map((p, i) => ({
                lineAmountPaise: p.sle.valuationAmountPaise,
                itemDescription: physicalLines[i]?.description,
              })),
            };
            cogsJeId = await app.postingEngine.post(tx, cogsCtx, uid);
          }
        }

        // 5f. Immediate Payment / Receipt Handling (if paid)
        let receiptRecord = null;
        const paymentAmount = d.paidAmountPaise ?? totals.totalAmountPaise;
        if (paymentAmount > 0 && d.paymentMode !== 'adjustment') {
          const receiptDocNumber = await app.numberSeriesService.next(tx, cid, 'sales.payment', { fiscalYear, plantId: d.plantId });
          const [rc] = await tx.insert(salesReceipts).values({
            companyId: cid,
            plantId: d.plantId,
            documentNumber: receiptDocNumber,
            status: 'approved',
            fiscalYear,
            postingDate: d.postingDate as any,
            customerId,
            receiptMode: d.paymentMode,
            receivedAmountPaise: paymentAmount,
            allocatedAmountPaise: paymentAmount,
            unallocatedAmountPaise: 0,
            totalAmountPaise: paymentAmount,
            remarks: `Quick bill payment via ${d.paymentMode}`,
            submittedBy: uid,
            submittedAt: new Date(),
            approvedBy: uid,
            approvedAt: new Date(),
            createdBy: uid,
          }).returning();

          await tx.insert(salesReceiptAllocations).values({
            receiptId: rc.id,
            invoiceId: inv.id,
            allocatedAmountPaise: paymentAmount,
          });

          await tx.update(salesInvoices).set({
            receivedAmountPaise: paymentAmount,
            paymentStatus: paymentAmount >= totals.totalAmountPaise ? 'paid' : 'partial',
          }).where(eq(salesInvoices.id, inv.id));

          // Post Receipt GL (DR Cash/Bank / CR AR)
          const receiptCtx: PostingContext = {
            companyId: cid,
            plantId: d.plantId,
            documentType: 'sales.payment',
            documentId: rc.id,
            documentNumber: rc.documentNumber,
            postingDate: new Date(d.postingDate),
            fiscalYear,
            period,
            header: {
              customerId,
              amountPaise: paymentAmount,
              paymentMode: d.paymentMode === 'cash' ? 'cash' : 'bank',
            },
            lines: [{ lineAmountPaise: paymentAmount }],
          };
          const receiptJeId = await app.postingEngine.post(tx, receiptCtx, uid);
          await tx.update(salesReceipts).set({ journalEntryId: receiptJeId }).where(eq(salesReceipts.id, rc.id));
          receiptRecord = rc;
        }

        // 5g. Audit logging
        await app.auditEngine.logCreate({
          companyId: cid,
          documentType: DOC,
          documentId: inv.id,
          documentNumber: inv.documentNumber,
          performedBy: uid,
        }, inv, { tx });

        const transResult = app.statusEngine.prepare(DOC, 'draft', 'approved', uid);
        await app.auditEngine.logTransition({
          companyId: cid,
          documentType: DOC,
          documentId: inv.id,
          documentNumber: inv.documentNumber,
          performedBy: uid,
        }, 'draft', transResult, 'Quick counter sale execution', { tx });

        return {
          invoice: inv,
          lines: createdLines,
          receipt: receiptRecord,
          journalEntryId: revenueJeId,
          cogsJournalEntryId: cogsJeId,
        };
      });

      return reply.code(201).send(result);
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Quick invoice creation failed', detail: (err as Error).message });
    }
  });
}
