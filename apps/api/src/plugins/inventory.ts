import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { StockLedgerService } from '../services/stock-ledger.js';
import { ValuationEngine } from '../services/valuation-engine.js';
import { UomService } from '../services/uom-service.js';

/**
 * Registers the inventory services on the Fastify instance.
 *
 * Decorators available after registration:
 *   app.stockLedger    — post/reverse/query stock movements
 *   app.valuationEngine — WAC computation, cost allocation
 *   app.uomService     — unit of measure conversion
 *
 * ── Usage in route handlers ───────────────────────────────────────────────
 *
 * 1. Post a GRN receipt (inside db.transaction):
 *      await db.transaction(async (tx) => {
 *        const grn = await tx.insert(goodsReceiptNotes).values({...}).returning();
 *        await app.stockLedger.postBatch(tx, lines.map(l => ({
 *          companyId, plantId, warehouseId,
 *          itemId: l.itemId,
 *          movementType: 'purchase_receipt',
 *          quantity: l.qty, uom: l.uom,
 *          valuationRatePaise: l.unitPricePaise,
 *          documentType: 'purchase.grn',
 *          documentId: grn.id,
 *          documentNumber: grn.documentNumber,
 *          documentLineNumber: l.lineNumber,
 *          batchId: l.batchId,       // if batch-tracked
 *          postingDate: grn.postingDate,
 *          createdBy: userId,
 *        })));
 *        await app.postingEngine.post(tx, postingCtx, userId);
 *      });
 *
 * 2. Check available stock before issuing:
 *      const available = await app.stockLedger.getAvailableQty(
 *        companyId, warehouseId, itemId
 *      );
 *      if (available < requiredQty) return reply.code(409).send({ error: 'Insufficient stock' });
 *
 * 3. Allocate production cost to by-products (process manufacturing):
 *      const allocations = app.valuationEngine.allocateProductionCost(
 *        totalBatchCostPaise,
 *        outputs.map(o => ({ itemId: o.itemId, qty: o.qty, allocationPct: o.pct })),
 *        'manual'
 *      );
 *
 * 4. Convert UOM for purchase order (BOX → PCS):
 *      const pcsQty = await app.uomService.convert(
 *        boxQty, 'BOX', 'PCS', companyId, itemId
 *      );
 */
async function inventoryPlugin(app: FastifyInstance) {
  app.decorate('stockLedger', new StockLedgerService());
  app.decorate('valuationEngine', new ValuationEngine());
  app.decorate('uomService', new UomService());
}

export default fp(inventoryPlugin, {
  name: 'inventory',
  dependencies: ['engines'],  // needs statusEngine / auditEngine for document validation
});
