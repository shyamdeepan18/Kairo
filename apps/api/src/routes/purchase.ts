import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  db,
  suppliers,
  purchaseRequisitions, purchaseRequisitionLines,
  blanketPurchaseOrders, blanketPoLines,
  purchaseOrders, purchaseOrderLines,
  goodsReceiptNotes, goodsReceiptNoteLines,
  purchaseInvoices, purchaseInvoiceLines,
  purchasePayments, purchasePaymentAllocations,
  purchaseReturns, purchaseReturnLines,
  purchaseDebitNotes, purchaseDebitNoteLines,
  landedCostVouchers, lcvApplicableGrns, lcvExpenseLines, lcvAllocatedItems,
  approvalRequests,
  users,
  plants, warehouses, items, taxCodes,
  chartOfAccounts, stockBalances,
} from '@erp/db';
import {
  supplierCreateSchema, supplierUpdateSchema,
  prCreateSchema, poCreateSchema, grnCreateSchema,
  blanketPoCreateSchema, lcvCreateSchema,
  purchaseInvoiceCreateSchema, purchasePaymentCreateSchema,
  purchaseReturnCreateSchema, purchaseDebitNoteCreateSchema,
  transitionSchema,
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
 * Phase 6 — Purchase routes.  Mounted at /api/purchase (see index.ts).
 *
 * Chain: PR → PO → GRN → Invoice → Payment.
 * GRN approval posts stock (StockLedgerService) + GL (PostingEngine: purchase.grn).
 * Invoice / Payment approval post GL (purchase.invoice / purchase.payment).
 * Debit Note approval posts GL (purchase.debit_note: DR AP / CR Purchases + Tax).
 *
 * Every write resolves the company via resolveTenantContext and is gated by authorize()
 * against the seeded purchase.* permissions. Document numbers come from
 * NumberSeriesService (seed with seedPurchaseNumberSeries() first).
 */
export default async function purchaseRoutes(app: FastifyInstance) {
  // Authenticate at the group level FIRST so the module gate below sees the
  // trusted JWT context (request.user.activeCompanyId) instead of client input.
  // Individual routes still run authenticate + resolveTenantContext + authorize.
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireModule('purchase'));   // company must have the purchase module licensed
  registerSuppliers(app);
  registerRequisitions(app);
  registerBlanketOrders(app);
  registerOrders(app);
  registerGrns(app);
  registerLandedCostVouchers(app);
  registerInvoices(app);
  registerPayments(app);
  registerReturns(app);
  registerDebitNotes(app);
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const userId = (req: FastifyRequest): string => (req.user as { id: string }).id;

function bad(reply: FastifyReply, parsed: { error: { issues: unknown } }) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}

interface ComputedLine {
  netAmountPaise: number;
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

/** Compute money for one line. qty/rate/discount all drive net; tax amounts are derived from taxCode or passed in. */
function computeLine(input: {
  quantity: number;
  ratePaise: number;
  discountPercent?: number;
  discountPaise?: number;
  cgstAmountPaise?: number;
  sgstAmountPaise?: number;
  igstAmountPaise?: number;
  cessAmountPaise?: number;
  taxCode?: TaxCodeRates;
  isInterState?: boolean;
}): ComputedLine & { discountPaise: number } {
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
    netAmountPaise,
    discountPaise,
    cgstAmountPaise: cgst,
    sgstAmountPaise: sgst,
    igstAmountPaise: igst,
    cessAmountPaise: cess,
    taxAmountPaise,
    totalAmountPaise: netAmountPaise + taxAmountPaise,
  };
}

/** Roll up computed lines into header totals including header discount and round-off. */
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

/**
 * Validate + apply a status transition on a document header, then write the audit
 * row. Generic over the table (typed `any`) since every purchase header shares the
 * documentHeader columns (status + stamp fields). Runs inside `client` (db or tx).
 */
async function applyTransition(
  app: FastifyInstance,
  opts: {
    client: typeof db;
    table: any;
    docType: string;
    id: string;
    companyId: string;
    documentNumber: string;
    fromStatus: DocumentStatus;
    toStatus: DocumentStatus;
    userId: string;
    remarks?: string;
    extraSet?: Record<string, unknown>;
  }
) {
  const result = app.statusEngine.prepare(opts.docType, opts.fromStatus, opts.toStatus, opts.userId);
  await opts.client
    .update(opts.table)
    .set({ ...result.stampFields, ...(opts.extraSet ?? {}) })
    .where(eq(opts.table.id, opts.id));
  await app.auditEngine.logTransition(
    {
      companyId: opts.companyId,
      documentType: opts.docType,
      documentId: opts.id,
      documentNumber: opts.documentNumber,
      performedBy: opts.userId,
    },
    opts.fromStatus,
    result,
    opts.remarks,
    { tx: opts.client }
  );
  return result;
}

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize ?? '50'), 10) || 50));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

// ════════════════════════════════════════════════════════════════════════════
// Suppliers
// ════════════════════════════════════════════════════════════════════════════

function registerSuppliers(app: FastifyInstance) {
  // Create
  app.post('/suppliers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.create')],
  }, async (request, reply) => {
    const parsed = supplierCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const data = parsed.data;
    const [row] = await db.insert(suppliers).values({
      companyId: tenant(request).companyId,
      supplierCode: data.supplierCode,
      name: data.name,
      legalName: data.legalName,
      supplierType: data.supplierType,
      gstin: data.gstin,
      pan: data.pan,
      stateCode: data.stateCode ?? data.gstin?.slice(0, 2),
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      contactPerson: data.contactPerson,
      phone: data.phone,
      email: data.email,
      paymentTermsDays: data.paymentTermsDays,
      creditLimitPaise: data.creditLimitPaise,
      createdBy: userId(request),
    }).returning();
    return reply.code(201).send(row);
  });

  // List
  app.get('/suppliers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const { page, pageSize, limit, offset } = paginate(request.query as Record<string, unknown>);
    const data = await db.select().from(suppliers)
      .where(eq(suppliers.companyId, cid))
      .orderBy(desc(suppliers.createdAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(suppliers).where(eq(suppliers.companyId, cid));
    return { data, total: count, page, pageSize };
  });

  // Get one
  app.get('/suppliers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(suppliers)
      .where(byTenantId(suppliers, id, tenant(request).companyId)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Supplier not found' });
    return row;
  });

  // Update
  app.patch('/suppliers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = supplierUpdateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const [row] = await db.update(suppliers)
      .set({ ...parsed.data, updatedBy: userId(request), updatedAt: new Date() })
      .where(byTenantId(suppliers, id, tenant(request).companyId)).returning();
    if (!row) return reply.code(404).send({ error: 'Supplier not found' });
    return row;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Requisitions  (no GL, no stock)
// ════════════════════════════════════════════════════════════════════════════

function registerRequisitions(app: FastifyInstance) {
  const DOC = 'purchase.requisition';

  app.post('/requisitions', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.requisition.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = prCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
      assertAllOwned(suppliers, d.lines.map((l) => l.suggestedSupplierId), cid, 'Suggested supplier'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    // Calculate total amount from lines for ApprovalEngine banding
    const totalAmountPaise = d.lines.reduce((acc, l) => acc + Math.round(l.quantity * (l.estimatedRatePaise || 0)), 0);

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [pr] = await tx.insert(purchaseRequisitions).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any, requiredByDate: d.requiredByDate as any,
        purpose: d.purpose, remarks: d.remarks, createdBy: userId(request),
        netAmountPaise: totalAmountPaise, totalAmountPaise,
      }).returning();
      await tx.insert(purchaseRequisitionLines).values(
        d.lines.map((l, i) => ({
          requisitionId: pr.id, lineNumber: i + 1, itemId: l.itemId, description: l.description,
          quantity: l.quantity.toString(), uom: l.uom, requiredByDate: l.requiredByDate as any,
          estimatedRatePaise: l.estimatedRatePaise, warehouseId: l.warehouseId,
          suggestedSupplierId: l.suggestedSupplierId,
        }))
      );
      await app.auditEngine.logCreate(
        { companyId: tenant(request).companyId, documentType: DOC, documentId: pr.id, documentNumber, performedBy: userId(request) },
        pr, { tx }
      );
      return pr;
    });
    return reply.code(201).send(created);
  });

  app.get('/requisitions/pending-lines', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.requisition.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const rows = await db.select({
      id: purchaseRequisitionLines.id,
      requisitionId: purchaseRequisitions.id,
      documentNumber: purchaseRequisitions.documentNumber,
      postingDate: purchaseRequisitions.postingDate,
      lineNumber: purchaseRequisitionLines.lineNumber,
      itemId: purchaseRequisitionLines.itemId,
      description: purchaseRequisitionLines.description,
      quantity: purchaseRequisitionLines.quantity,
      orderedQty: purchaseRequisitionLines.orderedQty,
      uom: purchaseRequisitionLines.uom,
      estimatedRatePaise: purchaseRequisitionLines.estimatedRatePaise,
    })
    .from(purchaseRequisitionLines)
    .innerJoin(purchaseRequisitions, eq(purchaseRequisitions.id, purchaseRequisitionLines.requisitionId))
    .where(and(
      eq(purchaseRequisitions.companyId, cid),
      eq(purchaseRequisitions.status, 'approved'),
      sql`${purchaseRequisitionLines.quantity} > ${purchaseRequisitionLines.orderedQty}`
    ))
    .orderBy(desc(purchaseRequisitions.postingDate));
    return rows;
  });

  app.get('/requisitions', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.requisition.view')],
  }, async (request) => listHeaders(request, purchaseRequisitions, 'purchase.requisition'));

  app.get('/requisitions/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.requisition.view')],
  }, async (request, reply) => getWithLines(request, reply, purchaseRequisitions, purchaseRequisitionLines, purchaseRequisitionLines.requisitionId, request.params as { id: string }, 'purchase.requisition'));

  // submit / approve / reject
  simpleTransition(app, { route: '/requisitions/:id/submit', table: purchaseRequisitions, docType: DOC, to: 'submitted', perm: 'purchase.requisition.submit' });
  simpleTransition(app, { route: '/requisitions/:id/approve', table: purchaseRequisitions, docType: DOC, to: 'approved', perm: 'purchase.requisition.approve' });
  simpleTransition(app, { route: '/requisitions/:id/reject', table: purchaseRequisitions, docType: DOC, to: 'rejected', perm: 'purchase.requisition.approve' });
}

// ════════════════════════════════════════════════════════════════════════════
// Blanket Purchase Orders (GAP 7)
// ════════════════════════════════════════════════════════════════════════════

function registerBlanketOrders(app: FastifyInstance) {
  const DOC = 'purchase.blanket_po';

  app.get('/blanket-orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.blanket_po.view')],
  }, async (request, reply) => {
    const cid = tenant(request).companyId;
    const { supplierId, status } = request.query as { supplierId?: string; status?: string };
    const conds = [eq(blanketPurchaseOrders.companyId, cid)];
    if (supplierId) conds.push(eq(blanketPurchaseOrders.supplierId, supplierId));
    if (status) conds.push(eq(blanketPurchaseOrders.status, status));

    const rows = await db
      .select({
        id: blanketPurchaseOrders.id,
        companyId: blanketPurchaseOrders.companyId,
        plantId: blanketPurchaseOrders.plantId,
        documentNumber: blanketPurchaseOrders.documentNumber,
        status: blanketPurchaseOrders.status,
        postingDate: blanketPurchaseOrders.postingDate,
        validFrom: blanketPurchaseOrders.validFrom,
        validTo: blanketPurchaseOrders.validTo,
        totalAmountPaise: blanketPurchaseOrders.totalAmountPaise,
        supplierId: blanketPurchaseOrders.supplierId,
        supplierName: suppliers.name,
        supplierCode: suppliers.supplierCode,
        remarks: blanketPurchaseOrders.remarks,
        createdAt: blanketPurchaseOrders.createdAt,
      })
      .from(blanketPurchaseOrders)
      .leftJoin(suppliers, eq(blanketPurchaseOrders.supplierId, suppliers.id))
      .where(and(...conds))
      .orderBy(desc(blanketPurchaseOrders.createdAt));

    return reply.send(rows);
  });

  app.get('/blanket-orders/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.blanket_po.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [bpo] = await db
      .select({
        id: blanketPurchaseOrders.id,
        companyId: blanketPurchaseOrders.companyId,
        plantId: blanketPurchaseOrders.plantId,
        documentNumber: blanketPurchaseOrders.documentNumber,
        status: blanketPurchaseOrders.status,
        postingDate: blanketPurchaseOrders.postingDate,
        validFrom: blanketPurchaseOrders.validFrom,
        validTo: blanketPurchaseOrders.validTo,
        totalAmountPaise: blanketPurchaseOrders.totalAmountPaise,
        netAmountPaise: blanketPurchaseOrders.netAmountPaise,
        taxAmountPaise: blanketPurchaseOrders.taxAmountPaise,
        termsAndConditions: blanketPurchaseOrders.termsAndConditions,
        remarks: blanketPurchaseOrders.remarks,
        supplierId: blanketPurchaseOrders.supplierId,
        supplierName: suppliers.name,
        supplierCode: suppliers.supplierCode,
        createdAt: blanketPurchaseOrders.createdAt,
      })
      .from(blanketPurchaseOrders)
      .leftJoin(suppliers, eq(blanketPurchaseOrders.supplierId, suppliers.id))
      .where(byTenantId(blanketPurchaseOrders, id, cid))
      .limit(1);
    if (!bpo) return reply.code(404).send({ error: 'Blanket purchase order not found' });

    const lines = await db
      .select({
        id: blanketPoLines.id,
        lineNumber: blanketPoLines.lineNumber,
        itemId: blanketPoLines.itemId,
        itemCode: items.itemCode,
        itemName: items.itemName,
        description: blanketPoLines.description,
        committedQty: blanketPoLines.committedQty,
        releasedQty: blanketPoLines.releasedQty,
        uom: blanketPoLines.uom,
        ratePaise: blanketPoLines.ratePaise,
        discountPercent: blanketPoLines.discountPercent,
        discountPaise: blanketPoLines.discountPaise,
        netAmountPaise: blanketPoLines.netAmountPaise,
        taxAmountPaise: blanketPoLines.taxAmountPaise,
        totalAmountPaise: blanketPoLines.totalAmountPaise,
      })
      .from(blanketPoLines)
      .leftJoin(items, eq(blanketPoLines.itemId, items.id))
      .where(eq(blanketPoLines.blanketPoId, id))
      .orderBy(blanketPoLines.lineNumber);

    const releaseOrders = await db
      .select({
        id: purchaseOrders.id,
        documentNumber: purchaseOrders.documentNumber,
        status: purchaseOrders.status,
        postingDate: purchaseOrders.postingDate,
        totalAmountPaise: purchaseOrders.totalAmountPaise,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.blanketPoId, id), eq(purchaseOrders.companyId, cid)))
      .orderBy(desc(purchaseOrders.postingDate));

    return reply.send({ ...bpo, lines, releaseOrders });
  });

  app.post('/blanket-orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.blanket_po.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = blanketPoCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
    ]);

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [supplier] = await db.select({ gstin: suppliers.gstin, stateCode: suppliers.stateCode }).from(suppliers).where(eq(suppliers.id, d.supplierId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const supplierState = (supplier?.gstin ? supplier.gstin.slice(0, 2) : (supplier?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && supplierState && plantState !== supplierState);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = d.lines.map((l) =>
      computeLine({
        quantity: l.committedQty,
        ratePaise: l.ratePaise,
        discountPercent: l.discountPercent,
        discountPaise: l.discountPaise,
        taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined,
        isInterState,
      })
    );
    const totals = headerTotals(computed, {
      discountPaise: d.discountPaise,
      roundOffPaise: d.roundOffPaise,
    });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, cid, DOC, { fiscalYear, plantId: d.plantId });
      const [bpo] = await tx.insert(blanketPurchaseOrders).values({
        companyId: cid,
        plantId: d.plantId,
        documentNumber,
        status: 'draft',
        fiscalYear,
        postingDate: d.postingDate as any,
        supplierId: d.supplierId,
        validFrom: d.validFrom as any,
        validTo: d.validTo as any,
        termsAndConditions: d.termsAndConditions,
        remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise,
        discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise,
        roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise,
        createdBy: userId(request),
      }).returning();

      await tx.insert(blanketPoLines).values(
        d.lines.map((l, i) => ({
          blanketPoId: bpo.id,
          lineNumber: i + 1,
          itemId: l.itemId,
          description: l.description,
          committedQty: l.committedQty.toString(),
          releasedQty: '0',
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

      await app.auditEngine.logCreate(
        { companyId: cid, documentType: DOC, documentId: bpo.id, documentNumber, performedBy: userId(request) },
        bpo,
        { tx }
      );
      return bpo;
    });

    return reply.code(201).send(created);
  });

  simpleTransition(app, { route: '/blanket-orders/:id/submit',  table: blanketPurchaseOrders, docType: DOC, to: 'submitted', perm: 'purchase.blanket_po.create' });
  simpleTransition(app, { route: '/blanket-orders/:id/approve', table: blanketPurchaseOrders, docType: DOC, to: 'approved',  perm: 'purchase.blanket_po.approve' });
  simpleTransition(app, { route: '/blanket-orders/:id/cancel',  table: blanketPurchaseOrders, docType: DOC, to: 'cancelled', perm: 'purchase.blanket_po.cancel' });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Orders  (no GL, no stock)
// ════════════════════════════════════════════════════════════════════════════

function registerOrders(app: FastifyInstance) {
  const DOC = 'purchase.po';

  app.post('/orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = poCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    // Every client-supplied reference must belong to the active tenant.
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertOwned(purchaseRequisitions, d.requisitionId, cid, 'Requisition'),
      assertOwned(blanketPurchaseOrders, d.blanketPoId, cid, 'Blanket Purchase Order'),
      assertOwned(warehouses, d.deliveryWarehouseId, cid, 'Delivery warehouse'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [supplier] = await db.select({ gstin: suppliers.gstin, stateCode: suppliers.stateCode }).from(suppliers).where(eq(suppliers.id, d.supplierId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const supplierState = (supplier?.gstin ? supplier.gstin.slice(0, 2) : (supplier?.stateCode ?? plantState));
    const isInterState = d.placeOfSupply ? d.placeOfSupply !== plantState : Boolean(plantState && supplierState && plantState !== supplierState);

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
      const [po] = await tx.insert(purchaseOrders).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any,
        supplierId: d.supplierId, requisitionId: d.requisitionId, blanketPoId: d.blanketPoId, supplierRef: d.supplierRef,
        projectId: (d as any).projectId ?? null,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        deliveryWarehouseId: d.deliveryWarehouseId, placeOfSupply: d.placeOfSupply,
        isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(purchaseOrderLines).values(
        d.lines.map((l, i) => ({
          poId: po.id, lineNumber: i + 1, requisitionLineId: l.requisitionLineId, blanketPoLineId: l.blanketPoLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom,
          ratePaise: l.ratePaise, discountPercent: String(l.discountPercent ?? 0),
          discountPaise: computed[i].discountPaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
          warehouseId: l.warehouseId,
        }))
      );

      // Update ordered qty on linked PR lines
      const prLinesToUpdate = d.lines.filter(l => l.requisitionLineId);
      for (const line of prLinesToUpdate) {
        await tx.update(purchaseRequisitionLines)
          .set({ orderedQty: sql`${purchaseRequisitionLines.orderedQty} + ${line.quantity}` })
          .where(eq(purchaseRequisitionLines.id, line.requisitionLineId!));
      }

      // Update released qty on linked Blanket PO lines with strict quota validation
      const bpoLinesToUpdate = d.lines.filter(l => l.blanketPoLineId);
      for (const line of bpoLinesToUpdate) {
        const [bpoLine] = await tx
          .select({ id: blanketPoLines.id, committedQty: blanketPoLines.committedQty, releasedQty: blanketPoLines.releasedQty })
          .from(blanketPoLines)
          .where(eq(blanketPoLines.id, line.blanketPoLineId!))
          .for('update');
        if (bpoLine) {
          const committed = parseFloat(bpoLine.committedQty);
          const currentReleased = parseFloat(bpoLine.releasedQty);
          if (currentReleased + line.quantity > committed + 1e-6) {
            throw new Error(`Blanket PO quota exceeded: Committed ${committed}, already released ${currentReleased}, attempting to release ${line.quantity}`);
          }
          await tx.update(blanketPoLines)
            .set({ releasedQty: sql`${blanketPoLines.releasedQty} + ${line.quantity}` })
            .where(eq(blanketPoLines.id, line.blanketPoLineId!));
        }
      }

      await app.auditEngine.logCreate(
        { companyId: tenant(request).companyId, documentType: DOC, documentId: po.id, documentNumber, performedBy: userId(request) },
        po, { tx }
      );
      return po;
    });
    return reply.code(201).send(created);
  });


  app.put('/orders/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = poCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    
    const cid = tenant(request).companyId;
    const [existing] = await db.select().from(purchaseOrders)
      .where(byTenantId(purchaseOrders, id, cid)).limit(1);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    if (existing.status !== 'draft') return reply.code(409).send({ error: 'Can only edit draft orders' });

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertOwned(purchaseRequisitions, d.requisitionId, cid, 'Requisition'),
      assertOwned(blanketPurchaseOrders, d.blanketPoId, cid, 'Blanket Purchase Order'),
      assertOwned(warehouses, d.deliveryWarehouseId, cid, 'Delivery warehouse'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [supplier] = await db.select({ gstin: suppliers.gstin, stateCode: suppliers.stateCode }).from(suppliers).where(eq(suppliers.id, d.supplierId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const supplierState = (supplier?.gstin ? supplier.gstin.slice(0, 2) : (supplier?.stateCode ?? plantState));
    const isInterState = d.placeOfSupply ? d.placeOfSupply !== plantState : Boolean(plantState && supplierState && plantState !== supplierState);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    const computed = d.lines.map((l) =>
      computeLine({ ...l, taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined, isInterState })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    const updated = await db.transaction(async (tx) => {
      const [po] = await tx.update(purchaseOrders).set({
        plantId: d.plantId,
        supplierId: d.supplierId, requisitionId: d.requisitionId, blanketPoId: d.blanketPoId, supplierRef: d.supplierRef,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        deliveryWarehouseId: d.deliveryWarehouseId, placeOfSupply: d.placeOfSupply,
        isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, updatedBy: userId(request), updatedAt: new Date(),
      }).where(byTenantId(purchaseOrders, id, cid)).returning();
      
      // Un-link old lines from PR and Blanket PO
      const oldLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      for (const line of oldLines) {
        if (line.requisitionLineId) {
          await tx.update(purchaseRequisitionLines)
            .set({ orderedQty: sql`${purchaseRequisitionLines.orderedQty} - ${line.quantity}` })
            .where(eq(purchaseRequisitionLines.id, line.requisitionLineId));
        }
        if (line.blanketPoLineId) {
          await tx.update(blanketPoLines)
            .set({ releasedQty: sql`GREATEST(0, ${blanketPoLines.releasedQty} - ${line.quantity})` })
            .where(eq(blanketPoLines.id, line.blanketPoLineId));
        }
      }
      
      await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
      
      await tx.insert(purchaseOrderLines).values(
        d.lines.map((l, i) => ({
          poId: po.id, lineNumber: i + 1, requisitionLineId: l.requisitionLineId, blanketPoLineId: l.blanketPoLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom,
          ratePaise: l.ratePaise, discountPercent: String(l.discountPercent ?? 0),
          discountPaise: computed[i].discountPaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
          warehouseId: l.warehouseId,
        }))
      );

      // Re-link new PR lines
      const prLinesToUpdate = d.lines.filter(l => l.requisitionLineId);
      for (const line of prLinesToUpdate) {
        await tx.update(purchaseRequisitionLines)
          .set({ orderedQty: sql`${purchaseRequisitionLines.orderedQty} + ${line.quantity}` })
          .where(eq(purchaseRequisitionLines.id, line.requisitionLineId!));
      }

      // Re-link new Blanket PO lines
      const bpoLinesToUpdate = d.lines.filter(l => l.blanketPoLineId);
      for (const line of bpoLinesToUpdate) {
        const [bpoLine] = await tx
          .select({ id: blanketPoLines.id, committedQty: blanketPoLines.committedQty, releasedQty: blanketPoLines.releasedQty })
          .from(blanketPoLines)
          .where(eq(blanketPoLines.id, line.blanketPoLineId!))
          .for('update');
        if (bpoLine) {
          const committed = parseFloat(bpoLine.committedQty);
          const currentReleased = parseFloat(bpoLine.releasedQty);
          if (currentReleased + line.quantity > committed + 1e-6) {
            throw new Error(`Blanket PO quota exceeded: Committed ${committed}, already released ${currentReleased}, attempting to release ${line.quantity}`);
          }
          await tx.update(blanketPoLines)
            .set({ releasedQty: sql`${blanketPoLines.releasedQty} + ${line.quantity}` })
            .where(eq(blanketPoLines.id, line.blanketPoLineId!));
        }
      }

      await app.auditEngine.logTransition(
        { companyId: po.companyId, documentType: DOC, documentId: po.id, documentNumber: po.documentNumber, performedBy: userId(request) },
        'draft', { toStatus: 'draft', stampFields: {} }, 'Order modified', { tx }
      );
      
      return po;
    });
    return reply.send(updated);
  });

  app.get('/orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.view')],
  }, async (request) => listHeaders(request, purchaseOrders, 'purchase.po'));

  app.get('/orders/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.view')],
  }, async (request, reply) => getWithLines(request, reply, purchaseOrders, purchaseOrderLines, purchaseOrderLines.poId, request.params as { id: string }, 'purchase.po'));

  simpleTransition(app, { route: '/orders/:id/submit', table: purchaseOrders, docType: DOC, to: 'submitted', perm: 'purchase.po.submit' });
  
  app.post('/orders/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);
    const [row] = await db.select().from(purchaseOrders)
      .where(byTenantId(purchaseOrders, id, cid)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });

    // 1. Check ApprovalEngine first
    const [req] = await db.select().from(approvalRequests)
      .where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending')))
      .limit(1);

    if (req) {
      try {
        const res = await db.transaction((tx) => app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, { companyId: cid, bypassSod }));
        if (!('finalized' in res)) return reply.send({ ok: true, status: 'submitted', detail: res });
        return reply.send({ ok: true, status: 'approved' }); // Finalized, status already updated by ApprovalEngine
      } catch (err) {
        return reply.code(409).send({ error: `Approval action failed: ${(err as Error).message}`, detail: (err as Error).message });
      }
    }

    // 2. Fallback to old basic limits
    if (!app.permissionService.validateMakerChecker(uid, row.createdBy, row.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const withinLimit = await app.permissionService.withinApprovalLimit(
      uid, cid, DOC, row.totalAmountPaise, row.plantId
    );
    if (!withinLimit) {
      return reply.code(403).send({ error: 'Document total exceeds your monetary approval limit.' });
    }

    try {
      await applyTransition(app, {
        client: db, table: purchaseOrders, docType: DOC, id, companyId: cid,
        documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
        toStatus: 'approved', userId: uid, remarks,
      });
      return reply.send({ ok: true, status: 'approved' });
    } catch (err) {
      return reply.code(409).send({ error: 'Transition failed', detail: (err as Error).message });
    }
  });
  app.post('/orders/:id/cancel', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.cancel')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;

    // Prevent cancellation if any non-cancelled GRN exists against this PO
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(goodsReceiptNotes)
      .where(and(
        eq(goodsReceiptNotes.poId, id),
        eq(goodsReceiptNotes.companyId, cid),
        sql`${goodsReceiptNotes.status} != 'cancelled'`
      ));

    if (Number(count) > 0) {
      return reply.code(409).send({ error: 'Cannot cancel Purchase Order because a Goods Receipt Note already exists against it. Please short-close it instead.' });
    }

    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const [row] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid))).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });

    try {
      await db.transaction(async (tx) => {
        const poLines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
        for (const l of poLines) {
          if (l.blanketPoLineId) {
            await tx.update(blanketPoLines)
              .set({ releasedQty: sql`GREATEST(0, ${blanketPoLines.releasedQty} - ${parseFloat(l.quantity)})` })
              .where(eq(blanketPoLines.id, l.blanketPoLineId));
          }
        }
        await applyTransition(app, {
          client: tx, table: purchaseOrders, docType: DOC, id, companyId: cid,
          documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
          toStatus: 'cancelled', userId: userId(request), remarks,
        });
      });
      return reply.send({ ok: true, status: 'cancelled' });
    } catch (err) {
      return reply.code(409).send({ error: 'Transition failed', detail: (err as Error).message });
    }
  });

  // Short-close approved PO → update line shortClosedQty + release PR orderedQty + set status='closed'
  app.post('/orders/:id/short-close', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.po.cancel')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;

    const [po] = await db.select().from(purchaseOrders).where(byTenantId(purchaseOrders, id, cid)).limit(1);
    if (!po) return reply.code(404).send({ error: 'Purchase Order not found' });
    if (po.status !== 'approved') return reply.code(409).send({ error: `Only approved purchase orders can be short-closed (current status: '${po.status}')` });

    try {
      await db.transaction(async (tx) => {
        const lines = await tx.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
        for (const l of lines) {
          const unreceived = Math.max(0, parseFloat(l.quantity) - parseFloat(l.receivedQty));
          if (unreceived > 0) {
            await tx.update(purchaseOrderLines)
              .set({ shortClosedQty: String(unreceived) })
              .where(eq(purchaseOrderLines.id, l.id));

            if (l.requisitionLineId) {
              await tx.update(purchaseRequisitionLines)
                .set({ orderedQty: sql`GREATEST(0, ${purchaseRequisitionLines.orderedQty} - ${unreceived})` })
                .where(eq(purchaseRequisitionLines.id, l.requisitionLineId));
            }
          }
        }

        await applyTransition(app, {
          client: tx as any, table: purchaseOrders, docType: DOC, id: po.id, companyId: cid,
          documentNumber: po.documentNumber, fromStatus: po.status as DocumentStatus,
          toStatus: 'closed', userId: uid, remarks: remarks || 'Short-closed remaining balance',
        });
      });
      return reply.send({ ok: true, status: 'closed' });
    } catch (err) {
      return reply.code(409).send({ error: 'PO short-close failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Goods Receipt Notes  (approval → stock + GL)
// ════════════════════════════════════════════════════════════════════════════

function registerGrns(app: FastifyInstance) {
  const DOC = 'purchase.grn';

  app.post('/grns', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.grn.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = grnCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertOwned(purchaseOrders, d.poId, cid, 'Purchase order'),
      assertOwned(warehouses, d.warehouseId, cid, 'Warehouse'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    // Over-receipt guard at creation: prevent accepting more than remaining on PO lines
    const poLineIds = Array.from(new Set(d.lines.map((l) => l.poLineId).filter(Boolean))) as string[];
    if (poLineIds.length > 0) {
      const poLineRows = await db
        .select({
          id: purchaseOrderLines.id,
          quantity: purchaseOrderLines.quantity,
          receivedQty: purchaseOrderLines.receivedQty,
          shortClosedQty: purchaseOrderLines.shortClosedQty,
          description: purchaseOrderLines.description,
        })
        .from(purchaseOrderLines)
        .where(inArray(purchaseOrderLines.id, poLineIds));
      const poLineMap = new Map(poLineRows.map((pl) => [pl.id, pl]));

      for (const l of d.lines) {
        if (l.poLineId) {
          const pl = poLineMap.get(l.poLineId);
          if (pl) {
            const remaining = Math.max(0, parseFloat(pl.quantity) - parseFloat(pl.receivedQty) - parseFloat(pl.shortClosedQty || '0'));
            if (l.acceptedQty > remaining + 1e-6) {
              return reply.code(409).send({
                error: `Over-receipt error: Cannot accept ${l.acceptedQty} for item '${l.description || pl.description}'. Remaining quantity on PO line is ${remaining}.`,
              });
            }
          }
        }
      }
    }

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [supplier] = await db.select({ gstin: suppliers.gstin, stateCode: suppliers.stateCode }).from(suppliers).where(eq(suppliers.id, d.supplierId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const supplierState = (supplier?.gstin ? supplier.gstin.slice(0, 2) : (supplier?.stateCode ?? plantState));
    const isInterState = Boolean(plantState && supplierState && plantState !== supplierState);

    const taxCodeIds = Array.from(new Set(d.lines.map((l) => l.taxCodeId).filter(Boolean))) as string[];
    const taxCodeRows = taxCodeIds.length > 0
      ? await db.select().from(taxCodes).where(inArray(taxCodes.id, taxCodeIds))
      : [];
    const taxCodeMap = new Map(taxCodeRows.map((tc) => [tc.id, tc]));

    // value GRN lines on acceptedQty
    const computed = d.lines.map((l) =>
      computeLine({
        quantity: l.acceptedQty,
        ratePaise: l.ratePaise,
        discountPercent: l.discountPercent,
        discountPaise: l.discountPaise,
        taxCode: l.taxCodeId ? taxCodeMap.get(l.taxCodeId) : undefined,
        isInterState,
      })
    );
    const totals = headerTotals(computed, { discountPaise: d.discountPaise, roundOffPaise: d.roundOffPaise });

    // Landed cost apportionment across accepted quantities
    const totalNetPaise = totals.netAmountPaise;
    const totalAcceptedQty = d.lines.reduce((sum, l) => sum + (l.acceptedQty || 0), 0);
    const landedChargesPaise = d.landedChargesPaise ?? 0;

    const lineValuationRates = d.lines.map((l, i) => {
      if (landedChargesPaise > 0 && l.acceptedQty > 0) {
        let lineLandedPaise = 0;
        if (totalNetPaise > 0) {
          lineLandedPaise = Math.round((computed[i].netAmountPaise / totalNetPaise) * landedChargesPaise);
        } else if (totalAcceptedQty > 0) {
          lineLandedPaise = Math.round((l.acceptedQty / totalAcceptedQty) * landedChargesPaise);
        }
        const landedPerUnitPaise = Math.round(lineLandedPaise / l.acceptedQty);
        return l.ratePaise + landedPerUnitPaise;
      }
      return l.ratePaise;
    });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [grn] = await tx.insert(goodsReceiptNotes).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any, supplierId: d.supplierId, poId: d.poId,
        warehouseId: d.warehouseId, supplierDcNo: d.supplierDcNo, supplierDcDate: d.supplierDcDate as any,
        gateEntryNo: d.gateEntryNo, vehicleNo: d.vehicleNo, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(goodsReceiptNoteLines).values(
        d.lines.map((l, i) => ({
          grnId: grn.id, lineNumber: i + 1, poLineId: l.poLineId, itemId: l.itemId, description: l.description,
          receivedQty: l.receivedQty.toString(), acceptedQty: l.acceptedQty.toString(), rejectedQty: String(l.rejectedQty ?? 0),
          uom: l.uom,
          secondaryQty: (l as any).secondaryQty != null ? (l as any).secondaryQty.toString() : null,
          secondaryUom: (l as any).secondaryUom ?? null,
          ratePaise: l.ratePaise, valuationRatePaise: lineValuationRates[i], netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode, taxAmountPaise: computed[i].taxAmountPaise,
          totalAmountPaise: computed[i].totalAmountPaise, warehouseId: l.warehouseId ?? d.warehouseId,
          batchId: l.batchId, batchNumber: l.batchNumber, rejectionReason: l.rejectionReason,
          custom_data: {
            landedChargesAllocatedPaise: (lineValuationRates[i] - l.ratePaise) * l.acceptedQty,
            landedRatePerUnitPaise: lineValuationRates[i] - l.ratePaise,
          },
        }))
      );
      await app.auditEngine.logCreate(
        { companyId: tenant(request).companyId, documentType: DOC, documentId: grn.id, documentNumber, performedBy: userId(request) },
        grn, { tx }
      );
      return grn;
    });
    return reply.code(201).send(created);
  });

  app.get('/grns', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.grn.view')],
  }, async (request) => listHeaders(request, goodsReceiptNotes, 'purchase.grn'));

  app.get('/grns/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.grn.view')],
  }, async (request, reply) => getWithLines(request, reply, goodsReceiptNotes, goodsReceiptNoteLines, goodsReceiptNoteLines.grnId, request.params as { id: string }, 'purchase.grn'));

  simpleTransition(app, { route: '/grns/:id/submit', table: goodsReceiptNotes, docType: DOC, to: 'submitted', perm: 'purchase.grn.submit' });

  // Approve → post stock (purchase_receipt) + GL (purchase.grn), then update PO receipt status.
  app.post('/grns/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.grn.submit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [grn] = await db.select().from(goodsReceiptNotes)
      .where(byTenantId(goodsReceiptNotes, id, cid)).limit(1);
    if (!grn) return reply.code(404).send({ error: 'GRN not found' });
    if (grn.status !== 'submitted') return reply.code(409).send({ error: `GRN must be submitted (is '${grn.status}')` });

    const [req] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending'))).limit(1);

    if (!req && !app.permissionService.validateMakerChecker(uid, grn.createdBy, grn.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, id));

    try {
      const result = await db.transaction(async (tx) => {
        if (req) {
          const actRes = await app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, { skipFinalizeDoc: true, companyId: cid, bypassSod });
          if (!('finalized' in actRes)) {
            return { status: 'submitted', detail: actRes };
          }
        }

        // 0. Over-receipt guard with row-level locks on PO lines
        for (const l of lines) {
          if (l.poLineId) {
            const [lockedPoLine] = await tx
              .select({
                id: purchaseOrderLines.id,
                quantity: purchaseOrderLines.quantity,
                receivedQty: purchaseOrderLines.receivedQty,
                shortClosedQty: purchaseOrderLines.shortClosedQty,
                description: purchaseOrderLines.description,
              })
              .from(purchaseOrderLines)
              .where(eq(purchaseOrderLines.id, l.poLineId))
              .for('update');

            if (lockedPoLine) {
              const remaining = Math.max(0, parseFloat(lockedPoLine.quantity) - parseFloat(lockedPoLine.receivedQty) - parseFloat(lockedPoLine.shortClosedQty || '0'));
              if (parseFloat(l.acceptedQty) > remaining + 1e-6) {
                throw new Error(`Over-receipt error: Cannot accept ${l.acceptedQty} for item '${l.description || lockedPoLine.description}'. Remaining quantity on PO line is ${remaining}.`);
              }
            }
          }
        }

        // 1. Stock IN at landed cost
        await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: grn.plantId, warehouseId: l.warehouseId ?? grn.warehouseId,
          itemId: l.itemId, movementType: 'purchase_receipt' as const,
          quantity: parseFloat(l.acceptedQty), uom: l.uom,
          valuationRatePaise: (l.valuationRatePaise && l.valuationRatePaise > 0) ? l.valuationRatePaise : l.ratePaise,
          documentType: DOC, documentId: grn.id, documentNumber: grn.documentNumber, documentLineNumber: l.lineNumber,
          batchId: l.batchId ?? undefined, postingDate: new Date(grn.postingDate), createdBy: uid,
        })));

        // 1b. Auto-update Last Purchase Rate in Item Master (atomic with GRN approval)
        for (const l of lines) {
          const effectiveRate = (l.valuationRatePaise && l.valuationRatePaise > 0) ? l.valuationRatePaise : l.ratePaise;
          if (effectiveRate > 0) {
            await tx.update(items)
              .set({ purchaseRatePaise: effectiveRate, updatedAt: new Date() })
              .where(and(eq(items.id, l.itemId), eq(items.companyId, cid)));
          }
        }

        // 2. GL post (DR inventory + input GST / CR GR-IR clearing)
        const { fiscalYear, period } = fiscalPeriod(new Date(grn.postingDate));
        const ctx: PostingContext = {
          companyId: cid, plantId: grn.plantId, documentType: DOC, documentId: grn.id,
          documentNumber: grn.documentNumber, postingDate: new Date(grn.postingDate), fiscalYear, period,
          header: { supplierId: grn.supplierId },
          lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: grnTaxLines(lines),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // 3. Status → approved (terminal for GRN), stamp journal entry id
        await applyTransition(app, {
          client: tx, table: goodsReceiptNotes, docType: DOC, id: grn.id, companyId: cid,
          documentNumber: grn.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: { journalEntryId: jeId },
        });

        // 4. Update PO line receivedQty + PO receipt status
        if (grn.poId) {
          for (const l of lines) {
            if (l.poLineId) {
              await tx.update(purchaseOrderLines)
                .set({ receivedQty: sql`${purchaseOrderLines.receivedQty} + ${parseFloat(l.acceptedQty)}` })
                .where(eq(purchaseOrderLines.id, l.poLineId));
            }
          }

          const poLines = await tx
            .select({
              quantity: purchaseOrderLines.quantity,
              receivedQty: purchaseOrderLines.receivedQty,
              shortClosedQty: purchaseOrderLines.shortClosedQty,
            })
            .from(purchaseOrderLines)
            .where(eq(purchaseOrderLines.poId, grn.poId));

          const allReceived = poLines.length > 0 && poLines.every(
            (pl) => (parseFloat(pl.receivedQty) + parseFloat(pl.shortClosedQty || '0')) >= parseFloat(pl.quantity)
          );
          const anyReceived = poLines.some(
            (pl) => parseFloat(pl.receivedQty) > 0
          );
          const poReceiptStatus = allReceived ? 'fully_received' : (anyReceived ? 'partial' : 'not_received');

          await tx.update(purchaseOrders)
            .set({ receiptStatus: poReceiptStatus, updatedAt: new Date() })
            .where(byTenantId(purchaseOrders, grn.poId, cid));
        }
        return { status: 'approved', journalEntryId: jeId };
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'GRN approval failed', detail: (err as Error).message });
    }
  });
}

function grnTaxLines(lines: Array<{ cgstAmountPaise?: number; sgstAmountPaise?: number; igstAmountPaise?: number; taxAmountPaise: number; netAmountPaise: number }>): TaxLine[] {
  const cgst = lines.reduce((s, l) => s + (l.cgstAmountPaise || 0), 0);
  const sgst = lines.reduce((s, l) => s + (l.sgstAmountPaise || 0), 0);
  const igst = lines.reduce((s, l) => s + (l.igstAmountPaise || 0), 0);
  const base = lines.reduce((s, l) => s + l.netAmountPaise, 0);

  const res: TaxLine[] = [];
  if (cgst > 0) res.push({ taxCode: 'CGST', taxType: 'cgst', baseAmountPaise: base, taxAmountPaise: cgst });
  if (sgst > 0) res.push({ taxCode: 'SGST', taxType: 'sgst', baseAmountPaise: base, taxAmountPaise: sgst });
  if (igst > 0) res.push({ taxCode: 'IGST', taxType: 'igst', baseAmountPaise: base, taxAmountPaise: igst });
  
  if (res.length === 0) {
    const tax = lines.reduce((s, l) => s + l.taxAmountPaise, 0);
    if (tax > 0) res.push({ taxCode: 'GST', taxType: 'igst', baseAmountPaise: base, taxAmountPaise: tax });
  }
  return res;
}

// ════════════════════════════════════════════════════════════════════════════
// Landed Cost Vouchers (GAP 3) — Freight / Customs Capitalization
// ════════════════════════════════════════════════════════════════════════════

function registerLandedCostVouchers(app: FastifyInstance) {
  const DOC = 'purchase.lcv';

  app.get('/landed-cost-vouchers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.lcv.view')],
  }, async (request, reply) => {
    const cid = tenant(request).companyId;
    const rows = await db
      .select({
        id: landedCostVouchers.id,
        documentNumber: landedCostVouchers.documentNumber,
        status: landedCostVouchers.status,
        postingDate: landedCostVouchers.postingDate,
        allocationBasis: landedCostVouchers.allocationBasis,
        totalChargesPaise: landedCostVouchers.totalChargesPaise,
        remarks: landedCostVouchers.remarks,
        journalEntryId: landedCostVouchers.journalEntryId,
        createdAt: landedCostVouchers.createdAt,
      })
      .from(landedCostVouchers)
      .where(eq(landedCostVouchers.companyId, cid))
      .orderBy(desc(landedCostVouchers.createdAt));

    return reply.send(rows);
  });

  app.get('/landed-cost-vouchers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.lcv.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [lcv] = await db
      .select()
      .from(landedCostVouchers)
      .where(byTenantId(landedCostVouchers, id, cid))
      .limit(1);
    if (!lcv) return reply.code(404).send({ error: 'Landed cost voucher not found' });

    const [applicableGrns, expenseLines, allocatedItems] = await Promise.all([
      db
        .select({
          id: lcvApplicableGrns.id,
          grnId: lcvApplicableGrns.grnId,
          documentNumber: goodsReceiptNotes.documentNumber,
          postingDate: goodsReceiptNotes.postingDate,
          supplierName: suppliers.name,
          grnAmountPaise: lcvApplicableGrns.grnAmountPaise,
          allocatedChargesPaise: lcvApplicableGrns.allocatedChargesPaise,
        })
        .from(lcvApplicableGrns)
        .leftJoin(goodsReceiptNotes, eq(lcvApplicableGrns.grnId, goodsReceiptNotes.id))
        .leftJoin(suppliers, eq(goodsReceiptNotes.supplierId, suppliers.id))
        .where(eq(lcvApplicableGrns.lcvId, id)),
      db
        .select({
          id: lcvExpenseLines.id,
          expenseAccountId: lcvExpenseLines.expenseAccountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          description: lcvExpenseLines.description,
          amountPaise: lcvExpenseLines.amountPaise,
        })
        .from(lcvExpenseLines)
        .leftJoin(chartOfAccounts, eq(lcvExpenseLines.expenseAccountId, chartOfAccounts.id))
        .where(eq(lcvExpenseLines.lcvId, id)),
      db
        .select({
          id: lcvAllocatedItems.id,
          grnId: lcvAllocatedItems.grnId,
          grnNumber: goodsReceiptNotes.documentNumber,
          itemId: lcvAllocatedItems.itemId,
          itemCode: items.itemCode,
          itemName: items.itemName,
          warehouseId: lcvAllocatedItems.warehouseId,
          quantity: lcvAllocatedItems.quantity,
          lineAmountPaise: lcvAllocatedItems.lineAmountPaise,
          allocatedChargePaise: lcvAllocatedItems.allocatedChargePaise,
          absorbedPaise: lcvAllocatedItems.absorbedPaise,
          cogsVariancePaise: lcvAllocatedItems.cogsVariancePaise,
          sleId: lcvAllocatedItems.sleId,
        })
        .from(lcvAllocatedItems)
        .leftJoin(goodsReceiptNotes, eq(lcvAllocatedItems.grnId, goodsReceiptNotes.id))
        .leftJoin(items, eq(lcvAllocatedItems.itemId, items.id))
        .where(eq(lcvAllocatedItems.lcvId, id)),
    ]);

    return reply.send({ ...lcv, applicableGrns, expenseLines, allocatedItems });
  });

  app.post('/landed-cost-vouchers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.lcv.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = lcvCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertAllOwned(goodsReceiptNotes, d.applicableGrnIds, cid, 'GRN'),
      assertAllOwned(chartOfAccounts, d.expenseLines.map((e) => e.expenseAccountId), cid, 'Expense account'),
    ]);

    const totalChargesPaise = d.expenseLines.reduce((sum, e) => sum + e.amountPaise, 0);
    if (totalChargesPaise <= 0) {
      return reply.code(400).send({ error: 'Total landed charges must be greater than zero' });
    }

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const grnRows = await db
      .select({
        id: goodsReceiptNotes.id,
        warehouseId: goodsReceiptNotes.warehouseId,
        documentNumber: goodsReceiptNotes.documentNumber,
        netAmountPaise: goodsReceiptNotes.netAmountPaise,
        totalAmountPaise: goodsReceiptNotes.totalAmountPaise,
      })
      .from(goodsReceiptNotes)
      .where(and(inArray(goodsReceiptNotes.id, d.applicableGrnIds), eq(goodsReceiptNotes.companyId, cid)));

    const grnMap = new Map(grnRows.map((g) => [g.id, g]));

    const grnLines = await db
      .select({
        id: goodsReceiptNoteLines.id,
        grnId: goodsReceiptNoteLines.grnId,
        itemId: goodsReceiptNoteLines.itemId,
        warehouseId: goodsReceiptNoteLines.warehouseId,
        quantity: goodsReceiptNoteLines.acceptedQty,
        uom: goodsReceiptNoteLines.uom,
        netAmountPaise: goodsReceiptNoteLines.netAmountPaise,
        ratePaise: goodsReceiptNoteLines.ratePaise,
      })
      .from(goodsReceiptNoteLines)
      .where(inArray(goodsReceiptNoteLines.grnId, d.applicableGrnIds));

    const totalBasis = grnLines.reduce((acc, l) => {
      const val = d.allocationBasis === 'by_qty' ? parseFloat(l.quantity) : l.netAmountPaise;
      return acc + val;
    }, 0);

    if (totalBasis <= 0) {
      return reply.code(400).send({ error: 'Applicable GRNs contain zero quantity or amount to allocate against' });
    }

    let allocatedSum = 0;
    const itemAllocations = grnLines.map((l, idx) => {
      const isLast = idx === grnLines.length - 1;
      const basis = d.allocationBasis === 'by_qty' ? parseFloat(l.quantity) : l.netAmountPaise;
      const share = isLast
        ? totalChargesPaise - allocatedSum
        : Math.floor((basis / totalBasis) * totalChargesPaise);
      allocatedSum += share;
      const resolvedWarehouseId = l.warehouseId ?? grnMap.get(l.grnId)?.warehouseId!;
      return {
        ...l,
        warehouseId: resolvedWarehouseId,
        allocatedChargePaise: share,
      };
    });

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, cid, DOC, { fiscalYear, plantId: d.plantId });
      const [lcv] = await tx
        .insert(landedCostVouchers)
        .values({
          companyId: cid,
          plantId: d.plantId,
          documentNumber,
          status: 'draft',
          fiscalYear,
          postingDate: d.postingDate as any,
          allocationBasis: d.allocationBasis,
          totalChargesPaise,
          remarks: d.remarks,
          custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
          createdBy: userId(request),
        })
        .returning();

      await tx.insert(lcvApplicableGrns).values(
        grnRows.map((g) => {
          const grnItemCharges = itemAllocations
            .filter((item) => item.grnId === g.id)
            .reduce((s, item) => s + item.allocatedChargePaise, 0);
          return {
            lcvId: lcv.id,
            grnId: g.id,
            grnAmountPaise: g.totalAmountPaise,
            allocatedChargesPaise: grnItemCharges,
          };
        })
      );

      await tx.insert(lcvExpenseLines).values(
        d.expenseLines.map((e) => ({
          lcvId: lcv.id,
          expenseAccountId: e.expenseAccountId,
          description: e.description,
          amountPaise: e.amountPaise,
        }))
      );

      await tx.insert(lcvAllocatedItems).values(
        itemAllocations.map((item) => ({
          lcvId: lcv.id,
          grnId: item.grnId,
          grnLineId: item.id,
          itemId: item.itemId,
          warehouseId: item.warehouseId,
          quantity: item.quantity,
          lineAmountPaise: item.netAmountPaise,
          allocatedChargePaise: item.allocatedChargePaise,
          absorbedPaise: 0,
          cogsVariancePaise: 0,
        }))
      );

      await app.auditEngine.logCreate(
        { companyId: cid, documentType: DOC, documentId: lcv.id, documentNumber, performedBy: userId(request) },
        lcv,
        { tx }
      );
      return lcv;
    });

    return reply.code(201).send(created);
  });

  app.post('/landed-cost-vouchers/:id/post', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.lcv.post')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const uid = userId(request);

    const [lcv] = await db
      .select()
      .from(landedCostVouchers)
      .where(byTenantId(landedCostVouchers, id, cid))
      .limit(1);

    if (!lcv) return reply.code(404).send({ error: 'Landed cost voucher not found' });
    if (lcv.status !== 'draft') return reply.code(409).send({ error: `LCV is already ${lcv.status}` });

    const [expenseLines, allocatedRows] = await Promise.all([
      db.select().from(lcvExpenseLines).where(eq(lcvExpenseLines.lcvId, id)),
      db.select().from(lcvAllocatedItems).where(eq(lcvAllocatedItems.lcvId, id)),
    ]);

    const itemIds = [...new Set(allocatedRows.map((r) => r.itemId))];
    const itemRows = itemIds.length > 0
      ? await db.select({ id: items.id, uom: items.primaryUom }).from(items).where(inArray(items.id, itemIds))
      : [];
    const itemUomMap = new Map(itemRows.map((i) => [i.id, i.uom]));

    try {
      const result = await db.transaction(async (tx) => {
        let totalAbsorbed = 0;
        let totalCogsVariance = 0;

      for (const row of allocatedRows) {
        const [balance] = await tx
          .select()
          .from(stockBalances)
          .where(
            and(
              eq(stockBalances.companyId, cid),
              eq(stockBalances.warehouseId, row.warehouseId),
              eq(stockBalances.itemId, row.itemId)
            )
          )
          .for('update');

        const currentQty = parseFloat(balance?.quantityOnHand ?? '0');
        let sleId: string | null = null;
        let absorbed = 0;
        let variance = 0;

        if (currentQty > 0 && row.allocatedChargePaise > 0) {
          absorbed = row.allocatedChargePaise;
          totalAbsorbed += absorbed;

          const posted = await app.stockLedger.post(tx, {
            companyId: cid,
            plantId: lcv.plantId,
            warehouseId: row.warehouseId,
            itemId: row.itemId,
            movementType: 'adjustment_in',
            quantity: 0,
            uom: itemUomMap.get(row.itemId) || 'NOS',
            valuationAmountPaise: absorbed,
            valuationRatePaise: 0,
            documentType: DOC,
            documentId: lcv.id,
            documentNumber: lcv.documentNumber,
            postingDate: new Date(lcv.postingDate),
            remarks: `LCV landed cost: ${lcv.documentNumber}`,
            createdBy: uid,
          });
          sleId = posted.sle.id;
        } else {
          variance = row.allocatedChargePaise;
          totalCogsVariance += variance;
        }

        await tx
          .update(lcvAllocatedItems)
          .set({
            absorbedPaise: absorbed,
            cogsVariancePaise: variance,
            sleId: sleId ?? undefined,
          })
          .where(eq(lcvAllocatedItems.id, row.id));
      }

      const { fiscalYear, period } = fiscalPeriod(new Date(lcv.postingDate));
      const postCtx: PostingContext = {
        companyId: cid,
        plantId: lcv.plantId,
        documentType: DOC,
        documentId: lcv.id,
        documentNumber: lcv.documentNumber,
        postingDate: new Date(lcv.postingDate),
        fiscalYear,
        period,
        header: {
          absorbedPaise: totalAbsorbed,
          cogsVariancePaise: totalCogsVariance,
          expenseLines: expenseLines.map((e) => ({
            accountId: e.expenseAccountId,
            amountPaise: e.amountPaise,
            description: e.description,
          })),
        },
        lines: [],
      };

      const jeId = await app.postingEngine.post(tx, postCtx, uid);

      await tx
        .update(landedCostVouchers)
        .set({
          status: 'approved',
          journalEntryId: jeId,
          updatedAt: new Date(),
          updatedBy: uid,
        })
        .where(eq(landedCostVouchers.id, lcv.id));

      await app.auditEngine.logTransition(
        { companyId: cid, documentType: DOC, documentId: lcv.id, documentNumber: lcv.documentNumber, performedBy: uid },
        'draft',
        { toStatus: 'approved', stampFields: {} },
        'LCV posted and approved',
        { tx }
      );

      return { status: 'approved', journalEntryId: jeId, totalAbsorbed, totalCogsVariance };
    });

    return reply.send({ ok: true, ...result });
    } catch (err: any) {
      return reply.code(409).send({ error: 'LCV post failed', detail: err.message });
    }
  });

  simpleTransition(app, { route: '/landed-cost-vouchers/:id/cancel', table: landedCostVouchers, docType: DOC, to: 'cancelled', perm: 'purchase.lcv.cancel' });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Invoices  (approval → GL)
// ════════════════════════════════════════════════════════════════════════════

function registerInvoices(app: FastifyInstance) {
  const DOC = 'purchase.invoice';

  app.post('/invoices', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.invoice.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchaseInvoiceCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    // #14: Prevent duplicate supplier invoice numbers for the same supplier
    if (d.supplierInvoiceNumber) {
      const [existing] = await db
        .select({ id: purchaseInvoices.id, documentNumber: purchaseInvoices.documentNumber })
        .from(purchaseInvoices)
        .where(
          and(
            eq(purchaseInvoices.companyId, cid),
            eq(purchaseInvoices.supplierId, d.supplierId),
            eq(purchaseInvoices.supplierInvoiceNumber, d.supplierInvoiceNumber),
            sql`${purchaseInvoices.status} != 'cancelled'`
          )
        )
        .limit(1);
      if (existing) {
        return reply.code(409).send({
          error: `Duplicate supplier invoice: invoice '${d.supplierInvoiceNumber}' already exists for this supplier (Document ${existing.documentNumber}).`,
        });
      }
    }

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertOwned(purchaseOrders, d.poId, cid, 'Purchase order'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId), cid, 'Tax code'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const [plant] = await db.select({ gstin: plants.gstin }).from(plants).where(eq(plants.id, d.plantId));
    const [supplier] = await db.select({ gstin: suppliers.gstin, stateCode: suppliers.stateCode }).from(suppliers).where(eq(suppliers.id, d.supplierId));
    const plantState = (plant?.gstin ?? '').slice(0, 2);
    const supplierState = (supplier?.gstin ? supplier.gstin.slice(0, 2) : (supplier?.stateCode ?? plantState));
    const isInterState = d.placeOfSupply ? d.placeOfSupply !== plantState : Boolean(plantState && supplierState && plantState !== supplierState);

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
      const [inv] = await tx.insert(purchaseInvoices).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, supplierId: d.supplierId, poId: d.poId,
        supplierInvoiceNumber: d.supplierInvoiceNumber, supplierInvoiceDate: d.supplierInvoiceDate as any,
        dueDate: d.dueDate as any, placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge,
        supplierIrn: d.supplierIrn, itcEligible: d.itcEligible, remarks: d.remarks,
        custom_data: (d as any).customData ?? (d as any).custom_data ?? {},
        netAmountPaise: totals.netAmountPaise, discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise, roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(purchaseInvoiceLines).values(
        d.lines.map((l, i) => ({
          invoiceId: inv.id, lineNumber: i + 1, poLineId: l.poLineId, grnLineId: l.grnLineId, itemId: l.itemId,
          description: l.description, quantity: l.quantity.toString(), uom: l.uom, ratePaise: l.ratePaise,
          discountPaise: computed[i].discountPaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode,
          cgstAmountPaise: computed[i].cgstAmountPaise, sgstAmountPaise: computed[i].sgstAmountPaise,
          igstAmountPaise: computed[i].igstAmountPaise, cessAmountPaise: computed[i].cessAmountPaise,
          taxAmountPaise: computed[i].taxAmountPaise, totalAmountPaise: computed[i].totalAmountPaise,
        }))
      );
      await app.auditEngine.logCreate(
        { companyId: tenant(request).companyId, documentType: DOC, documentId: inv.id, documentNumber, performedBy: userId(request) },
        inv, { tx }
      );
      return inv;
    });
    return reply.code(201).send(created);
  });

  app.get('/invoices', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.invoice.view')],
  }, async (request) => listHeaders(request, purchaseInvoices, 'purchase.invoice'));

  app.get('/invoices/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.invoice.view')],
  }, async (request, reply) => getWithLines(request, reply, purchaseInvoices, purchaseInvoiceLines, purchaseInvoiceLines.invoiceId, request.params as { id: string }, 'purchase.invoice'));

  simpleTransition(app, { route: '/invoices/:id/submit', table: purchaseInvoices, docType: DOC, to: 'submitted', perm: 'purchase.invoice.create' });

  // Approve → post GL (DR GR-IR / CR AP)
  app.post('/invoices/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.invoice.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [inv] = await db.select().from(purchaseInvoices)
      .where(byTenantId(purchaseInvoices, id, cid)).limit(1);
    if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status !== 'submitted') return reply.code(409).send({ error: `Invoice must be submitted (is '${inv.status}')` });

    const [req] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending'))).limit(1);

    if (!req && !app.permissionService.validateMakerChecker(uid, inv.createdBy, inv.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, id));

    try {
      const result = await db.transaction(async (tx) => {
        if (req) {
          const actRes = await app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, { skipFinalizeDoc: true, companyId: cid, bypassSod });
          if (!('finalized' in actRes)) {
            return { status: 'submitted', detail: actRes };
          }
        }
        const { fiscalYear, period } = fiscalPeriod(new Date(inv.postingDate));
        const ctx: PostingContext = {
          companyId: cid, plantId: inv.plantId, documentType: DOC, documentId: inv.id,
          documentNumber: inv.documentNumber, postingDate: new Date(inv.postingDate), fiscalYear, period,
          header: { supplierId: inv.supplierId },
          lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: invoiceTaxLines(lines),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);
        await applyTransition(app, {
          client: tx, table: purchaseInvoices, docType: DOC, id: inv.id, companyId: cid,
          documentNumber: inv.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: { journalEntryId: jeId },
        });
        // 1. Update billedQty on PO lines and GRN lines
        for (const l of lines) {
          if (l.poLineId) {
            await tx.update(purchaseOrderLines)
              .set({ billedQty: sql`${purchaseOrderLines.billedQty} + ${parseFloat(l.quantity)}` })
              .where(eq(purchaseOrderLines.id, l.poLineId));
          }
          if (l.grnLineId) {
            await tx.update(goodsReceiptNoteLines)
              .set({ billedQty: sql`${goodsReceiptNoteLines.billedQty} + ${parseFloat(l.quantity)}` })
              .where(eq(goodsReceiptNoteLines.id, l.grnLineId));
          }
        }

        // 2. Compute and update PO billingStatus
        if (inv.poId) {
          const poLines = await tx
            .select({
              quantity: purchaseOrderLines.quantity,
              billedQty: purchaseOrderLines.billedQty,
              shortClosedQty: purchaseOrderLines.shortClosedQty,
            })
            .from(purchaseOrderLines)
            .where(eq(purchaseOrderLines.poId, inv.poId));

          const allBilled = poLines.length > 0 && poLines.every(
            (pl) => (parseFloat(pl.billedQty) + parseFloat(pl.shortClosedQty || '0')) >= parseFloat(pl.quantity)
          );
          const anyBilled = poLines.some(
            (pl) => parseFloat(pl.billedQty) > 0
          );
          const poBillingStatus = allBilled ? 'fully_billed' : (anyBilled ? 'partial' : 'not_billed');

          await tx.update(purchaseOrders)
            .set({ billingStatus: poBillingStatus, updatedAt: new Date() })
            .where(byTenantId(purchaseOrders, inv.poId, cid));
        }

        // 3. Compute and update GRN billingStatus for affected GRNs
        const billedGrnLineIds = lines.map((l) => l.grnLineId).filter(Boolean) as string[];
        if (billedGrnLineIds.length > 0) {
          const grnLineRows = await tx
            .select({ grnId: goodsReceiptNoteLines.grnId })
            .from(goodsReceiptNoteLines)
            .where(inArray(goodsReceiptNoteLines.id, billedGrnLineIds));
          const uniqueGrnIds = [...new Set(grnLineRows.map((r) => r.grnId))];

          for (const grnId of uniqueGrnIds) {
            const allLines = await tx
              .select({ acceptedQty: goodsReceiptNoteLines.acceptedQty, billedQty: goodsReceiptNoteLines.billedQty })
              .from(goodsReceiptNoteLines)
              .where(eq(goodsReceiptNoteLines.grnId, grnId));

            const allBilled = allLines.length > 0 && allLines.every(
              (gl) => parseFloat(gl.billedQty) >= parseFloat(gl.acceptedQty)
            );
            const anyBilled = allLines.some(
              (gl) => parseFloat(gl.billedQty) > 0
            );
            const grnBillingStatus = allBilled ? 'fully_billed' : (anyBilled ? 'partial' : 'not_billed');

            await tx.update(goodsReceiptNotes)
              .set({ billingStatus: grnBillingStatus, updatedAt: new Date() })
              .where(byTenantId(goodsReceiptNotes, grnId, cid));
          }
        }
        return { status: 'approved', journalEntryId: jeId };
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Invoice approval failed', detail: (err as Error).message });
    }
  });
}

function invoiceTaxLines(lines: Array<{ netAmountPaise: number; cgstAmountPaise: number; sgstAmountPaise: number; igstAmountPaise: number }>): TaxLine[] {
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

// ════════════════════════════════════════════════════════════════════════════
// Purchase Payments  (approval → GL + invoice allocation)
// ════════════════════════════════════════════════════════════════════════════

function registerPayments(app: FastifyInstance) {
  const DOC = 'purchase.payment';

  app.post('/payments', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.payment.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchasePaymentCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertAllOwned(purchaseInvoices, d.allocations.map((a) => a.invoiceId), cid, 'Invoice'),
    ]);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const allocated = d.allocations.reduce((s, a) => s + a.allocatedAmountPaise, 0);
    if (allocated > d.paidAmountPaise) {
      return reply.code(400).send({ error: 'Allocated amount exceeds paid amount' });
    }

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [pay] = await tx.insert(purchasePayments).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, supplierId: d.supplierId, paymentMode: d.paymentMode,
        instrumentNo: d.instrumentNo, instrumentDate: d.instrumentDate as any, bankReference: d.bankReference,
        paidAmountPaise: d.paidAmountPaise, allocatedAmountPaise: allocated,
        unallocatedAmountPaise: d.paidAmountPaise - allocated, tdsAmountPaise: d.tdsAmountPaise,
        totalAmountPaise: d.paidAmountPaise, remarks: d.remarks, createdBy: userId(request),
      }).returning();
      if (d.allocations.length > 0) {
        await tx.insert(purchasePaymentAllocations).values(
          d.allocations.map((a) => ({ paymentId: pay.id, invoiceId: a.invoiceId, allocatedAmountPaise: a.allocatedAmountPaise }))
        );
      }
      await app.auditEngine.logCreate(
        { companyId: tenant(request).companyId, documentType: DOC, documentId: pay.id, documentNumber, performedBy: userId(request) },
        pay, { tx }
      );
      return pay;
    });
    return reply.code(201).send(created);
  });

  app.get('/payments', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.payment.view')],
  }, async (request) => listHeaders(request, purchasePayments, 'purchase.payment'));

  app.get('/payments/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.payment.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(purchasePayments)
      .where(byTenantId(purchasePayments, id, tenant(request).companyId)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Payment not found' });
    const allocations = await db.select().from(purchasePaymentAllocations).where(eq(purchasePaymentAllocations.paymentId, id));
    const doc = { ...row, allocations };
    if (app.approvalEngine) {
      const [decorated] = await app.approvalEngine.decorateDocuments(row.companyId, userId(request), [doc], 'purchase.payment');
      return decorated;
    }
    return doc;
  });

  simpleTransition(app, { route: '/payments/:id/submit', table: purchasePayments, docType: DOC, to: 'submitted', perm: 'purchase.payment.create' });

  // Approve → post GL (DR AP / CR Bank) + apply allocations to invoices
  app.post('/payments/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.payment.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [pay] = await db.select().from(purchasePayments)
      .where(byTenantId(purchasePayments, id, cid)).limit(1);
    if (!pay) return reply.code(404).send({ error: 'Payment not found' });
    if (pay.status !== 'submitted') return reply.code(409).send({ error: `Payment must be submitted (is '${pay.status}')` });

    const [req] = await db.select().from(approvalRequests).where(and(eq(approvalRequests.documentId, id), eq(approvalRequests.status, 'pending'))).limit(1);

    if (!req && !app.permissionService.validateMakerChecker(uid, pay.createdBy, pay.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const allocations = await db.select().from(purchasePaymentAllocations).where(eq(purchasePaymentAllocations.paymentId, id));

    try {
      const result = await db.transaction(async (tx) => {
        if (req) {
          const actRes = await app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, { skipFinalizeDoc: true, companyId: cid, bypassSod });
          if (!('finalized' in actRes)) {
            return { status: 'submitted', detail: actRes };
          }
        }
        const { fiscalYear, period } = fiscalPeriod(new Date(pay.postingDate));
        const ctx: PostingContext = {
          companyId: cid, plantId: pay.plantId, documentType: DOC, documentId: pay.id,
          documentNumber: pay.documentNumber, postingDate: new Date(pay.postingDate), fiscalYear, period,
          header: { supplierId: pay.supplierId, amountPaise: pay.paidAmountPaise, paymentMode: pay.paymentMode },
          lines: [],
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);
        await applyTransition(app, {
          client: tx, table: purchasePayments, docType: DOC, id: pay.id, companyId: cid,
          documentNumber: pay.documentNumber, fromStatus: 'submitted', toStatus: 'approved',
          userId: uid, remarks, extraSet: { journalEntryId: jeId },
        });
        // Apply allocations: bump invoice paidAmount + payment status
        for (const a of allocations) {
          // Only allocate against an invoice in the same tenant.
          const [inv] = await tx.select().from(purchaseInvoices)
            .where(byTenantId(purchaseInvoices, a.invoiceId, cid)).limit(1);
          if (!inv) continue;
          const newPaid = inv.paidAmountPaise + a.allocatedAmountPaise;
          const status = newPaid >= inv.totalAmountPaise ? 'paid' : 'partial';
          await tx.update(purchaseInvoices)
            .set({ paidAmountPaise: newPaid, paymentStatus: status, updatedAt: new Date() })
            .where(byTenantId(purchaseInvoices, a.invoiceId, cid));
        }
        return { status: 'approved', journalEntryId: jeId };
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Payment approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Returns (Return to Vendor)
// ════════════════════════════════════════════════════════════════════════════

function registerReturns(app: FastifyInstance) {
  const DOC = 'purchase.return';

  app.post('/returns', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.return.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchaseReturnCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      assertOwned(warehouses, d.warehouseId, cid, 'Warehouse'),
      d.grnId ? assertOwned(goodsReceiptNotes, d.grnId, cid, 'GRN') : Promise.resolve(),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(taxCodes, d.lines.map((l) => l.taxCodeId).filter(Boolean) as string[], cid, 'Tax code'),
    ]);

    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

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
      const [ret] = await tx.insert(purchaseReturns).values({
        companyId: cid,
        plantId: d.plantId,
        documentNumber,
        status: 'draft',
        fiscalYear,
        postingDate: d.postingDate as any,
        supplierId: d.supplierId,
        grnId: d.grnId,
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

      await tx.insert(purchaseReturnLines).values(
        d.lines.map((l, i) => ({
          returnId: ret.id,
          lineNumber: i + 1,
          grnLineId: l.grnLineId,
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity.toString(),
          uom: l.uom,
          ratePaise: l.ratePaise,
          netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId,
          taxAmountPaise: computed[i].taxAmountPaise,
          totalAmountPaise: computed[i].totalAmountPaise,
          warehouseId: l.warehouseId ?? d.warehouseId,
          batchId: l.batchId,
        }))
      );

      await app.auditEngine.logCreate({
        companyId: cid,
        documentType: DOC,
        documentId: ret.id,
        documentNumber,
        performedBy: userId(request),
      }, ret, { tx });

      return ret;
    });

    return reply.code(201).send(created);
  });

  app.get('/returns', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.return.view')],
  }, async (request) => listHeaders(request, purchaseReturns, DOC));

  app.get('/returns/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.return.view')],
  }, async (request, reply) => getWithLines(request, reply, purchaseReturns, purchaseReturnLines, purchaseReturnLines.returnId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/returns/:id/submit', table: purchaseReturns, docType: DOC, to: 'submitted', perm: 'purchase.return.create' });

  // Approve → Stock OUT (return_to_vendor) + GL post (DR GR/IR Clearing / CR Inventory)
  app.post('/returns/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.return.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [ret] = await db.select().from(purchaseReturns).where(byTenantId(purchaseReturns, id, cid)).limit(1);
    if (!ret) return reply.code(404).send({ error: 'Purchase Return not found' });
    if (ret.status !== 'submitted') return reply.code(409).send({ error: `Return must be submitted (is '${ret.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, ret.createdBy, ret.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        // 1. Stock OUT: movementType 'return_to_vendor'
        const posted = await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid,
          plantId: ret.plantId,
          warehouseId: l.warehouseId ?? ret.warehouseId,
          itemId: l.itemId,
          movementType: 'return_to_vendor' as const,
          quantity: parseFloat(l.quantity),
          uom: l.uom,
          valuationRatePaise: l.ratePaise,
          documentType: DOC,
          documentId: ret.id,
          documentNumber: ret.documentNumber,
          documentLineNumber: l.lineNumber,
          batchId: l.batchId ?? undefined,
          postingDate: new Date(ret.postingDate),
          createdBy: uid,
        })));

        // 2. Post GL Reversal entry
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
          header: { supplierId: ret.supplierId },
          lines: posted.map((p, i) => ({
            lineAmountPaise: p.sle.valuationAmountPaise || lines[i].netAmountPaise,
            itemDescription: lines[i]?.description,
          })),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // 3. Status transition to approved
        await applyTransition(app, {
          client: tx,
          table: purchaseReturns,
          docType: DOC,
          id: ret.id,
          companyId: cid,
          documentNumber: ret.documentNumber,
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
      return reply.code(409).send({ error: 'Purchase Return approval failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Debit Notes (Supplier Debit / AP & ITC Reversal)
// ════════════════════════════════════════════════════════════════════════════

function registerDebitNotes(app: FastifyInstance) {
  const DOC = 'purchase.debit_note';

  app.post('/debit-notes', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.debit_note.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchaseDebitNoteCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;

    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(suppliers, d.supplierId, cid, 'Supplier'),
      d.invoiceId ? assertOwned(purchaseInvoices, d.invoiceId, cid, 'Purchase invoice') : Promise.resolve(),
      d.returnId ? assertOwned(purchaseReturns, d.returnId, cid, 'Purchase return') : Promise.resolve(),
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
      const [dn] = await tx.insert(purchaseDebitNotes).values({
        companyId: cid,
        plantId: d.plantId,
        documentNumber,
        status: 'draft',
        fiscalYear,
        postingDate: d.postingDate as any,
        supplierId: d.supplierId,
        invoiceId: d.invoiceId,
        returnId: d.returnId,
        supplierDebitNoteNumber: d.supplierDebitNoteNumber,
        supplierDebitNoteDate: d.supplierDebitNoteDate as any,
        reason: d.reason,
        remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise,
        discountPaise: totals.discountPaise,
        taxAmountPaise: totals.taxAmountPaise,
        roundOffPaise: totals.roundOffPaise,
        totalAmountPaise: totals.totalAmountPaise,
        createdBy: userId(request),
      }).returning();

      await tx.insert(purchaseDebitNoteLines).values(
        d.lines.map((l, i) => ({
          debitNoteId: dn.id,
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

      await app.auditEngine.logCreate({ companyId: cid, documentType: DOC, documentId: dn.id, documentNumber, performedBy: userId(request) }, dn, { tx });
      return dn;
    });

    return reply.code(201).send(created);
  });

  app.get('/debit-notes', { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.debit_note.view')] },
    async (request) => listHeaders(request, purchaseDebitNotes, DOC));

  app.get('/debit-notes/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.debit_note.view')] },
    async (request, reply) => getWithLines(request, reply, purchaseDebitNotes, purchaseDebitNoteLines, purchaseDebitNoteLines.debitNoteId, request.params as { id: string }, DOC));

  simpleTransition(app, { route: '/debit-notes/:id/submit', table: purchaseDebitNotes, docType: DOC, to: 'submitted', perm: 'purchase.debit_note.submit' });

  // Approve → GL (DR Accounts Payable / CR Purchases & Input Tax) + adjust linked invoice balance
  app.post('/debit-notes/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.debit_note.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [dn] = await db.select().from(purchaseDebitNotes).where(byTenantId(purchaseDebitNotes, id, cid)).limit(1);
    if (!dn) return reply.code(404).send({ error: 'Debit note not found' });
    if (dn.status !== 'submitted') return reply.code(409).send({ error: `Debit note must be submitted (is '${dn.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, dn.createdBy, dn.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(purchaseDebitNoteLines).where(eq(purchaseDebitNoteLines.debitNoteId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        const { fiscalYear, period } = fiscalPeriod(new Date(dn.postingDate));
        const ctx: PostingContext = {
          companyId: cid,
          plantId: dn.plantId,
          documentType: DOC,
          documentId: dn.id,
          documentNumber: dn.documentNumber,
          postingDate: new Date(dn.postingDate),
          fiscalYear,
          period,
          header: { supplierId: dn.supplierId },
          lines: lines.map((l) => ({ lineAmountPaise: l.netAmountPaise, itemDescription: l.description })),
          taxLines: invoiceTaxLines(lines),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // Adjust linked purchase invoice paidAmount / balance if linked
        if (dn.invoiceId) {
          const [inv] = await tx.select().from(purchaseInvoices)
            .where(byTenantId(purchaseInvoices, dn.invoiceId, cid)).limit(1);
          if (inv) {
            const newPaid = inv.paidAmountPaise + dn.totalAmountPaise;
            const status = newPaid >= inv.totalAmountPaise ? 'paid' : 'partial';
            await tx.update(purchaseInvoices)
              .set({ paidAmountPaise: newPaid, paymentStatus: status, updatedAt: new Date() })
              .where(byTenantId(purchaseInvoices, dn.invoiceId, cid));
          }
        }

        await applyTransition(app, {
          client: tx,
          table: purchaseDebitNotes,
          docType: DOC,
          id: dn.id,
          companyId: cid,
          documentNumber: dn.documentNumber,
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
      return reply.code(409).send({ error: 'Debit note approval failed', detail: (err as Error).message });
    }
  });
}

// ─── Generic list / get / simple-transition helpers ─────────────────────────

async function listHeaders(request: FastifyRequest, table: any, docType?: string) {
  const cid = tenant(request).companyId;
  const q = request.query as Record<string, unknown>;
  const { page, pageSize, limit, offset } = paginate(q);
  const filters = [eq(table.companyId, cid)];
  if (q.status) filters.push(eq(table.status, String(q.status)));
  
  const rawData = await db.select({
    doc: table,
    creatorName: users.fullName,
  })
  .from(table)
  .leftJoin(users, eq(table.createdBy, users.id))
  .where(and(...filters))
  .orderBy(desc(table.createdAt))
  .limit(limit).offset(offset);

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

/** Registers a POST :route that performs a draft→submitted / submitted→approved etc. transition. */
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
    // Finding #3 fix: scope the document to the caller's company so a foreign
    // document id can never be transitioned/approved into this tenant.
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
          const res = await db.transaction((tx) => app.approvalEngine.act(tx, req.id, uid, cfg.to as 'approved' | 'rejected', remarks, { companyId: cid, bypassSod }));
          if ('finalized' in res) return reply.send({ ok: true, status: res.decision });
          return reply.send({ ok: true, status: 'submitted', detail: res });
        } catch (err) {
          return reply.code(409).send({ error: `Approval action failed: ${(err as Error).message}`, detail: (err as Error).message });
        }
      }

      // No engine - require base permission
      if (!hasBasePerm) {
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
