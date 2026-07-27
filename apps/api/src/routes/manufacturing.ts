import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  db, items,
  workCenters,
  productionFormulas, formulaInputs, formulaOutputs, formulaOperations,
  productionOrders, productionOrderMaterials, productionOrderOutputs,
  productionOrderOperations, productionOrderCosts,
  plants, warehouses,
} from '@erp/db';
import {
  workCenterCreateSchema, formulaCreateSchema, productionOrderCreateSchema,
  issueMaterialsSchema, recordOutputSchema, transitionSchema,
} from '@erp/shared';
import { authorize } from '../middleware/authorize.js';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { byTenantId } from '../db/tenant-query.js';
import { requireModule } from '../middleware/require-module.js';
import { stripServerOwned } from '../db/dto.js';
import { assertOwned, assertAllOwned } from '../db/fk-ownership.js';
import { fiscalPeriod, type PostingContext } from '../services/posting-engine.js';
import {
  scaleFactor, explodeInputQty, allocateProductionCost, perUnitRate, computeVariance,
  type OutputForAllocation, type AllocationBasis,
} from '../services/production-costing.js';
import type { DocumentStatus } from '../services/status-engine.js';

/**
 * Phase 8 — Manufacturing routes.  Mounted at /api/manufacturing.
 *
 * Unified discrete + process model (see PHASE8-MANUFACTURING-DESIGN.md).
 *   Formula (BOM/recipe) → Production Order → Issue (WIP) → Receive (FG) → Close.
 *   Issue   posts stock OUT (issue_to_production) + GL (manufacturing.issue: DR WIP / CR RM).
 *   Receive posts stock IN  (production_receipt / by_product_receipt) + GL
 *           (manufacturing.receipt: DR FG / CR WIP), with cost allocated across
 *           outputs by the type-specific strategy.
 */
export default async function manufacturingRoutes(app: FastifyInstance) {
  // Authenticate at the group level FIRST so the module gate below sees the
  // trusted JWT context (request.user.activeCompanyId) instead of client input.
  // Individual routes still run authenticate + resolveTenantContext + authorize.
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireModule('manufacturing'));   // company must have the manufacturing module licensed
  registerWorkCenters(app);
  registerFormulas(app);
  registerOrders(app);
  registerOperations(app);
}

// ─── Shared helpers (mirror of routes/purchase.ts, routes/sales.ts) ─────────

const userId = (req: FastifyRequest): string => (req.user as { id: string }).id;
function bad(reply: FastifyReply, parsed: { error: { issues: unknown } }) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}
function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize ?? '50'), 10) || 50));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
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

function simpleTransition(
  app: FastifyInstance,
  cfg: { route: string; table: any; docType: string; to: DocumentStatus; perm: string }
) {
  app.post(cfg.route, { preHandler: [app.authenticate, resolveTenantContext, authorize(cfg.perm)] }, async (request, reply) => {
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
        documentNumber: row.documentNumber ?? row.code, fromStatus: row.status as DocumentStatus,
        toStatus: cfg.to, userId: userId(request), remarks,
      });
      return reply.send({ ok: true, status: cfg.to });
    } catch (err) {
      return reply.code(409).send({ error: 'Transition failed', detail: (err as Error).message });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Work centers
// ════════════════════════════════════════════════════════════════════════════

function registerWorkCenters(app: FastifyInstance) {
  app.post('/work-centers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('settings.company.edit')],
  }, async (request, reply) => {
    const parsed = workCenterCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    await assertOwned(plants, d.plantId, tenant(request).companyId, 'Plant');
    const [row] = await db.insert(workCenters).values({
      companyId: tenant(request).companyId, plantId: d.plantId, code: d.code, name: d.name,
      capacityMinsPerDay: d.capacityMinsPerDay, labourRatePaise: d.labourRatePaise,
      overheadRatePaise: d.overheadRatePaise, createdBy: userId(request),
    }).returning();
    return reply.code(201).send(row);
  });

  app.get('/work-centers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.bom.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const rows = await db.select().from(workCenters).where(eq(workCenters.companyId, cid)).orderBy(desc(workCenters.createdAt));
    return { data: rows, total: rows.length };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Formulas (BOM / recipe)
// ════════════════════════════════════════════════════════════════════════════

function registerFormulas(app: FastifyInstance) {
  const DOC = 'manufacturing.bom';

  app.post('/formulas', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.bom.create')],
  }, async (request, reply) => {
    const parsed = formulaCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertAllOwned(items, [...d.inputs.map((i) => i.itemId), ...d.outputs.map((o) => o.itemId)], cid, 'Item'),
      assertAllOwned(workCenters, d.operations.map((op) => op.workCenterId), cid, 'Work center'),
    ]);
    const created = await db.transaction(async (tx) => {
      const [f] = await tx.insert(productionFormulas).values({
        companyId: tenant(request).companyId, code: d.code, version: d.version, name: d.name,
        manufacturingType: d.manufacturingType, batchSize: d.batchSize.toString(), baseUom: d.baseUom,
        status: 'draft', effectiveFrom: d.effectiveFrom as any, effectiveTo: d.effectiveTo as any,
        remarks: d.remarks, createdBy: userId(request),
      }).returning();
      await tx.insert(formulaInputs).values(d.inputs.map((l, i) => ({
        formulaId: f.id, lineNumber: i + 1, itemId: l.itemId, qtyPerBatch: l.qtyPerBatch.toString(),
        uom: l.uom, scrapPercent: String(l.scrapPercent ?? 0), isOptional: l.isOptional, substituteGroup: l.substituteGroup,
      })));
      await tx.insert(formulaOutputs).values(d.outputs.map((l, i) => ({
        formulaId: f.id, lineNumber: i + 1, itemId: l.itemId, qtyPerBatch: l.qtyPerBatch.toString(), uom: l.uom,
        outputType: l.outputType, costAllocationBasis: l.costAllocationBasis,
        costAllocationPercent: String(l.costAllocationPercent ?? 0), marketRatePaise: l.marketRatePaise,
      })));
      if (d.operations.length > 0) {
        await tx.insert(formulaOperations).values(d.operations.map((o) => ({
          formulaId: f.id, sequence: o.sequence, workCenterId: o.workCenterId, operationName: o.operationName,
          setupMins: o.setupMins, runMinsPerUnit: o.runMinsPerUnit.toString(), overheadRatePaise: o.overheadRatePaise,
        })));
      }
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: f.id, documentNumber: f.code, performedBy: userId(request) }, f, { tx });
      return f;
    });
    return reply.code(201).send(created);
  });

  app.get('/formulas', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.bom.view')],
  }, async (request) => listHeaders(request, productionFormulas));

  app.get('/formulas/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.bom.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [f] = await db.select().from(productionFormulas)
      .where(byTenantId(productionFormulas, id, tenant(request).companyId)).limit(1);
    if (!f) return reply.code(404).send({ error: 'Formula not found' });
    const [inputs, outputs, operations] = await Promise.all([
      db.select().from(formulaInputs).where(eq(formulaInputs.formulaId, id)),
      db.select().from(formulaOutputs).where(eq(formulaOutputs.formulaId, id)),
      db.select().from(formulaOperations).where(eq(formulaOperations.formulaId, id)),
    ]);
    return { ...f, inputs, outputs, operations };
  });

  simpleTransition(app, { route: '/formulas/:id/submit', table: productionFormulas, docType: DOC, to: 'submitted', perm: 'manufacturing.bom.create' });
  simpleTransition(app, { route: '/formulas/:id/approve', table: productionFormulas, docType: DOC, to: 'approved', perm: 'manufacturing.bom.approve' });
  simpleTransition(app, { route: '/formulas/:id/reject', table: productionFormulas, docType: DOC, to: 'rejected', perm: 'manufacturing.bom.approve' });
  simpleTransition(app, { route: '/formulas/:id/cancel', table: productionFormulas, docType: DOC, to: 'cancelled', perm: 'manufacturing.bom.approve' });
}

// ════════════════════════════════════════════════════════════════════════════
// Production orders
// ════════════════════════════════════════════════════════════════════════════

function registerOrders(app: FastifyInstance) {
  const DOC = 'manufacturing.order';

  // Create — explode the formula by scaleFactor into materials / outputs / operations.
  app.post('/orders', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = productionOrderCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    await Promise.all([
      assertOwned(plants, d.plantId, tenant(request).companyId, 'Plant'),
      assertOwned(warehouses, d.targetWarehouseId, tenant(request).companyId, 'Target warehouse'),
      assertOwned(warehouses, d.sourceWarehouseId, tenant(request).companyId, 'Source warehouse'),
    ]);

    // formulaId ownership is enforced by the tenant-scoped fetch below.
    const [formula] = await db.select().from(productionFormulas)
      .where(byTenantId(productionFormulas, d.formulaId, tenant(request).companyId)).limit(1);
    if (!formula) return reply.code(404).send({ error: 'Formula not found' });
    if (formula.status !== 'approved') return reply.code(409).send({ error: 'Formula must be approved before use' });

    const [fInputs, fOutputs, fOps] = await Promise.all([
      db.select().from(formulaInputs).where(eq(formulaInputs.formulaId, formula.id)),
      db.select().from(formulaOutputs).where(eq(formulaOutputs.formulaId, formula.id)),
      db.select().from(formulaOperations).where(eq(formulaOperations.formulaId, formula.id)),
    ]);

    const batchSize = parseFloat(formula.batchSize);
    const factor = scaleFactor(d.plannedQty, batchSize);
    const { fiscalYear } = fiscalPeriod(new Date(d.postingDate));

    const created = await db.transaction(async (tx) => {
      const documentNumber = await app.numberSeriesService.next(tx, tenant(request).companyId, DOC, { fiscalYear, plantId: d.plantId });
      const [order] = await tx.insert(productionOrders).values({
        companyId: tenant(request).companyId, plantId: d.plantId, documentNumber, status: 'draft', fiscalYear,
        postingDate: d.postingDate as any, formulaId: formula.id, manufacturingType: formula.manufacturingType,
        plannedQty: d.plannedQty.toString(), batchSize: formula.batchSize, scaleFactor: factor.toString(),
        targetWarehouseId: d.targetWarehouseId, sourceWarehouseId: d.sourceWarehouseId,
        expectedStartDate: d.expectedStartDate as any, expectedEndDate: d.expectedEndDate as any,
        remarks: d.remarks, createdBy: userId(request),
      }).returning();

      await tx.insert(productionOrderMaterials).values(fInputs.map((l, i) => ({
        orderId: order.id, lineNumber: i + 1, formulaInputId: l.id, itemId: l.itemId, uom: l.uom,
        requiredQty: explodeInputQty(parseFloat(l.qtyPerBatch), factor, parseFloat(l.scrapPercent)).toString(),
        warehouseId: d.sourceWarehouseId,
      })));
      await tx.insert(productionOrderOutputs).values(fOutputs.map((l, i) => ({
        orderId: order.id, lineNumber: i + 1, formulaOutputId: l.id, itemId: l.itemId, uom: l.uom,
        outputType: l.outputType, expectedQty: (parseFloat(l.qtyPerBatch) * factor).toString(),
        warehouseId: d.targetWarehouseId,
      })));
      if (fOps.length > 0) {
        await tx.insert(productionOrderOperations).values(fOps.map((o) => ({
          orderId: order.id, sequence: o.sequence, workCenterId: o.workCenterId, operationName: o.operationName,
          plannedMins: (o.setupMins + parseFloat(o.runMinsPerUnit) * d.plannedQty).toString(),
        })));
      }
      await tx.insert(productionOrderCosts).values({ orderId: order.id });
      await app.auditEngine.logCreate({ companyId: tenant(request).companyId, documentType: DOC, documentId: order.id, documentNumber, performedBy: userId(request) }, order, { tx });
      return order;
    });
    return reply.code(201).send(created);
  });

  app.get('/orders', { preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.view')] },
    async (request) => listHeaders(request, productionOrders));

  app.get('/orders/:id', { preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [order] = await db.select().from(productionOrders)
        .where(byTenantId(productionOrders, id, tenant(request).companyId)).limit(1);
      if (!order) return reply.code(404).send({ error: 'Order not found' });
      const [materials, outputs, operations, costs] = await Promise.all([
        db.select().from(productionOrderMaterials).where(eq(productionOrderMaterials.orderId, id)),
        db.select().from(productionOrderOutputs).where(eq(productionOrderOutputs.orderId, id)),
        db.select().from(productionOrderOperations).where(eq(productionOrderOperations.orderId, id)),
        db.select().from(productionOrderCosts).where(eq(productionOrderCosts.orderId, id)),
      ]);
      return { ...order, materials, outputs, operations, costs: costs[0] ?? null };
    });

  simpleTransition(app, { route: '/orders/:id/submit', table: productionOrders, docType: DOC, to: 'submitted', perm: 'manufacturing.order.create' });
  simpleTransition(app, { route: '/orders/:id/approve', table: productionOrders, docType: DOC, to: 'approved', perm: 'manufacturing.order.approve' });
  simpleTransition(app, { route: '/orders/:id/cancel', table: productionOrders, docType: DOC, to: 'cancelled', perm: 'manufacturing.order.approve' });

  registerIssue(app);
  registerReceive(app);
  registerClose(app);
}

// ─── Issue materials → stock OUT + WIP GL ───────────────────────────────────

function registerIssue(app: FastifyInstance) {
  app.post('/orders/:id/issue', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.issue')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = issueMaterialsSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
      assertAllOwned(warehouses, d.lines.map((l) => l.warehouseId), cid, 'Warehouse'),
    ]);
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [order] = await db.select().from(productionOrders).where(byTenantId(productionOrders, id, cid)).limit(1);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    if (order.status !== 'approved') return reply.code(409).send({ error: `Order must be approved to issue (is '${order.status}')` });

    // Pull itemType / itemCode for the issued items (drives WIP credit category + narration)
    const itemIds = [...new Set(d.lines.map((l) => l.itemId))];
    const itemRows = await db.select({ id: items.id, itemType: items.itemType, itemCode: items.itemCode })
      .from(items).where(inArray(items.id, itemIds));
    const itemMap = new Map(itemRows.map((r) => [r.id, r]));
    const postingDate = new Date(d.postingDate ?? order.postingDate);

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Stock OUT at WAC (issue_to_production)
        const posted = await app.stockLedger.postBatch(tx, d.lines.map((l, i) => ({
          companyId: cid, plantId: order.plantId, warehouseId: l.warehouseId ?? order.sourceWarehouseId!,
          itemId: l.itemId, movementType: 'issue_to_production' as const, quantity: l.quantity, uom: l.uom,
          documentType: 'manufacturing.issue', documentId: order.id, documentNumber: order.documentNumber,
          documentLineNumber: i + 1, batchId: l.batchId ?? undefined, productionOrderId: order.id,
          postingDate, createdBy: uid,
        })));

        const totalIssued = posted.reduce((s, p) => s + p.sle.valuationAmountPaise, 0);

        // 2. Roll issued value onto material lines
        for (let i = 0; i < d.lines.length; i++) {
          const l = d.lines[i];
          const val = posted[i]?.sle.valuationAmountPaise ?? 0;
          if (l.materialId) {
            await tx.update(productionOrderMaterials).set({
              issuedQty: sql`${productionOrderMaterials.issuedQty} + ${l.quantity}`,
              issuedValuePaise: sql`${productionOrderMaterials.issuedValuePaise} + ${val}`,
            }).where(eq(productionOrderMaterials.id, l.materialId));
          }
        }

        // 3. GL: DR WIP / CR inventory (per line)
        const { fiscalYear, period } = fiscalPeriod(postingDate);
        const ctx: PostingContext = {
          companyId: cid, plantId: order.plantId, documentType: 'manufacturing.issue', documentId: order.id,
          documentNumber: order.documentNumber, postingDate, fiscalYear, period,
          header: {},
          lines: posted.map((p, i) => ({
            itemType: itemMap.get(d.lines[i].itemId)?.itemType ?? 'raw_material',
            itemCode: itemMap.get(d.lines[i].itemId)?.itemCode ?? '',
            valuationAmountPaise: p.sle.valuationAmountPaise,
          })),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // 4. Accumulate WIP on the order + costs row
        await tx.update(productionOrders)
          .set({ wipValuePaise: sql`${productionOrders.wipValuePaise} + ${totalIssued}`, updatedAt: new Date() })
          .where(eq(productionOrders.id, order.id));
        await tx.update(productionOrderCosts).set({
          materialPaise: sql`${productionOrderCosts.materialPaise} + ${totalIssued}`,
          totalPaise: sql`${productionOrderCosts.totalPaise} + ${totalIssued}`,
          updatedAt: new Date(),
        }).where(eq(productionOrderCosts.orderId, order.id));

        return { jeId, totalIssued };
      });
      return reply.send({ ok: true, journalEntryId: result.jeId, issuedValuePaise: result.totalIssued });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Material issue failed', detail: (err as Error).message });
    }
  });
}

// ─── Receive outputs → cost allocation + stock IN + FG GL ───────────────────

function registerReceive(app: FastifyInstance) {
  app.post('/orders/:id/receive', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.issue')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = recordOutputSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId;
    await Promise.all([
      assertAllOwned(items, d.outputs.map((o) => o.itemId), cid, 'Item'),
      assertAllOwned(warehouses, d.outputs.map((o) => o.warehouseId), cid, 'Warehouse'),
    ]);
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [order] = await db.select().from(productionOrders).where(byTenantId(productionOrders, id, cid)).limit(1);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    if (order.status !== 'approved') return reply.code(409).send({ error: `Order must be approved to receive (is '${order.status}')` });

    const orderOutputs = await db.select().from(productionOrderOutputs).where(eq(productionOrderOutputs.orderId, id));
    const outByItem = new Map(orderOutputs.map((o) => [o.itemId, o]));
    const postingDate = new Date(d.postingDate ?? order.postingDate);

    // Pull each output's cost-allocation config from the formula
    // (basis + percent + market rate drive how WIP is split across co/by-products).
    const formOutputs = await db.select().from(formulaOutputs).where(eq(formulaOutputs.formulaId, order.formulaId));
    const foMap = new Map(formOutputs.map((f) => [f.id, f]));

    const itemIds = Array.from(new Set(d.outputs.map(o => o.itemId)));
    const allItems = await db.select({ id: items.id, itemType: items.itemType }).from(items).where(inArray(items.id, itemIds));
    const itemTypeMap = new Map(allItems.map(i => [i.id, i.itemType]));

    // Relieve the whole current WIP across the received outputs.
    const wip = order.wipValuePaise;
    const allocInputs: OutputForAllocation[] = d.outputs.map((o) => {
      const row = o.outputId ? orderOutputs.find((r) => r.id === o.outputId) : outByItem.get(o.itemId);
      const fo = row?.formulaOutputId ? foMap.get(row.formulaOutputId) : undefined;
      return {
        outputId: o.outputId ?? row?.id ?? o.itemId,
        outputType: (row?.outputType as OutputForAllocation['outputType']) ?? 'primary',
        producedQty: o.producedQty,
        basis: (fo?.costAllocationBasis as AllocationBasis) ?? 'by_value',
        allocationPercent: fo ? parseFloat(fo.costAllocationPercent) : 0,
        marketRatePaise: fo?.marketRatePaise ?? 0,
      };
    });
    const allocation = allocateProductionCost(wip, allocInputs, order.manufacturingType as 'discrete' | 'process');

    try {
      const result = await db.transaction(async (tx) => {
        const { fiscalYear, period } = fiscalPeriod(postingDate);
        const jeIds: string[] = [];
        let totalRelieved = 0;

        for (const o of d.outputs) {
          const row = o.outputId ? orderOutputs.find((r) => r.id === o.outputId) : outByItem.get(o.itemId);
          const allocKey = o.outputId ?? row?.id ?? o.itemId;
          const cost = allocation.get(allocKey) ?? 0;
          const rate = perUnitRate(cost, o.producedQty);
          const isByProduct = row?.outputType === 'by_product';
          totalRelieved += cost;

          // Stock IN
          await app.stockLedger.post(tx, {
            companyId: cid, plantId: order.plantId, warehouseId: o.warehouseId ?? order.targetWarehouseId!,
            itemId: o.itemId, movementType: isByProduct ? 'by_product_receipt' : 'production_receipt',
            quantity: o.producedQty, uom: o.uom, valuationRatePaise: rate,
            documentType: 'manufacturing.receipt', documentId: order.id, documentNumber: order.documentNumber,
            batchId: o.batchId ?? undefined, productionOrderId: order.id, postingDate, createdBy: uid,
          });

          // GL: DR FG (or scrap for by-product) / CR WIP
          if (cost > 0) {
            const inventoryCategory = isByProduct 
              ? 'inventory_scrap' 
              : (itemTypeMap.get(o.itemId) === 'semi_finished' ? 'inventory_semi_finished' : 'inventory_finished');

            const ctx: PostingContext = {
              companyId: cid, plantId: order.plantId, documentType: 'manufacturing.receipt', documentId: order.id,
              documentNumber: order.documentNumber, postingDate, fiscalYear, period,
              header: { actualCostPaise: cost, inventoryCategory },
              lines: [],
            };
            jeIds.push(await app.postingEngine.post(tx, ctx, uid));
          }

          // Update output row
          if (row) {
            await tx.update(productionOrderOutputs).set({
              producedQty: sql`${productionOrderOutputs.producedQty} + ${o.producedQty}`,
              costAllocatedPaise: sql`${productionOrderOutputs.costAllocatedPaise} + ${cost}`,
              valuationRatePaise: rate,
            }).where(eq(productionOrderOutputs.id, row.id));
          }
        }

        // Relieve WIP
        await tx.update(productionOrders)
          .set({ wipValuePaise: sql`${productionOrders.wipValuePaise} - ${totalRelieved}`, updatedAt: new Date() })
          .where(eq(productionOrders.id, order.id));

        return { jeIds, totalRelieved };
      });
      return reply.send({ ok: true, journalEntryIds: result.jeIds, costRelievedPaise: result.totalRelieved });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Production receipt failed', detail: (err as Error).message });
    }
  });
}

// ─── Close → variance + terminal status ─────────────────────────────────────

function registerClose(app: FastifyInstance) {
  app.post('/orders/:id/close', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const remarks = transitionSchema.safeParse(request.body ?? {}).data?.remarks;
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    const [order] = await db.select().from(productionOrders).where(byTenantId(productionOrders, id, cid)).limit(1);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    if (order.status !== 'approved') return reply.code(409).send({ error: `Order must be approved to close (is '${order.status}')` });

    const outputs = await db.select().from(productionOrderOutputs).where(eq(productionOrderOutputs.orderId, id));
    const primary = outputs.find((o) => o.outputType === 'primary') ?? outputs[0];
    const variance = computeVariance({
      expectedPrimaryQty: primary ? parseFloat(primary.expectedQty) : 0,
      producedPrimaryQty: primary ? parseFloat(primary.producedQty) : 0,
      actualCostPaise: 0,
    });

    try {
      await db.transaction(async (tx) => {
        // Any residual WIP at close is posted as standard-cost variance to GL.
        if (order.wipValuePaise > 0) {
          const { fiscalYear, period } = fiscalPeriod(new Date());
          const ctx: PostingContext = {
            companyId: cid, plantId: order.plantId, documentType: 'manufacturing.order', documentId: order.id,
            documentNumber: order.documentNumber, postingDate: new Date(), fiscalYear, period,
            header: {},
            lines: [{ lineAmountPaise: order.wipValuePaise, itemDescription: `Production variance for ${order.documentNumber}` }],
            taxLines: [],
          };
          await app.postingEngine.post(tx, ctx, uid);
        }

        await tx.update(productionOrderCosts).set({
          variancePaise: order.wipValuePaise, updatedAt: new Date(),
        }).where(eq(productionOrderCosts.orderId, id));
        await applyTransition(app, {
          client: tx as any, table: productionOrders, docType: 'manufacturing.order', id, companyId: cid,
          documentNumber: order.documentNumber, fromStatus: 'approved', toStatus: 'closed',
          userId: uid, remarks, extraSet: { actualEndDate: new Date().toISOString().slice(0, 10) },
        });
      });
      return reply.send({ ok: true, status: 'closed', qtyVariance: variance.qtyVariance, residualWipPaise: order.wipValuePaise });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Close failed', detail: (err as Error).message });
    }
  });
}

// ─── Operations → Complete & Absorb Labour/Overhead ────────────────────────

function registerOperations(app: FastifyInstance) {
  app.post('/orders/:id/operations/:seq/complete', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('manufacturing.order.issue')],
  }, async (request, reply) => {
    const { id, seq } = request.params as { id: string, seq: string };
    const { actualMins } = request.body as { actualMins: number };
    const cid = tenant(request).companyId;
    const uid = userId(request);
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);

    if (typeof actualMins !== 'number' || actualMins < 0) {
      return reply.code(400).send({ error: 'Valid actualMins required' });
    }

    const [order] = await db.select().from(productionOrders).where(byTenantId(productionOrders, id, cid)).limit(1);
    if (!order) return reply.code(404).send({ error: 'Order not found' });
    if (order.status !== 'approved') return reply.code(409).send({ error: 'Order must be approved' });

    const [op] = await db.select().from(productionOrderOperations)
      .where(and(eq(productionOrderOperations.orderId, id), eq(productionOrderOperations.sequence, parseInt(seq)))).limit(1);
    if (!op) return reply.code(404).send({ error: 'Operation not found' });
    if (op.status === 'completed') return reply.code(409).send({ error: 'Operation already completed' });

    let labourRatePaise = 0;
    let overheadRatePaise = 0;
    if (op.workCenterId) {
       const [wc] = await db.select().from(workCenters).where(byTenantId(workCenters, op.workCenterId, cid)).limit(1);
       if (wc) {
          labourRatePaise = wc.labourRatePaise;
          overheadRatePaise = op.overheadRatePaise > 0 ? op.overheadRatePaise : wc.overheadRatePaise;
       }
    }

    const actualLabourPaise = Math.round((actualMins / 60) * labourRatePaise);
    const actualOverheadPaise = Math.round((actualMins / 60) * overheadRatePaise);
    const totalPaise = actualLabourPaise + actualOverheadPaise;

    try {
      const result = await db.transaction(async (tx) => {
        await tx.update(productionOrderOperations).set({
          status: 'completed',
          actualMins: actualMins.toString(),
          actualLabourPaise,
          actualOverheadPaise,
        }).where(eq(productionOrderOperations.id, op.id));

        await tx.update(productionOrders).set({
          wipValuePaise: sql`${productionOrders.wipValuePaise} + ${totalPaise}`,
          updatedAt: new Date()
        }).where(eq(productionOrders.id, order.id));

        await tx.update(productionOrderCosts).set({
          labourPaise: sql`${productionOrderCosts.labourPaise} + ${actualLabourPaise}`,
          overheadPaise: sql`${productionOrderCosts.overheadPaise} + ${actualOverheadPaise}`,
          totalPaise: sql`${productionOrderCosts.totalPaise} + ${totalPaise}`,
          updatedAt: new Date(),
        }).where(eq(productionOrderCosts.orderId, order.id));

        let jeId: string | undefined;
        if (totalPaise > 0) {
           const { fiscalYear, period } = fiscalPeriod(new Date());
           const ctx: PostingContext = {
             companyId: cid, plantId: order.plantId, documentType: 'manufacturing.operation',
             documentId: order.id, documentNumber: order.documentNumber, postingDate: new Date(),
             fiscalYear, period, header: { labourPaise: actualLabourPaise, overheadPaise: actualOverheadPaise }, lines: []
           };
           jeId = await app.postingEngine.post(tx, ctx, uid);
        }

        return jeId;
      });
      return reply.send({ ok: true, journalEntryId: result, actualLabourPaise, actualOverheadPaise });
    } catch (err) {
      request.log.error(err);
      return reply.code(409).send({ error: 'Operation complete failed', detail: (err as Error).message });
    }
  });
}
