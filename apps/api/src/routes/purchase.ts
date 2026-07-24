import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  db,
  suppliers,
  purchaseRequisitions, purchaseRequisitionLines,
  purchaseOrders, purchaseOrderLines,
  goodsReceiptNotes, goodsReceiptNoteLines,
  purchaseInvoices, purchaseInvoiceLines,
  purchasePayments, purchasePaymentAllocations,
} from '@erp/db';
import {
  supplierCreateSchema, supplierUpdateSchema,
  prCreateSchema, poCreateSchema, grnCreateSchema,
  purchaseInvoiceCreateSchema, purchasePaymentCreateSchema,
  transitionSchema,
} from '@erp/shared';
import { authorize } from '../middleware/authorize.js';
import { resolveCompany, companyId } from '../middleware/company-context.js';
import { requireModule } from '../middleware/require-module.js';
import { fiscalPeriod, type PostingContext, type TaxLine } from '../services/posting-engine.js';
import type { DocumentStatus } from '../services/status-engine.js';

/**
 * Phase 6 — Purchase routes.  Mounted at /api/purchase (see index.ts).
 *
 * Chain: PR → PO → GRN → Invoice → Payment.
 * GRN approval posts stock (StockLedgerService) + GL (PostingEngine: purchase.grn).
 * Invoice / Payment approval post GL (purchase.invoice / purchase.payment).
 *
 * Every write resolves the company via resolveCompany and is gated by authorize()
 * against the seeded purchase.* permissions. Document numbers come from
 * NumberSeriesService (seed with seedPurchaseNumberSeries() first).
 */
export default async function purchaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireModule('purchase'));   // company must have the purchase module licensed
  registerSuppliers(app);
  registerRequisitions(app);
  registerOrders(app);
  registerGrns(app);
  registerInvoices(app);
  registerPayments(app);
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

/** Compute money for one line. qty/rate/discount all drive net; tax amounts are passed in. */
function computeLine(input: {
  quantity: number;
  ratePaise: number;
  discountPercent?: number;
  discountPaise?: number;
  cgstAmountPaise?: number;
  sgstAmountPaise?: number;
  igstAmountPaise?: number;
  cessAmountPaise?: number;
}): ComputedLine & { discountPaise: number } {
  const gross = Math.round(input.quantity * input.ratePaise);
  const discountPaise = input.discountPaise && input.discountPaise > 0
    ? input.discountPaise
    : Math.round((gross * (input.discountPercent ?? 0)) / 100);
  const netAmountPaise = gross - discountPaise;
  const cgst = input.cgstAmountPaise ?? 0;
  const sgst = input.sgstAmountPaise ?? 0;
  const igst = input.igstAmountPaise ?? 0;
  const cess = input.cessAmountPaise ?? 0;
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

/** Roll up computed lines into header totals. */
function headerTotals(lines: ComputedLine[]) {
  const netAmountPaise = lines.reduce((s, l) => s + l.netAmountPaise, 0);
  const taxAmountPaise = lines.reduce((s, l) => s + l.taxAmountPaise, 0);
  return { netAmountPaise, taxAmountPaise, totalAmountPaise: netAmountPaise + taxAmountPaise };
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
    preHandler: [app.authenticate, resolveCompany, authorize('settings.company.edit')],
  }, async (request, reply) => {
    const parsed = supplierCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const data = parsed.data;
    const [row] = await db.insert(suppliers).values({
      companyId: data.companyId,
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
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.view')],
  }, async (request) => {
    const cid = companyId(request);
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
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Supplier not found' });
    return row;
  });

  // Update
  app.patch('/suppliers/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.company.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = supplierUpdateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const [row] = await db.update(suppliers)
      .set({ ...parsed.data, updatedBy: userId(request), updatedAt: new Date() })
      .where(eq(suppliers.id, id)).returning();
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
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.requisition.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = prCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, d.companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [pr] = await tx.insert(purchaseRequisitions).values({
        companyId: d.companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any, requiredByDate: d.requiredByDate as any,
        purpose: d.purpose, remarks: d.remarks, createdBy: userId(request),
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
        { companyId: d.companyId, documentType: DOC, documentId: pr.id, documentNumber, performedBy: userId(request) },
        pr, { tx }
      );
      return pr;
    });
    return reply.code(201).send(created);
  });

  app.get('/requisitions', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.requisition.view')],
  }, async (request) => listHeaders(request, purchaseRequisitions));

  app.get('/requisitions/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.requisition.view')],
  }, async (request, reply) => getWithLines(reply, purchaseRequisitions, purchaseRequisitionLines, purchaseRequisitionLines.requisitionId, request.params as { id: string }));

  // submit / approve / reject
  simpleTransition(app, { route: '/requisitions/:id/submit', table: purchaseRequisitions, docType: DOC, to: 'submitted', perm: 'purchase.requisition.submit' });
  simpleTransition(app, { route: '/requisitions/:id/approve', table: purchaseRequisitions, docType: DOC, to: 'approved', perm: 'purchase.requisition.approve' });
  simpleTransition(app, { route: '/requisitions/:id/reject', table: purchaseRequisitions, docType: DOC, to: 'rejected', perm: 'purchase.requisition.approve' });
}

// ════════════════════════════════════════════════════════════════════════════
// Purchase Orders  (no GL, no stock)
// ════════════════════════════════════════════════════════════════════════════

function registerOrders(app: FastifyInstance) {
  const DOC = 'purchase.po';

  app.post('/orders', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = poCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, d.companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [po] = await tx.insert(purchaseOrders).values({
        companyId: d.companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any,
        supplierId: d.supplierId, requisitionId: d.requisitionId, supplierRef: d.supplierRef,
        expectedDeliveryDate: d.expectedDeliveryDate as any, paymentTermsDays: d.paymentTermsDays,
        deliveryWarehouseId: d.deliveryWarehouseId, placeOfSupply: d.placeOfSupply,
        isReverseCharge: d.isReverseCharge, remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(purchaseOrderLines).values(
        d.lines.map((l, i) => ({
          poId: po.id, lineNumber: i + 1, requisitionLineId: l.requisitionLineId, itemId: l.itemId,
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
      await app.auditEngine.logCreate(
        { companyId: d.companyId, documentType: DOC, documentId: po.id, documentNumber, performedBy: userId(request) },
        po, { tx }
      );
      return po;
    });
    return reply.code(201).send(created);
  });

  app.get('/orders', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.view')],
  }, async (request) => listHeaders(request, purchaseOrders));

  app.get('/orders/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.view')],
  }, async (request, reply) => getWithLines(reply, purchaseOrders, purchaseOrderLines, purchaseOrderLines.poId, request.params as { id: string }));

  simpleTransition(app, { route: '/orders/:id/submit', table: purchaseOrders, docType: DOC, to: 'submitted', perm: 'purchase.po.submit' });
  
  // Approval carries an amount limit check against the PO total & Segregation of Duties check.
  app.post('/orders/:id/approve', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = companyId(request);
    const uid = userId(request);
    const [row] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });

    if (!app.permissionService.validateMakerChecker(uid, row.createdBy, row.submittedBy)) {
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
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.po.cancel')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = companyId(request);

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
      await applyTransition(app, {
        client: db, table: purchaseOrders, docType: DOC, id, companyId: cid,
        documentNumber: row.documentNumber, fromStatus: row.status as DocumentStatus,
        toStatus: 'cancelled', userId: userId(request), remarks,
      });
      return reply.send({ ok: true, status: 'cancelled' });
    } catch (err) {
      return reply.code(409).send({ error: 'Transition failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Goods Receipt Notes  (approval → stock + GL)
// ════════════════════════════════════════════════════════════════════════════

function registerGrns(app: FastifyInstance) {
  const DOC = 'purchase.grn';

  app.post('/grns', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.grn.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = grnCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    // value GRN lines on acceptedQty
    const computed = d.lines.map((l) =>
      computeLine({ quantity: l.acceptedQty, ratePaise: l.ratePaise, discountPercent: l.discountPercent, discountPaise: l.discountPaise,
        cgstAmountPaise: l.cgstAmountPaise, sgstAmountPaise: l.sgstAmountPaise, igstAmountPaise: l.igstAmountPaise, cessAmountPaise: l.cessAmountPaise }));
    const totals = headerTotals(computed);

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, d.companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [grn] = await tx.insert(goodsReceiptNotes).values({
        companyId: d.companyId, plantId: d.plantId, documentNumber, status: 'draft',
        fiscalYear, postingDate: d.postingDate as any, supplierId: d.supplierId, poId: d.poId,
        warehouseId: d.warehouseId, supplierDcNo: d.supplierDcNo, supplierDcDate: d.supplierDcDate as any,
        gateEntryNo: d.gateEntryNo, vehicleNo: d.vehicleNo, remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
        totalAmountPaise: totals.totalAmountPaise, createdBy: userId(request),
      }).returning();
      await tx.insert(goodsReceiptNoteLines).values(
        d.lines.map((l, i) => ({
          grnId: grn.id, lineNumber: i + 1, poLineId: l.poLineId, itemId: l.itemId, description: l.description,
          receivedQty: l.receivedQty.toString(), acceptedQty: l.acceptedQty.toString(), rejectedQty: String(l.rejectedQty ?? 0),
          uom: l.uom, ratePaise: l.ratePaise, valuationRatePaise: l.ratePaise, netAmountPaise: computed[i].netAmountPaise,
          taxCodeId: l.taxCodeId, hsnSacCode: l.hsnSacCode, taxAmountPaise: computed[i].taxAmountPaise,
          totalAmountPaise: computed[i].totalAmountPaise, warehouseId: l.warehouseId ?? d.warehouseId,
          batchId: l.batchId, batchNumber: l.batchNumber, rejectionReason: l.rejectionReason,
        }))
      );
      await app.auditEngine.logCreate(
        { companyId: d.companyId, documentType: DOC, documentId: grn.id, documentNumber, performedBy: userId(request) },
        grn, { tx }
      );
      return grn;
    });
    return reply.code(201).send(created);
  });

  app.get('/grns', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.grn.view')],
  }, async (request) => listHeaders(request, goodsReceiptNotes));

  app.get('/grns/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.grn.view')],
  }, async (request, reply) => getWithLines(reply, goodsReceiptNotes, goodsReceiptNoteLines, goodsReceiptNoteLines.grnId, request.params as { id: string }));

  simpleTransition(app, { route: '/grns/:id/submit', table: goodsReceiptNotes, docType: DOC, to: 'submitted', perm: 'purchase.grn.submit' });

  // Approve → post stock (purchase_receipt) + GL (purchase.grn), then update PO receipt status.
  app.post('/grns/:id/approve', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.grn.submit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = companyId(request);
    const uid = userId(request);

    const [grn] = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id)).limit(1);
    if (!grn) return reply.code(404).send({ error: 'GRN not found' });
    if (grn.status !== 'submitted') return reply.code(409).send({ error: `GRN must be submitted (is '${grn.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, grn.createdBy, grn.submittedBy)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
        // 1. Stock IN at landed cost
        await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: grn.plantId, warehouseId: l.warehouseId ?? grn.warehouseId,
          itemId: l.itemId, movementType: 'purchase_receipt' as const,
          quantity: parseFloat(l.acceptedQty), uom: l.uom, valuationRatePaise: l.ratePaise,
          documentType: DOC, documentId: grn.id, documentNumber: grn.documentNumber, documentLineNumber: l.lineNumber,
          batchId: l.batchId ?? undefined, postingDate: new Date(grn.postingDate), createdBy: uid,
        })));

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
          await tx.update(purchaseOrders).set({ receiptStatus: 'partial', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, grn.poId));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
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
// Purchase Invoices  (approval → GL)
// ════════════════════════════════════════════════════════════════════════════

function registerInvoices(app: FastifyInstance) {
  const DOC = 'purchase.invoice';

  app.post('/invoices', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.invoice.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchaseInvoiceCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const computed = d.lines.map((l) => computeLine(l));
    const totals = headerTotals(computed);

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, d.companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [inv] = await tx.insert(purchaseInvoices).values({
        companyId: d.companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, supplierId: d.supplierId, poId: d.poId,
        supplierInvoiceNumber: d.supplierInvoiceNumber, supplierInvoiceDate: d.supplierInvoiceDate as any,
        dueDate: d.dueDate as any, placeOfSupply: d.placeOfSupply, isReverseCharge: d.isReverseCharge,
        supplierIrn: d.supplierIrn, itcEligible: d.itcEligible, remarks: d.remarks,
        netAmountPaise: totals.netAmountPaise, taxAmountPaise: totals.taxAmountPaise,
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
        { companyId: d.companyId, documentType: DOC, documentId: inv.id, documentNumber, performedBy: userId(request) },
        inv, { tx }
      );
      return inv;
    });
    return reply.code(201).send(created);
  });

  app.get('/invoices', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.invoice.view')],
  }, async (request) => listHeaders(request, purchaseInvoices));

  app.get('/invoices/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.invoice.view')],
  }, async (request, reply) => getWithLines(reply, purchaseInvoices, purchaseInvoiceLines, purchaseInvoiceLines.invoiceId, request.params as { id: string }));

  simpleTransition(app, { route: '/invoices/:id/submit', table: purchaseInvoices, docType: DOC, to: 'submitted', perm: 'purchase.invoice.create' });

  // Approve → post GL (DR GR-IR / CR AP)
  app.post('/invoices/:id/approve', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.invoice.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = companyId(request);
    const uid = userId(request);

    const [inv] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, id)).limit(1);
    if (!inv) return reply.code(404).send({ error: 'Invoice not found' });
    if (inv.status !== 'submitted') return reply.code(409).send({ error: `Invoice must be submitted (is '${inv.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, inv.createdBy, inv.submittedBy)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
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
        if (inv.poId) {
          await tx.update(purchaseOrders).set({ billingStatus: 'partial', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, inv.poId));
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
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.payment.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = purchasePaymentCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));
    const allocated = d.allocations.reduce((s, a) => s + a.allocatedAmountPaise, 0);
    if (allocated > d.paidAmountPaise) {
      return reply.code(400).send({ error: 'Allocated amount exceeds paid amount' });
    }

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, d.companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [pay] = await tx.insert(purchasePayments).values({
        companyId: d.companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
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
        { companyId: d.companyId, documentType: DOC, documentId: pay.id, documentNumber, performedBy: userId(request) },
        pay, { tx }
      );
      return pay;
    });
    return reply.code(201).send(created);
  });

  app.get('/payments', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.payment.view')],
  }, async (request) => listHeaders(request, purchasePayments));

  app.get('/payments/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.payment.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(purchasePayments).where(eq(purchasePayments.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Payment not found' });
    const allocations = await db.select().from(purchasePaymentAllocations).where(eq(purchasePaymentAllocations.paymentId, id));
    return { ...row, allocations };
  });

  simpleTransition(app, { route: '/payments/:id/submit', table: purchasePayments, docType: DOC, to: 'submitted', perm: 'purchase.payment.create' });

  // Approve → post GL (DR AP / CR Bank) + apply allocations to invoices
  app.post('/payments/:id/approve', {
    preHandler: [app.authenticate, resolveCompany, authorize('purchase.payment.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = companyId(request);
    const uid = userId(request);

    const [pay] = await db.select().from(purchasePayments).where(eq(purchasePayments.id, id)).limit(1);
    if (!pay) return reply.code(404).send({ error: 'Payment not found' });
    if (pay.status !== 'submitted') return reply.code(409).send({ error: `Payment must be submitted (is '${pay.status}')` });

    if (!app.permissionService.validateMakerChecker(uid, pay.createdBy, pay.submittedBy)) {
      return reply.code(403).send({ error: 'Segregation of duties violation: Document maker/submitter cannot approve.' });
    }

    const allocations = await db.select().from(purchasePaymentAllocations).where(eq(purchasePaymentAllocations.paymentId, id));

    try {
      const journalEntryId = await db.transaction(async (tx) => {
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
          const [inv] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, a.invoiceId)).limit(1);
          if (!inv) continue;
          const newPaid = inv.paidAmountPaise + a.allocatedAmountPaise;
          const status = newPaid >= inv.totalAmountPaise ? 'paid' : 'partial';
          await tx.update(purchaseInvoices)
            .set({ paidAmountPaise: newPaid, paymentStatus: status, updatedAt: new Date() })
            .where(eq(purchaseInvoices.id, a.invoiceId));
        }
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Payment approval failed', detail: (err as Error).message });
    }
  });
}

// ─── Generic list / get / simple-transition helpers ─────────────────────────

async function listHeaders(request: FastifyRequest, table: any) {
  const cid = companyId(request);
  const q = request.query as Record<string, unknown>;
  const { page, pageSize, limit, offset } = paginate(q);
  const filters = [eq(table.companyId, cid)];
  if (q.status) filters.push(eq(table.status, String(q.status)));
  const data = await db.select().from(table).where(and(...filters))
    .orderBy(desc(table.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(table).where(and(...filters));
  return { data, total: count, page, pageSize };
}

async function getWithLines(reply: FastifyReply, table: any, linesTable: any, fk: any, params: { id: string }) {
  const [header] = await db.select().from(table).where(eq(table.id, params.id)).limit(1);
  if (!header) return reply.code(404).send({ error: 'Not found' });
  const lines = await db.select().from(linesTable).where(eq(fk, params.id));
  return { ...header, lines };
}

/** Registers a POST :route that performs a draft→submitted / submitted→approved etc. transition. */
function simpleTransition(
  app: FastifyInstance,
  cfg: { route: string; table: any; docType: string; to: DocumentStatus; perm: string }
) {
  app.post(cfg.route, {
    preHandler: [app.authenticate, resolveCompany, authorize(cfg.perm)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = companyId(request);
    const [row] = await db.select().from(cfg.table).where(eq(cfg.table.id, id)).limit(1);
    if (!row) return reply.code(404).send({ error: 'Document not found' });

    if (cfg.to === 'approved') {
      const uid = userId(request);
      if (!app.permissionService.validateMakerChecker(uid, row.createdBy, row.submittedBy)) {
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
