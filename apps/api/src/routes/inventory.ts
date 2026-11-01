import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import {
  db,
  stockBalances, stockLedgerEntries,
  stockAdjustments, stockAdjustmentLines,
  stockTransfers, stockTransferLines,
  items, itemBatches, warehouses, plants,
} from '@erp/db';
import { z } from 'zod';
import {
  stockTransferCreateSchema,
  stockTransferUpdateSchema,
  stockTransferReceiveSchema,
} from '@erp/shared';
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

// Stock-transfer create/update/receive schemas live in @erp/shared
// (stockTransferCreateSchema / stockTransferUpdateSchema / stockTransferReceiveSchema)
// so the web client and API validate identically.

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

// ─── Stock-transfer helpers ──────────────────────────────────────────────────

/** Client/business validation failure → HTTP 400 */
class TransferValidationError extends Error {}
/** The document changed status under us (lost race / stale read) → HTTP 409 */
class ConcurrentTransitionError extends Error {}

interface ResolvedTransferLine {
  itemId: string;
  description?: string;
  quantity: number;
  uom: string;
  batchId?: string;
  valuationRatePaise: number;
  valuationAmountPaise: number;
}

/**
 * Validates tracking requirements and resolves a starting valuation rate for each
 * transfer line. The rate stored here is only a create-time estimate — the OUT/IN
 * movements at approve/receive always re-derive the real WAC (see the approve route).
 * Rate resolution: explicit line rate → source-warehouse WAC → item last purchase rate → 0.
 * Serial-tracked items are rejected (not supported in transfers yet).
 */
async function resolveTransferLines(
  reader: any,
  companyId: string,
  fromWarehouseId: string,
  lines: Array<{ itemId: string; description?: string; quantity: number; uom: string; valuationRatePaise?: number; batchId?: string }>,
): Promise<ResolvedTransferLine[]> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const itemRows = await reader
    .select({ id: items.id, itemCode: items.itemCode, trackingType: items.trackingType, purchaseRatePaise: items.purchaseRatePaise })
    .from(items)
    .where(and(eq(items.companyId, companyId), inArray(items.id, itemIds)));
  const itemMap = new Map<string, { id: string; itemCode: string; trackingType: string; purchaseRatePaise: number }>(
    itemRows.map((i: any) => [i.id, i]),
  );

  const resolved: ResolvedTransferLine[] = [];
  for (const l of lines) {
    const it = itemMap.get(l.itemId);
    if (!it) throw new TransferValidationError(`Item ${l.itemId} not found`);
    if (it.trackingType === 'serial') {
      throw new TransferValidationError(`Serial-tracked item '${it.itemCode}' cannot be transferred yet`);
    }
    if (it.trackingType === 'batch' && !l.batchId) {
      throw new TransferValidationError(`Batch-tracked item '${it.itemCode}' requires a batch on every transfer line`);
    }

    let ratePaise = l.valuationRatePaise;
    if (ratePaise === undefined || ratePaise === null || ratePaise === 0) {
      const [sb] = await reader
        .select({ valuationRatePaise: stockBalances.valuationRatePaise })
        .from(stockBalances)
        .where(and(
          eq(stockBalances.companyId, companyId),
          eq(stockBalances.warehouseId, fromWarehouseId),
          eq(stockBalances.itemId, l.itemId),
        ))
        .limit(1);
      ratePaise = (sb && sb.valuationRatePaise > 0) ? sb.valuationRatePaise : (it.purchaseRatePaise ?? 0);
    }

    resolved.push({
      itemId: l.itemId,
      description: l.description,
      quantity: l.quantity,
      uom: l.uom,
      batchId: l.batchId,
      valuationRatePaise: ratePaise ?? 0,
      valuationAmountPaise: Math.round((ratePaise ?? 0) * l.quantity),
    });
  }
  return resolved;
}

/**
 * Find (or lazily create) the plant's single `transit`-type warehouse. In-transit
 * transfers hold dispatched stock here between issue and receipt so it stays visible
 * and value-conserved. Guarded by the partial unique index warehouses_plant_transit_uq.
 */
async function getOrCreateTransitWarehouse(tx: any, companyId: string, plantId: string, uid: string) {
  const [existing] = await tx
    .select()
    .from(warehouses)
    .where(and(
      eq(warehouses.companyId, companyId),
      eq(warehouses.plantId, plantId),
      eq(warehouses.warehouseType, 'transit'),
    ))
    .limit(1);
  if (existing) return existing;

  const inserted = await tx
    .insert(warehouses)
    .values({
      companyId,
      plantId,
      code: 'TRANSIT',
      name: 'In-Transit',
      warehouseType: 'transit',
      isDefault: false,
      isActive: true,
      createdBy: uid,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) return inserted[0];

  // Lost the race — another tx created it first.
  const [row] = await tx
    .select()
    .from(warehouses)
    .where(and(
      eq(warehouses.companyId, companyId),
      eq(warehouses.plantId, plantId),
      eq(warehouses.warehouseType, 'transit'),
    ))
    .limit(1);
  if (!row) throw new Error('Failed to provision in-transit warehouse');
  return row;
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
      const res = await app.statusEngine.prepare('inventory.adjustment', adj.status as DocumentStatus, 'submitted', uid);
      await db.update(stockAdjustments).set({ status: 'submitted', submittedAt: new Date(), submittedBy: uid, updatedAt: new Date() }).where(eq(stockAdjustments.id, id));
      await app.auditEngine.logTransition({ companyId: cid, documentType: 'inventory.adjustment', documentId: id, documentNumber: adj.documentNumber, performedBy: uid }, 'draft', res);
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

  // List batches for a batch-tracked item (used by transfer/adjustment line pickers)
  app.get('/items/:itemId/batches', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.view')],
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const cid = tenant(request).companyId;
    const rows = await db.select({
      id: itemBatches.id,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      qcStatus: itemBatches.qcStatus,
    }).from(itemBatches)
      .where(and(eq(itemBatches.companyId, cid), eq(itemBatches.itemId, itemId)))
      .orderBy(desc(itemBatches.createdAt))
      .limit(200);
    return reply.send({ data: rows });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Stock Transfers
  // ══════════════════════════════════════════════════════════════════════════

  app.post('/transfers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const parsed = stockTransferCreateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    if (d.fromWarehouseId === d.toWarehouseId) return reply.code(400).send({ error: 'Source and destination warehouse must be different' });
    const { fiscalYear, period } = fiscalPeriod(new Date(d.postingDate));
    const uid = userId(request);
    const cid = tenant(request).companyId; // trusted; body companyId is ignored
    const isSysAdmin = (request.user as any)?.isSystemAdmin;

    // Fetch and verify source & destination warehouses. Plant is derived from the
    // warehouse (authoritative); a body plant that disagrees is rejected (A8).
    const [fromWh] = await db.select().from(warehouses).where(and(eq(warehouses.id, d.fromWarehouseId), eq(warehouses.companyId, cid))).limit(1);
    const [toWh] = await db.select().from(warehouses).where(and(eq(warehouses.id, d.toWarehouseId), eq(warehouses.companyId, cid))).limit(1);
    if (!fromWh) return reply.code(400).send({ error: 'Source warehouse not found' });
    if (!toWh) return reply.code(400).send({ error: 'Destination warehouse not found' });
    if (d.fromPlantId && d.fromPlantId !== fromWh.plantId) return reply.code(400).send({ error: 'fromPlantId does not match the source warehouse plant' });
    if (d.toPlantId && d.toPlantId !== toWh.plantId) return reply.code(400).send({ error: 'toPlantId does not match the destination warehouse plant' });

    const fromPlantId = fromWh.plantId;
    const toPlantId = toWh.plantId;

    await assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item');

    // Check operational access to source plant if not system admin
    if (!isSysAdmin) {
      const hasPlant = await app.permissionService.hasPlantAccess(uid, fromPlantId);
      if (!hasPlant) {
        return reply.code(403).send({ error: 'Forbidden: No access to source plant' });
      }
    }

    let resolvedLines: ResolvedTransferLine[];
    try {
      resolvedLines = await resolveTransferLines(db, cid, d.fromWarehouseId, d.lines);
    } catch (e) {
      if (e instanceof TransferValidationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    const totalPaise = resolvedLines.reduce((s, l) => s + l.valuationAmountPaise, 0);

    const created = await db.transaction(async (tx) => {
      const docNumber = await app.numberSeriesService.next(tx, cid, 'inventory.transfer', { fiscalYear, plantId: fromPlantId });

      const [tr] = await tx.insert(stockTransfers).values({
        companyId: cid,
        plantId: fromPlantId,
        fromPlantId,
        toPlantId,
        documentNumber: docNumber,
        postingDate: d.postingDate as any,
        fiscalYear,
        period,
        transferType: d.transferType,
        fromWarehouseId: d.fromWarehouseId,
        toWarehouseId: d.toWarehouseId,
        reason: d.reason,
        remarks: d.remarks,
        vehicleNo: d.vehicleNo,
        driverName: d.driverName,
        driverPhone: d.driverPhone,
        lrNumber: d.lrNumber,
        status: 'draft',
        totalAmountPaise: totalPaise,
        createdBy: uid,
      }).returning();

      await tx.insert(stockTransferLines).values(
        resolvedLines.map((l, i) => ({
          transferId: tr.id,
          lineNumber: i + 1,
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity.toString(),
          uom: l.uom,
          valuationRatePaise: l.valuationRatePaise,
          valuationAmountPaise: l.valuationAmountPaise,
          batchId: l.batchId ?? null,
        }))
      );
      return tr;
    });
    return reply.code(201).send(created);
  });

  // Edit a draft transfer (header + lines replaced wholesale)
  app.patch('/transfers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = stockTransferUpdateSchema.safeParse(stripServerOwned(request.body));
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    if (d.fromWarehouseId === d.toWarehouseId) return reply.code(400).send({ error: 'Source and destination warehouse must be different' });
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const isSysAdmin = (request.user as any)?.isSystemAdmin;

    const [tr] = await db.select().from(stockTransfers).where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'draft') return reply.code(409).send({ error: `Only draft transfers can be edited (is '${tr.status}')` });

    const [fromWh] = await db.select().from(warehouses).where(and(eq(warehouses.id, d.fromWarehouseId), eq(warehouses.companyId, cid))).limit(1);
    const [toWh] = await db.select().from(warehouses).where(and(eq(warehouses.id, d.toWarehouseId), eq(warehouses.companyId, cid))).limit(1);
    if (!fromWh) return reply.code(400).send({ error: 'Source warehouse not found' });
    if (!toWh) return reply.code(400).send({ error: 'Destination warehouse not found' });
    if (d.fromPlantId && d.fromPlantId !== fromWh.plantId) return reply.code(400).send({ error: 'fromPlantId does not match the source warehouse plant' });
    if (d.toPlantId && d.toPlantId !== toWh.plantId) return reply.code(400).send({ error: 'toPlantId does not match the destination warehouse plant' });
    const fromPlantId = fromWh.plantId;
    const toPlantId = toWh.plantId;

    await assertAllOwned(items, d.lines.map((l) => l.itemId), cid, 'Item');
    if (!isSysAdmin) {
      const hasPlant = await app.permissionService.hasPlantAccess(uid, fromPlantId);
      if (!hasPlant) return reply.code(403).send({ error: 'Forbidden: No access to source plant' });
    }

    let resolvedLines: ResolvedTransferLine[];
    try {
      resolvedLines = await resolveTransferLines(db, cid, d.fromWarehouseId, d.lines);
    } catch (e) {
      if (e instanceof TransferValidationError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    const totalPaise = resolvedLines.reduce((s, l) => s + l.valuationAmountPaise, 0);

    try {
      const updated = await db.transaction(async (tx) => {
        const claimed = await tx.update(stockTransfers)
          .set({
            fromPlantId, toPlantId, plantId: fromPlantId,
            transferType: d.transferType,
            fromWarehouseId: d.fromWarehouseId, toWarehouseId: d.toWarehouseId,
            postingDate: d.postingDate as any,
            reason: d.reason, remarks: d.remarks, vehicleNo: d.vehicleNo,
            driverName: d.driverName, driverPhone: d.driverPhone, lrNumber: d.lrNumber,
            totalAmountPaise: totalPaise,
            updatedAt: new Date(), updatedBy: uid,
          })
          .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'draft')))
          .returning({ id: stockTransfers.id });
        if (claimed.length === 0) throw new ConcurrentTransitionError('Transfer is no longer a draft');

        await tx.delete(stockTransferLines).where(eq(stockTransferLines.transferId, id));
        await tx.insert(stockTransferLines).values(
          resolvedLines.map((l, i) => ({
            transferId: id,
            lineNumber: i + 1,
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity.toString(),
            uom: l.uom,
            valuationRatePaise: l.valuationRatePaise,
            valuationAmountPaise: l.valuationAmountPaise,
            batchId: l.batchId ?? null,
          }))
        );
        const [row] = await tx.select().from(stockTransfers).where(eq(stockTransfers.id, id)).limit(1);
        return row;
      });
      return reply.send(updated);
    } catch (e) {
      if (e instanceof ConcurrentTransitionError) return reply.code(409).send({ error: e.message });
      request.log.error(e);
      return reply.code(409).send({ error: 'Edit failed', detail: (e as Error).message });
    }
  });

  // Delete a draft transfer (lines cascade)
  app.delete('/transfers/:id', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const cid = tenant(request).companyId;
    const [tr] = await db.select().from(stockTransfers).where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'draft') return reply.code(409).send({ error: `Only draft transfers can be deleted (is '${tr.status}')` });
    const deleted = await db.delete(stockTransfers)
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'draft')))
      .returning({ id: stockTransfers.id });
    if (deleted.length === 0) return reply.code(409).send({ error: 'Transfer is no longer a draft' });
    return reply.send({ ok: true, deleted: true });
  });

  app.get('/transfers', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.view')],
  }, async (request) => {
    const cid = tenant(request).companyId;
    const q = request.query as Record<string, unknown>;
    const { page, pageSize, limit, offset } = paginate(q);
    const filters = [eq(stockTransfers.companyId, cid)];
    if (q.status) filters.push(eq(stockTransfers.status, String(q.status)));
    if (q.fromPlantId) filters.push(eq(stockTransfers.fromPlantId, String(q.fromPlantId)));
    if (q.toPlantId) filters.push(eq(stockTransfers.toPlantId, String(q.toPlantId)));

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

  // Submit (draft → submitted)
  app.post('/transfers/:id/submit', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [tr] = await db.select({ status: stockTransfers.status, documentNumber: stockTransfers.documentNumber })
      .from(stockTransfers).where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    const now = new Date();
    const claimed = await db.update(stockTransfers)
      .set({ status: 'submitted', submittedAt: now, submittedBy: uid, updatedAt: now, updatedBy: uid })
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'draft')))
      .returning({ id: stockTransfers.id });
    if (claimed.length === 0) return reply.code(409).send({ error: `Transfer is '${tr.status}', not draft` });
    await app.auditEngine.logTransition(
      { companyId: cid, documentType: 'inventory.transfer', documentId: id, documentNumber: tr.documentNumber, performedBy: uid },
      'draft', { toStatus: 'submitted', stampFields: {} },
    );
    return reply.send({ ok: true, status: 'submitted' });
  });

  // Approve → post stock (atomic claim + value-neutral OUT/IN).
  //   Direct:      OUT source → IN destination, status 'approved'.
  //   In-transit:  OUT source → IN the source plant's transit warehouse, status 'dispatched'.
  app.post('/transfers/:id/approve', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const isSysAdmin = (request.user as any)?.isSystemAdmin;

    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'submitted') return reply.code(409).send({ error: `Transfer must be submitted (is '${tr.status}')` });

    const srcPlantId = tr.fromPlantId ?? tr.plantId;
    const dstPlantId = tr.toPlantId ?? tr.plantId;

    // Segregation of Duties (Maker-Checker)
    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);
    if (!app.permissionService.validateMakerChecker(uid, tr.createdBy, tr.submittedBy, bypassSod)) {
      return reply.code(403).send({ error: 'Segregation of Duties: Creator/Submitter cannot approve their own transfer' });
    }

    // Approval Limit Check
    const withinLimit = await app.permissionService.withinApprovalLimit(
      uid, cid, 'inventory.transfer', tr.totalAmountPaise, srcPlantId,
    );
    if (!withinLimit) {
      return reply.code(403).send({ error: 'Transfer amount exceeds user approval threshold' });
    }

    // Source plant access check
    if (!isSysAdmin) {
      const hasPlant = await app.permissionService.hasPlantAccess(uid, srcPlantId);
      if (!hasPlant) return reply.code(403).send({ error: 'Forbidden: No approval access to source plant' });
    }

    const lines = await db.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
    const inTransit = tr.transferType === 'in_transit';
    const finalStatus = inTransit ? 'dispatched' : 'approved';

    try {
      await db.transaction(async (tx) => {
        const now = new Date();
        // Atomic claim — abort if a concurrent request already moved it out of 'submitted' (A3)
        const stamp = inTransit
          ? { status: 'dispatched', approvedAt: now, approvedBy: uid, dispatchedAt: now, dispatchedBy: uid, updatedAt: now, updatedBy: uid }
          : { status: 'approved', approvedAt: now, approvedBy: uid, updatedAt: now, updatedBy: uid };
        const claimed = await tx.update(stockTransfers).set(stamp)
          .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'submitted')))
          .returning({ id: stockTransfers.id });
        if (claimed.length === 0) throw new ConcurrentTransitionError('Transfer is no longer awaiting approval');

        const postingDate = new Date(tr.postingDate);
        const inWarehouseId = inTransit ? (await getOrCreateTransitWarehouse(tx, cid, srcPlantId, uid)).id : tr.toWarehouseId;
        const inPlantId = inTransit ? srcPlantId : dstPlantId;

        let actualTotalPaise = 0;
        for (const l of lines) {
          const qty = parseFloat(l.quantity);
          // OUT from source at live WAC (post() ignores the passed rate for outward movements)
          const out = await app.stockLedger.post(tx, {
            companyId: cid, plantId: srcPlantId, warehouseId: tr.fromWarehouseId, itemId: l.itemId,
            movementType: 'transfer_issue', quantity: qty, uom: l.uom, batchId: l.batchId ?? undefined,
            documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
            postingDate, createdBy: uid,
          });
          const actualRate = out.sle.valuationRatePaise;
          // IN at the exact rate that left source → the transfer conserves value (A2)
          await app.stockLedger.post(tx, {
            companyId: cid, plantId: inPlantId, warehouseId: inWarehouseId, itemId: l.itemId,
            movementType: 'transfer_receipt', quantity: qty, uom: l.uom, valuationRatePaise: actualRate, batchId: l.batchId ?? undefined,
            documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
            postingDate, createdBy: uid,
          });
          const amount = Math.round(actualRate * qty);
          actualTotalPaise += amount;
          // Persist the real issued rate on the line (replaces the create-time snapshot)
          await tx.update(stockTransferLines)
            .set({ valuationRatePaise: actualRate, valuationAmountPaise: amount })
            .where(eq(stockTransferLines.id, l.id));
        }
        await tx.update(stockTransfers).set({ totalAmountPaise: actualTotalPaise }).where(eq(stockTransfers.id, id));

        await app.auditEngine.logTransition(
          { companyId: cid, documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, performedBy: uid },
          'submitted', { toStatus: finalStatus, stampFields: {} }, undefined, { tx },
        );
      });
      return reply.send({ ok: true, status: finalStatus });
    } catch (e) {
      request.log.error(e);
      if (e instanceof ConcurrentTransitionError) return reply.code(409).send({ error: e.message });
      return reply.code(409).send({ error: 'Approval failed', detail: (e as Error).message });
    }
  });

  // Receive inward for an in-transit transfer (partial receipts supported, A5).
  //   OUT of the transit warehouse → IN to destination at the transit WAC (value-neutral).
  //   Becomes 'completed' only once every line is fully received.
  app.post('/transfers/:id/receive', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.receive')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const isSysAdmin = (request.user as any)?.isSystemAdmin;

    const parsed = stockTransferReceiveSchema.safeParse(stripServerOwned(request.body ?? {}));
    if (!parsed.success) return bad(reply, parsed);
    const body = parsed.data;

    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    if (tr.status !== 'dispatched') return reply.code(409).send({ error: `Transfer must be dispatched to receive inward (is '${tr.status}')` });

    const srcPlantId = tr.fromPlantId ?? tr.plantId;
    const dstPlantId = tr.toPlantId ?? tr.plantId;
    if (!isSysAdmin) {
      const hasDestPlant = await app.permissionService.hasPlantAccess(uid, dstPlantId);
      if (!hasDestPlant) return reply.code(403).send({ error: 'Forbidden: No operational access to destination plant' });
    }

    // Aggregate requested quantities by line (dedups a malformed payload)
    const requested = new Map<string, number>();
    if (body.lines) for (const r of body.lines) requested.set(r.lineId, (requested.get(r.lineId) ?? 0) + r.receivedQty);

    try {
      let finalStatus: 'dispatched' | 'completed' = 'dispatched';
      await db.transaction(async (tx) => {
        // Lock the transfer row to serialise concurrent receives (A3)
        const [locked] = await tx.select({ status: stockTransfers.status })
          .from(stockTransfers)
          .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid)))
          .for('update').limit(1);
        if (!locked || locked.status !== 'dispatched') throw new ConcurrentTransitionError('Transfer is not in a receivable state');

        const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
        const transitWh = await getOrCreateTransitWarehouse(tx, cid, srcPlantId, uid);
        const postingDate = new Date();

        // Which lines to receive: the explicit payload, or every line's full remaining
        const targets = body.lines
          ? lines.filter((l) => requested.has(l.id)).map((l) => ({ line: l, recv: requested.get(l.id)! }))
          : lines.map((l) => ({ line: l, recv: parseFloat(l.quantity) - parseFloat(l.receivedQty) }));
        if (body.lines && targets.length !== requested.size) {
          throw new TransferValidationError('Receive payload references a line that is not on this transfer');
        }

        for (const { line, recv } of targets) {
          if (recv <= 0) continue;
          const remaining = parseFloat(line.quantity) - parseFloat(line.receivedQty);
          if (recv > remaining + 1e-9) {
            throw new TransferValidationError(`Received qty ${recv} exceeds remaining ${remaining} for line ${line.lineNumber}`);
          }
          const out = await app.stockLedger.post(tx, {
            companyId: cid, plantId: srcPlantId, warehouseId: transitWh.id, itemId: line.itemId,
            movementType: 'transfer_issue', quantity: recv, uom: line.uom, batchId: line.batchId ?? undefined,
            documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: line.lineNumber,
            postingDate, createdBy: uid,
          });
          await app.stockLedger.post(tx, {
            companyId: cid, plantId: dstPlantId, warehouseId: tr.toWarehouseId, itemId: line.itemId,
            movementType: 'transfer_receipt', quantity: recv, uom: line.uom, valuationRatePaise: out.sle.valuationRatePaise, batchId: line.batchId ?? undefined,
            documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: line.lineNumber,
            postingDate, createdBy: uid,
          });
          await tx.update(stockTransferLines)
            .set({ receivedQty: (parseFloat(line.receivedQty) + recv).toString() })
            .where(eq(stockTransferLines.id, line.id));
        }

        const after = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
        const allReceived = after.every((l) => parseFloat(l.receivedQty) >= parseFloat(l.quantity) - 1e-9);
        const now = new Date();
        if (allReceived) {
          finalStatus = 'completed';
          await tx.update(stockTransfers).set({ status: 'completed', receivedAt: now, receivedBy: uid, updatedAt: now, updatedBy: uid }).where(eq(stockTransfers.id, id));
        } else {
          await tx.update(stockTransfers).set({ updatedAt: now, updatedBy: uid }).where(eq(stockTransfers.id, id));
        }

        await app.auditEngine.logTransition(
          { companyId: cid, documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, performedBy: uid },
          'dispatched', { toStatus: finalStatus, stampFields: {} }, undefined, { tx },
        );
      });
      return reply.send({ ok: true, status: finalStatus });
    } catch (e) {
      request.log.error(e);
      if (e instanceof TransferValidationError) return reply.code(400).send({ error: e.message });
      if (e instanceof ConcurrentTransitionError) return reply.code(409).send({ error: e.message });
      return reply.code(409).send({ error: 'Receipt failed', detail: (e as Error).message });
    }
  });

  // Reject (submitted → rejected). Dispatched stock cannot be rejected — use cancel.
  app.post('/transfers/:id/reject', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [tr] = await db.select({ status: stockTransfers.status, documentNumber: stockTransfers.documentNumber })
      .from(stockTransfers).where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    const now = new Date();
    const claimed = await db.update(stockTransfers)
      .set({ status: 'rejected', rejectedAt: now, rejectedBy: uid, updatedAt: now, updatedBy: uid })
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'submitted')))
      .returning({ id: stockTransfers.id });
    if (claimed.length === 0) return reply.code(409).send({ error: `Cannot reject transfer in '${tr.status}' state` });
    await app.auditEngine.logTransition(
      { companyId: cid, documentType: 'inventory.transfer', documentId: id, documentNumber: tr.documentNumber, performedBy: uid },
      'submitted', { toStatus: 'rejected', stampFields: {} },
    );
    return reply.send({ ok: true, status: 'rejected' });
  });

  // Reopen a rejected transfer back to draft (A7)
  app.post('/transfers/:id/reopen', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.create')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const [tr] = await db.select({ status: stockTransfers.status, documentNumber: stockTransfers.documentNumber })
      .from(stockTransfers).where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    const now = new Date();
    const claimed = await db.update(stockTransfers)
      .set({ status: 'draft', rejectedAt: null, rejectedBy: null, updatedAt: now, updatedBy: uid })
      .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid), eq(stockTransfers.status, 'rejected')))
      .returning({ id: stockTransfers.id });
    if (claimed.length === 0) return reply.code(409).send({ error: `Only rejected transfers can be reopened (is '${tr.status}')` });
    await app.auditEngine.logTransition(
      { companyId: cid, documentType: 'inventory.transfer', documentId: id, documentNumber: tr.documentNumber, performedBy: uid },
      'rejected', { toStatus: 'draft', stampFields: {} },
    );
    return reply.send({ ok: true, status: 'draft' });
  });

  // Cancel a transfer (A4).
  //   draft / submitted: no stock posted — just mark cancelled.
  //   dispatched:        reverse the still-in-transit remainder back to source, then cancel.
  //                      Any already-received quantity legitimately stays at destination.
  app.post('/transfers/:id/cancel', {
    preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.transfer.approve')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = userId(request);
    const cid = tenant(request).companyId;
    const isSysAdmin = (request.user as any)?.isSystemAdmin;

    const [tr] = await db.select().from(stockTransfers)
      .where(byTenantId(stockTransfers, id, cid)).limit(1);
    if (!tr) return reply.code(404).send({ error: 'Not found' });
    const cancellable = ['draft', 'submitted', 'dispatched'];
    if (!cancellable.includes(tr.status)) {
      return reply.code(409).send({ error: `Cannot cancel a transfer in '${tr.status}' state` });
    }

    const srcPlantId = tr.fromPlantId ?? tr.plantId;
    if (!isSysAdmin) {
      const hasPlant = await app.permissionService.hasPlantAccess(uid, srcPlantId);
      if (!hasPlant) return reply.code(403).send({ error: 'Forbidden: No access to source plant' });
    }

    try {
      await db.transaction(async (tx) => {
        const [locked] = await tx.select({ status: stockTransfers.status })
          .from(stockTransfers)
          .where(and(eq(stockTransfers.id, id), eq(stockTransfers.companyId, cid)))
          .for('update').limit(1);
        if (!locked || !cancellable.includes(locked.status)) {
          throw new ConcurrentTransitionError(`Cannot cancel a transfer in '${locked?.status ?? 'unknown'}' state`);
        }
        const fromStatus = locked.status;

        if (fromStatus === 'dispatched') {
          const transitWh = await getOrCreateTransitWarehouse(tx, cid, srcPlantId, uid);
          const lines = await tx.select().from(stockTransferLines).where(eq(stockTransferLines.transferId, id));
          const postingDate = new Date();
          for (const l of lines) {
            const remaining = parseFloat(l.quantity) - parseFloat(l.receivedQty);
            if (remaining <= 1e-9) continue;
            // OUT of transit → IN back to source, at the transit WAC (value-neutral)
            const out = await app.stockLedger.post(tx, {
              companyId: cid, plantId: srcPlantId, warehouseId: transitWh.id, itemId: l.itemId,
              movementType: 'transfer_issue', quantity: remaining, uom: l.uom, batchId: l.batchId ?? undefined,
              documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
              postingDate, createdBy: uid,
            });
            await app.stockLedger.post(tx, {
              companyId: cid, plantId: srcPlantId, warehouseId: tr.fromWarehouseId, itemId: l.itemId,
              movementType: 'transfer_receipt', quantity: remaining, uom: l.uom, valuationRatePaise: out.sle.valuationRatePaise, batchId: l.batchId ?? undefined,
              documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, documentLineNumber: l.lineNumber,
              postingDate, createdBy: uid,
            });
          }
        }

        const now = new Date();
        await tx.update(stockTransfers)
          .set({ status: 'cancelled', cancelledAt: now, cancelledBy: uid, updatedAt: now, updatedBy: uid })
          .where(eq(stockTransfers.id, id));
        await app.auditEngine.logTransition(
          { companyId: cid, documentType: 'inventory.transfer', documentId: tr.id, documentNumber: tr.documentNumber, performedBy: uid },
          fromStatus as DocumentStatus, { toStatus: 'cancelled', stampFields: {} }, undefined, { tx },
        );
      });
      return reply.send({ ok: true, status: 'cancelled' });
    } catch (e) {
      request.log.error(e);
      if (e instanceof ConcurrentTransitionError) return reply.code(409).send({ error: e.message });
      return reply.code(409).send({ error: 'Cancel failed', detail: (e as Error).message });
    }
  });
}
