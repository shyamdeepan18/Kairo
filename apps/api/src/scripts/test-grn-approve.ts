import { app } from '../server.js';
import { db, goodsReceiptNotes, goodsReceiptNoteLines, purchaseOrderLines, purchaseOrders } from '@erp/db';
import { eq, sql } from 'drizzle-orm';
import type { PostingContext } from '../services/posting-engine.js';
import { fiscalPeriod } from '../services/posting-engine.js';
import { grnTaxLines } from '../utils/tax.js';

const DOC = 'purchase.grn';

async function run() {
  await app.ready();
  
  const id = '1c494b72-c938-4dd2-aebd-b21f0c4d9d13';
  const uid = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';
  const cid = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

  const [grn] = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id)).limit(1);
  const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, id));

  try {
    const result = await db.transaction(async (tx) => {
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
      
      console.log('Posting Context:', JSON.stringify(ctx, null, 2));
      const jeId = await app.postingEngine.post(tx, ctx, uid);
      
      console.log('Posted JE:', jeId);
      throw new Error('Rollback');
    });
  } catch (e: any) {
    if (e.message !== 'Rollback') {
      console.error('Error:', e);
    } else {
      console.log('Success (rolled back)');
    }
  }

  process.exit(0);
}

run().catch(console.error);
