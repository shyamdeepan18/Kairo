import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  db,
  stockBalances, stockLedgerEntries,
  stockAdjustments, stockAdjustmentLines,
  stockTransfers, stockTransferLines,
  items, warehouses, plants,
} from '@erp/db';
import { z } from 'zod';
import { authorize } from '../middleware/authorize.js';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { byTenantId } from '../db/tenant-query.js';
import { requireModule } from '../middleware/require-module.js';
import { stripServerOwned } from '../db/dto.js';
import { assertOwned, assertAllOwned } from '../db/fk-ownership.js';
import { fiscalPeriod, type PostingContext } from '../services/posting-engine.js';
import type { DocumentStatus } from '../services/status-engine.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const adjLineSchema = z.object({
  itemId:       z.string().uuid(),
  description:  z.string().optional(),
  movementType: z.enum(['adjustment_in', 'adjustment_out']),
  quantity:     z.number().positive(),
  uom:          z.string().min(1).max(20),
  valuationRatePaise: z.number().int().nonnegative().optional(),
});

// companyId is derived from the trusted tenant context, never a client input.
const adjCreateSchema = z.object({
  plantId:        z.string().uuid(),
  warehouseId:    z.string().uuid(),
  postingDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adjustmentType: z.enum(['physical_count', 'write_off', 'opening_balance', 'other']).default('physical_count'),
  reason:         z.string().optional(),
  remarks:        z.string().optional(),
  lines:          z.array(adjLineSchema).min(1),
}).strict();

const transferLineSchema = z.object({
  itemId:       z.string().uuid(),
  description:  z.string().optional(),
  quantity:     z.number().positive(),
  uom:          z.string().min(1).max(20),
  valuationRatePaise: z.number().int().nonnegative().optional(),
});

const transferCreateSchema = z.object({
  plantId:         z.string().uuid(),
  fromWarehouseId: z.string().uuid(),
  toWarehouseId:   z.string().uuid(),
  postingDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:          z.string().optional(),
  remarks:         z.string().optional(),
  vehicleNo:       z.string().optional(),
  lines:           z.array(transferLineSchema).min(1),
}).strict();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const userId = (req: FastifyRequest): string => (req.user as { id: string }).id;

function bad(reply: any, parsed: any) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}

function paginate(query: Record<string, unknown>) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(query.pageSize ?? '50'), 10) || 50));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

// ─── Main plugin ─────────────────────────────────────────────────────────────

export default async function inventoryRoutes(app: FastifyInstance) {
  // Authenticate at the group level FIRST so the module gate below sees the
  // trusted JWT context (request.user.activeCompanyId) instead of client input.
  // Individual routes still run authenticate + resolveTenantContext + authorize.
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireModule('inventory'));

  // ══════════════════════════════════════════════════════════════════════════
  // Stock Balances (read-only view from stock_balances table)
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/stock-balances', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.stock.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const q = request.query as Record<string, unknown>;
    const { page, pageSize, limit, offset } = paginate(q);

    const filters = [eq(stockBalances.companyId, cid)];
    if (q.warehouseId) filters.push(eq(stockBalances.warehouseId, String(q.warehouseId)));
    if (q.itemId) filters.push(eq(stockBalances.itemId, String(q.itemId)));

    const data = await db
      .select({
        id: stockBalances.id,
        itemId: stockBalances.itemId,
        itemName: items.itemName,
        itemCode: items.itemCode,
        primaryUom: items.primaryUom,
        warehouseId: stockBalances.warehouseId,
        warehouseName: warehouses.name,
        quantityOnHand: stockBalances.quantityOnHand,
        quantityReserved: stockBalances.quantityReserved,
        quantityOrdered: stockBalances.quantityOrdered,
        valuationRatePaise: stockBalances.valuationRatePaise,
        valuationAmountPaise: stockBalances.valuationAmountPaise,
        lastMovementAt: stockBalances.lastMovementAt,
      })
      .from(stockBalances)
      .leftJoin(items, eq(stockBalances.itemId, items.id))
      .leftJoin(warehouses, eq(stockBalances.warehouseId, warehouses.id))
      .where(and(...filters))
      .orderBy(desc(stockBalances.lastMovementAt))
      .limit(limit).offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockBalances)
      .where(and(...filters));

    return { data, total: count, page, pageSize };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Stock Ledger (read-only audit trail from stock_ledger_entries)
  // ══════════════════════════════════════════════════════════════════════════

  app.get('/stock-ledger', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.stock.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const q = request.query as Record<string, unknown>;
    const { page, pageSize, limit, offset } = paginate(q);

    const filters = [eq(stockLedgerEntries.companyId, cid)];
    if (q.itemId) filters.push(eq(stockLedgerEntries.itemId, String(q.itemId)));
    if (q.warehouseId) filters.push(eq(stockLedgerEntries.warehouseId, String(q.warehouseId)));
    if (q.movementType) filters.push(eq(stockLedgerEntries.movementType, String(q.movementType)));

    const data = await db
      .select({
        id: stockLedgerEntries.id,
        itemId: stockLedgerEntries.itemId,
        itemName: items.itemName,
        itemCode: items.itemCode,
        warehouseId: stockLedgerEntries.warehouseId,
        warehouseName: warehouses.name,
        movementType: stockLedgerEntries.movementType,
        quantity: stockLedgerEntries.quantity,
        uom: stockLedgerEntries.uom,
        valuationRatePaise: stockLedgerEntries.valuationRatePaise,
        valuationAmountPaise: stockLedgerEntries.valuationAmountPaise,
        documentType: stockLedgerEntries.documentType,
        documentNumber: stockLedgerEntries.documentNumber,
        postingDate: stockLedgerEntries.postingDate,
        isReversal: stockLedgerEntries.isReversal,
        createdAt: stockLedgerEntries.createdAt,
      })
      .from(stockLedgerEntries)
      .leftJoin(items, eq(stockLedgerEntries.itemId, items.id))
      .leftJoin(warehouses, eq(stockLedgerEntries.warehouseId, warehouses.id))
      .where(and(...filters))
      .orderBy(desc(stockLedgerEntries.createdAt))
      .limit(limit).offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockLedgerEntries)
      .where(and(...filters));

    return { data, total: count, page, pageSize };
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Stock Adjustments
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/adjustments', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = adjCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const cid = tenant(request).companyId; // trusted; body companyId is ignored
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(warehouses, d.warehouseId, cid, 'Warehouse'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
    ]);
    const { fiscalYear, period } = fiscalPeriod(new Date(d.postingDate));
    const uid = userId(request);

    const created = await db.transaction(async (tx) => {
      const docNumber = await app.numberSeriesService.next(tx, cid, 'inventory.adjustment', { fiscalYear, plantId: d.plantId });

      const totalPaise = d.lines.reduce((s, l) => s + Math.round((l.valuationRatePaise ?? 0) * l.quantity), 0);

      const [adj] = await tx.insert(stockAdjustments).values({
        companyId: cid, plantId: d.plantId, warehouseId: d.warehouseId,
        documentNumber: docNumber, postingDate: d.postingDate as any,
        fiscalYear, period, adjustmentType: d.adjustmentType,
        reason: d.reason, remarks: d.remarks, status: 'draft',
        totalAmountPaise: totalPaise, createdBy: uid,
      }).returning();

      await tx.insert(stockAdjustmentLines).values(
        d.lines.map((l, i) => ({
          adjustmentId: adj.id, lineNumber: i + 1,
          itemId: l.itemId, description: l.description,
          movementType: l.movementType,
          quantity: l.quantity.toString(), uom: l.uom,
          valuationRatePaise: l.valuationRatePaise ?? 0,
          valuationAmountPaise: Math.round((l.valuationRatePaise ?? 0) * l.quantity),
        }))
      );
      return adj;
    });
    return reply.code(201).send(created);
  });

  app.get('/adjustments', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const q = request.query as Record<string, unknown>;
    const { page, pageSize, limit, offset } = paginate(q);
    const filters = [eq(stockAdjustments.companyId, cid)];
    if (q.status) filters.push(eq(stockAdjustments.status, String(q.status)));
    const data = await db.select().from(stockAdjustments).where(and(...filters))
      .orderBy(desc(stockAdjustments.createdAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(stockAdjustments).where(and(...filters));
    return { data, total: count, page, pageSize };
  });

  app.get('/adjustments/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [adj] = await db.select().from(stockAdjustments)
      .where(byTenantId(stockAdjustments, id, cid)).limit(1);
    if (!adj) return reply.code(404).send({ error: 'Adjustment not found' });
    const lines = await db.select().from(stockAdjustmentLines).where(eq(stockAdjustmentLines.adjustmentId, id));
    return { ...adj, lines };
  });

  // Submit
  app.post('/adjustments/:id/submit', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [adj] = await db.select().from(stockAdjustments)
      .where(byTenantId(stockAdjustments, id, cid)).limit(1);
    if (!adj) return reply.code(404).send({ error: 'Not found' });
    if (adj.status !== 'draft') return reply.code(409).send({ error: `Adjustment is '${adj.status}', not draft` });
    try {
      await app.statusEngine.prepare('inventory.adjustment', adj.status as DocumentStatus, 'submitted', uid);
      await db.update(stockAdjustments).set({ status: 'submitted', submittedAt: new Date(), submittedBy: uid, updatedAt: new Date() }).where(eq(stockAdjustments.id, id));
      await app.auditEngine.logTransition({ companyId: cid, documentType: 'inventory.adjustment', documentId: id, documentNumber: adj.documentNumber, performedBy: uid }, 'draft', { toStatus: 'submitted', stampFields: {}, allowedFrom: ['draft'] });
      return reply.send({ ok: true, status: 'submitted' });
    } catch (e) {
      return reply.code(409).send({ error: 'Transition failed', detail: (e as Error).message });
    }
  });

  // Approve → post stock + GL
  app.post('/adjustments/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    // Finding #1 fix: fetch the adjustment scoped to the caller's company so a
    // foreign document id returns 404 and can never be posted into this tenant's
    // stock ledger / GL. adj.plantId & adj.warehouseId are therefore in-tenant.
    const [adj] = await db.select().from(stockAdjustments)
      .where(byTenantId(stockAdjustments, id, cid)).limit(1);
    if (!adj) return reply.code(404).send({ error: 'Not found' });
    if (adj.status !== 'submitted') return reply.code(409).send({ error: `Adjustment must be submitted (is '${adj.status}')` });
    const lines = await db.select().from(stockAdjustmentLines).where(eq(stockAdjustmentLines.adjustmentId, id));

    try {
      const jeId = await db.transaction(async (tx) => {
        // 1. Post stock movements
        await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: adj.plantId, warehouseId: adj.warehouseId,
          itemId: l.itemId,
          movementType: l.movementType as 'adjustment_in' | 'adjustment_out',
          quantity: parseFloat(l.quantity),
          uom: l.uom,
          valuationRatePaise: l.valuationRatePaise,
          documentType: 'inventory.adjustment',
          documentId: adj.id,
          documentNumber: adj.documentNumber,
          documentLineNumber: l.lineNumber,
          postingDate: new Date(adj.postingDate),
          createdBy: uid,
        })));

        // 2. Post GL
        const { fiscalYear, period } = fiscalPeriod(new Date(adj.postingDate));
        const inLines = lines.filter((l) => l.movementType === 'adjustment_in');
        const outLines = lines.filter((l) => l.movementType === 'adjustment_out');
        const ctx: PostingContext = {
          companyId: cid, plantId: adj.plantId,
          documentType: 'inventory.adjustment', documentId: adj.id,
          documentNumber: adj.documentNumber, postingDate: new Date(adj.postingDate),
          fiscalYear, period,
          header: { adjustmentType: adj.adjustmentType },
          lines: lines.map((l) => ({
            lineAmountPaise: l.valuationAmountPaise,
            movementType: l.movementType,
          })),
        };
        const jeId = await app.postingEngine.post(tx, ctx, uid);

        // 3. Status → approved
        await tx.update(stockAdjustments)
          .set({ status: 'approved', approvedAt: new Date(), approvedBy: uid, journalEntryId: jeId, updatedAt: new Date() })
          .where(eq(stockAdjustments.id, id));
        return jeId;
      });
      return reply.send({ ok: true, journalEntryId: jeId });
    } catch (e) {
      request.log.error(e);
      return reply.code(409).send({ error: 'Approval failed', detail: (e as Error).message });
    }
  });

  // Reject
  app.post('/adjustments/:id/reject', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.adjustment.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [adj] = await db.select().from(stockAdjustments)
      .where(byTenantId(stockAdjustments, id, cid)).limit(1);
    if (!adj) return reply.code(404).send({ error: 'Not found' });
    await db.update(stockAdjustments).set({ status: 'rejected', rejectedAt: new Date(), rejectedBy: uid, updatedAt: new Date() }).where(byTenantId(stockAdjustments, id, cid));
    return reply.send({ ok: true, status: 'rejected' });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Stock Transfers
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/transfers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create', { plantFrom: 'body.plantId' })],
  }, async (request, reply) => {
    const parsed = transferCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    if (d.fromWarehouseId === d.toWarehouseId) return reply.code(400).send({ error: 'Source and destination warehouse must be different' });
    const { fiscalYear, period } = fiscalPeriod(new Date(d.postingDate));
    const uid = userId(request);
    const cid = tenant(request).companyId; // trusted; body companyId is ignored
    await Promise.all([
      assertOwned(plants, d.plantId, cid, 'Plant'),
      assertOwned(warehouses, d.fromWarehouseId, cid, 'Source warehouse'),
      assertOwned(warehouses, d.toWarehouseId, cid, 'Destination warehouse'),
      assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item'),
    ]);

    const created = await db.transaction(async (tx) => {
      const docNumber = await app.numberSeriesService.next(tx, cid, 'inventory.transfer', { fiscalYear, plantId: d.plantId });
      const totalPaise = d.lines.reduce((s, l) => s + Math.round((l.valuationRatePaise ?? 0) * l.quantity), 0);

      const [tr] = await tx.insert(stockTransfers).values({
        companyId: cid, plantId: d.plantId,
        documentNumber: docNumber, postingDate: d.postingDate as any,
        fiscalYear, period,
        fromWarehouseId: d.fromWarehouseId, toWarehouseId: d.toWarehouseId,
        reason: d.reason, remarks: d.remarks, vehicleNo: d.vehicleNo,
        status: 'draft', totalAmountPaise: totalPaise, createdBy: uid,
      }).returning();

      await tx.insert(stockTransferLines).values(
        d.lines.map((l, i) => ({
          transferId: tr.id, lineNumber: i + 1,
          itemId: l.itemId, description: l.description,
          quantity: l.quantity.toString(), uom: l.uom,
          valuationRatePaise: l.valuationRatePaise ?? 0,
          valuationAmountPaise: Math.round((l.valuationRatePaise ?? 0) * l.quantity),
        }))
      );
      return tr;
    });
    return reply.code(201).send(created);
  });

  app.get('/transfers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const q = request.query as Record<string, unknown>;
    const { page, pageSize, limit, offset } = paginate(q);
    const filters = [eq(stockTransfers.companyId, cid)];
    if (q.status) filters.push(eq(stockTransfers.status, String(q.status)));
    const data = await db.select().from(stockTransfers).where(and(...filters))
      .orderBy(desc(stockTransfers.createdAt)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(stockTransfers).where(and(...filters));
    return { data, total: count, page, pageSize };
  });

  app.get('/transfers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Transfer not found' });
    const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
    return { ...tr, lines };
  });

  // Submit
  app.post('/transfers/:id/submit', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'draft') return reply.code(409).send({ error: `Transfer is '${tr.status}', not draft` });
    await db.update(stockTransfers).set({ status: 'submitted', submittedAt: new Date(), submittedBy: uid, updatedAt: new Date() }).where(byTenantId(stockTransfers, id, cid));
    return reply.send({ ok: true, status: 'submitted' });
  });

  // Approve → post stock (issue from source + receipt to destination)
  app.post('/transfers/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    // Scope to the caller's company so a foreign transfer can't be posted here.
    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'submitted') return reply.code(409).send({ error: `Transfer must be submitted (is '${tr.status}')` });
    const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));

    try {
      await db.transaction(async (tx) => {
        const postingDate = new Date(tr.postingDate);
        // Issue from source warehouse (OUT)
        await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: tr.plantId, warehouseId: tr.fromWarehouseId,
          itemId: l.itemId, movementType: 'transfer_issue' as const,
          quantity: parseFloat(l.quantity), uom: l.uom,
          valuationRatePaise: l.valuationRatePaise,
          documentType: 'inventory.transfer', documentId: tr.id,
          documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
          postingDate, createdBy: uid,
        })));
        // Receipt at destination warehouse (IN)
        await app.stockLedger.postBatch(tx, lines.map((l) => ({
          companyId: cid, plantId: tr.plantId, warehouseId: tr.toWarehouseId,
          itemId: l.itemId, movementType: 'transfer_receipt' as const,
          quantity: parseFloat(l.quantity), uom: l.uom,
          valuationRatePaise: l.valuationRatePaise,
          documentType: 'inventory.transfer', documentId: tr.id,
          documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
          postingDate, createdBy: uid,
        })));
        // Status → approved
        await tx.update(stockTransfers)
          .set({ status: 'approved', approvedAt: new Date(), approvedBy: uid, updatedAt: new Date() })
          .where(eq(stockTransfers.id, id));
      });
      return reply.send({ ok: true, status: 'approved' });
    } catch (e) {
      request.log.error(e);
      return reply.code(409).send({ error: 'Approval failed', detail: (e as Error).message });
    }
  });

  // Reject
  app.post('/transfers/:id/reject', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    await db.update(stockTransfers).set({ status: 'rejected', rejectedAt: new Date(), rejectedBy: uid, updatedAt: new Date() }).where(byTenantId(stockTransfers, id, cid));
    return reply.send({ ok: true, status: 'rejected' });
  });
}
