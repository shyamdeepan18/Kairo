import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  db,
  customers, customerAddresses,
  salesQuotations, salesQuotationLines,
  salesOrders, salesOrderLines,
  deliveryNotes, deliveryNoteLines,
  salesInvoices, salesInvoiceLines,
  salesReceipts, salesReceiptAllocations,
  stockReservations,
  plants, warehouses, items, taxCodes,
} from '@erp/db';
import {
  customerCreateSchema, customerUpdateSchema, customerAddressCreateSchema,
  quotationCreateSchema, soCreateSchema, deliveryCreateSchema,
  salesInvoiceCreateSchema, salesReceiptCreateSchema, transitionSchema,
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
  registerReceipts(app);
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

function computeLine(input: {
  quantity: number; ratePaise: number; discountPercent?: number; discountPaise?: number;
  cgstAmountPaise?: number; sgstAmountPaise?: number; igstAmountPaise?: number; cessAmountPaise?: number;
}): ComputedLine {
  const gross = Math.round(input.quantity * input.ratePaise);
  const discountPaise = input.discountPaise && input.discountPaise > 0
    ? input.discountPaise
    : Math.round((gross * (input.discountPercent ?? 0)) / 100);
  const netAmountPaise = gross - discountPaise;
  const cgst = input.cgstAmountPaise ?? 0, sgst = input.sgstAmountPaise ?? 0;
  const igst = input.igstAmountPaise ?? 0, cess = input.cessAmountPaise ?? 0;
  const taxAmountPaise = cgst + sgst + igst + cess;
  return {
    netAmountPaise, discountPaise,
    cgstAmountPaise: cgst, sgstAmountPaise: sgst, igstAmountPaise: igst, cessAmountPaise: cess,
    taxAmountPaise, totalAmountPaise: netAmountPaise + taxAmountPaise,
  };
}

function headerTotals(lines: ComputedLine[]) {
  const netAmountPaise = lines.reduce((s, l) => s + l.netAmountPaise, 0);
  const taxAmountPaise = lines.reduce((s, l) => s + l.taxAmountPaise, 0);
  return { netAmountPaise, taxAmountPaise, totalAmountPaise: netAmountPaise + taxAmountPaise };
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

async function listHeaders(request: FastifyRequest, table: any) {
  const cid = tenant(request).companyId;
  const q = request.query as Record<string, unknown>;
  const { page, pageSize, limit, offset } = paginate(q);
  const filters = [eq(table.companyId, cid)];
  if (q.status) filters.push(eq(table.status, String(q.status)));
  const data = await db.select().from(table).where(and(...filters)).orderBy(desc(table.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(and(...filters));
  return { data, total: count, page, pageSize };
}

async function getWithLines(reply: FastifyReply, table: any, linesTable: any, fk: any, params: { id: string }, companyId: string) {
  const [header] = await db.select().from(table).where(byTenantId(table, params.id, companyId)).limit(1);
  if (!header) return reply.code(404).send({ error: 'Not found' });
  const lines = await db.select().from(linesTable).where(eq(fk, params.id));
  return { ...header, lines };
}

function simpleTransition(
  app: FastifyInstance,
  cfg: { route: string; table: any; docType: string; to: DocumentStatus; perm: string }
) {
  app.post(cfg.route, {
    preHandler: [app.authenticate, resolveTenantContext, authorize(cfg.perm)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    // Scope to the caller's company so a foreign document can't be transitioned here.
    const [row] = await db.select().from(cfg.table).where(byTenantId(cfg.table, id, cid)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });

    if (cfg.to === 'approved') {
      const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);
      if (!app.permissionService.validateMakerChecker(uid, row.createdBy, row.submittedBy, bypassSod)) {
        return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
      }
    }
    try {
      await applyTransition(app, {
        client: db, table: cfg.table, docType: cfg.docType, id, companyId: cid,
        documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
        toStatus: cfg.to, userId: userId(request), remarks,
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
    preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')],
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
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const { page, pageSize, limit, offset } = paginate(request.query as Record<string, unknown>);
    const data = await db.select().from(customers).where(eq(customers.companyId, cid))
      .orderBy(desc(customers.createdAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(customers).where(eq(customers.companyId, cid));
    return { data, total: count, page, pageSize };
  });

  app.get('/customers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')],
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
    preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')],
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
    preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')],
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

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < d.lines.length; i++) {
        const l = d.lines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : l.ratePaise;
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
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesQuotationLines).values(
        d.lines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : l.ratePaise;
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

  app.get('/quotations', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.view')] },
    async (request) => listHeaders(request, salesQuotations));
  app.get('/quotations/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.quotation.view')] },
    async (request, reply) => getWithLines(reply, salesQuotations, salesQuotationLines, salesQuotationLines.quotationId, request.params as { id: string }, tenant(request).companyId));

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

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const allowBelowMin = await app.permissionService.check(userId(request), 'sales.so.allow_below_min_price', cid);
    if (!allowBelowMin) {
      for (let i = 0; i < d.lines.length; i++) {
        const l = d.lines[i];
        const it = itemMap.get(l.itemId);
        if (it && it.minSellingPricePaise > 0) {
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : l.ratePaise;
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
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesOrderLines).values(
        d.lines.map((l, i) => {
          const it = itemMap.get(l.itemId);
          const estCost = (it?.purchaseRatePaise && it.purchaseRatePaise > 0) ? it.purchaseRatePaise : (it?.standardCostPaise || 0);
          const netUnitPrice = l.quantity > 0 ? Math.round(computed[i].netAmountPaise / l.quantity) : l.ratePaise;
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

  app.get('/orders', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')] },
    async (request) => listHeaders(request, salesOrders));
  app.get('/orders/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.so.view')] },
    async (request, reply) => getWithLines(reply, salesOrders, salesOrderLines, salesOrderLines.soId, request.params as { id: string }, tenant(request).companyId));

  simpleTransition(app, { route: '/orders/:id/submit', table: salesOrders, docType: DOC, to: 'submitted', perm: 'sales.so.submit' });
  
  // Approve SO → Credit check + SoD check + Stock reservations write
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

    // Segregation of Duties
    if (!app.permissionService.validateMakerChecker(uid, so.createdBy, so.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Maker/submitter cannot approve.' });
    }

    // Credit limit check & credit hold gate
    const [cust] = await db.select().from(customers).where(byTenantId(customers, so.customerId, cid)).limit(1);
    if (cust) {
      if (cust.creditHold) {
        return reply.code(409).send({ error: `Customer '${cust.name}' is on credit hold. Cannot approve Sales Order.` });
      }
      if (cust.creditLimitPaise && cust.creditLimitPaise > 0) {
        const [bal] = await db
          .select({ sum: sql<number>`COALESCE(SUM(total_amount_paise - received_amount_paise), 0)` })
          .from(salesInvoices)
          .where(and(eq(salesInvoices.companyId, cid), eq(salesInvoices.customerId, cust.id), sql`${salesInvoices.paymentStatus} != 'paid'`));
        const outstanding = Number(bal?.sum || 0);
        if (outstanding + so.totalAmountPaise > cust.creditLimitPaise) {
          return reply.code(409).send({ error: `Sales Order total (₹${(so.totalAmountPaise / 100).toFixed(2)}) exceeds customer credit limit (₹${(cust.creditLimitPaise / 100).toFixed(2)}).` });
        }
      }
    }

    const lines = await db.select().from(salesOrderLines).where(eq(salesOrderLines.soId, id));

    try {
      await db.transaction(async (tx) => {
        // Write stock reservations
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (l.warehouseId) {
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
          }
        }

        await applyTransition(app, {
          client: tx as any, table: salesOrders, docType: DOC, id: so.id, companyId: cid,
          documentNumber: so.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks,
        });
      });
      return reply.send({ ok: true, status: 'approved' });
    } catch (err) {
      return reply.code(409).send({ error: 'SO approval failed', detail: (err as Error).message });
    }
  });

  simpleTransition(app, { route: '/orders/:id/cancel', table: salesOrders, docType: DOC, to: 'cancelled', perm: 'sales.so.cancel' });
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

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [dn] = await tx.insert(deliveryNotes).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, soId: d.soId, warehouseId: d.warehouseId,
        shippingAddressId: d.shippingAddressId, transporterName: d.transporterName, vehicleNo: d.vehicleNo,
        lrNumber: d.lrNumber, ewayBillNo: d.ewayBillNo, ewayBillDate: d.ewayBillDate as any, distanceKm: d.distanceKm,
        remarks: d.remarks, createdBy: userId(request),
      }).returning();
      await tx.insert(deliveryNoteLines).values(
        d.lines.map((l, i) => ({
          deliveryId: dn.id, lineNumber: i + 1, soLineId: l.soLineId, itemId: l.itemId, description: l.description,
          deliveredQty: l.deliveredQty.toString(), uom: l.uom, ratePaise: l.ratePaise,
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
    async (request) => listHeaders(request, deliveryNotes));
  app.get('/deliveries/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.delivery.view')] },
    async (request, reply) => getWithLines(reply, deliveryNotes, deliveryNoteLines, deliveryNoteLines.deliveryId, request.params as { id: string }, tenant(request).companyId));

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
          await tx.update(salesOrders).set({ deliveryStatus: 'partial', updatedAt: new Date() }).where(byTenantId(salesOrders, dn.soId, cid));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Delivery approval failed', detail: (err as Error).message });
    }
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
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [inv] = await tx.insert(salesInvoices).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, customerId: d.customerId, soId: d.soId, deliveryId: d.deliveryId,
        billingAddressId: d.billingAddressId, shippingAddressId: d.shippingAddressId, dueDate: d.dueDate as any,
        placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge, supplyType: d.supplyType,
        isExport: d.isExport, einvoiceApplicable: d.einvoiceApplicable,
        einvoiceStatus: d.einvoiceApplicable ? 'pending' : 'not_applicable', remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(salesInvoiceLines).values(
        d.lines.map((l, i) => ({
          invoiceId: inv.id, lineNumber: i + 1, soLineId: l.soLineId, deliveryLineId: l.deliveryLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
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
    async (request) => listHeaders(request, salesInvoices));
  app.get('/invoices/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.invoice.view')] },
    async (request, reply) => getWithLines(reply, salesInvoices, salesInvoiceLines, salesInvoiceLines.invoiceId, request.params as { id: string }, tenant(request).companyId));

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
        if (inv.soId) await tx.update(salesOrders).set({ billingStatus: 'partial', updatedAt: new Date() }).where(byTenantId(salesOrders, inv.soId, cid));
        if (inv.deliveryId) await tx.update(deliveryNotes).set({ billingStatus: 'partial', updatedAt: new Date() }).where(byTenantId(deliveryNotes, inv.deliveryId, cid));
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
