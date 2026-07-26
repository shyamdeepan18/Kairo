import { db, goodsReceiptNotes, goodsReceiptNoteLines, stockLedgerEntries, stockBalances } from '@erp/db';
import { eq } from 'drizzle-orm';
import { StockLedgerService } from '../services/stock-ledger.js';
const DOC = 'purchase.grn';

async function run() {
  const stockLedger = new StockLedgerService();
  const id = '1c494b72-c938-4dd2-aebd-b21f0c4d9d13';
  const uid = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';
  const cid = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

  const [grn] = await db.select().from(goodsReceiptNotes).where(eq(goodsReceiptNotes.id, id)).limit(1);
  const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, id));

  await db.transaction(async (tx) => {
    // 1. Stock IN at landed cost
    await stockLedger.postBatch(tx, lines.map((l) => ({
      companyId: cid, plantId: grn.plantId, warehouseId: l.warehouseId ?? grn.warehouseId,
      itemId: l.itemId, movementType: 'purchase_receipt' as const,
      quantity: parseFloat(l.acceptedQty), uom: l.uom, valuationRatePaise: l.ratePaise,
      documentType: DOC, documentId: grn.id, documentNumber: grn.documentNumber, documentLineNumber: l.lineNumber,
      batchId: l.batchId ?? undefined, postingDate: new Date(grn.postingDate), createdBy: uid,
    })));
  });

  console.log('Successfully restored SLEs and Stock Balance!');
  process.exit(0);
}
run().catch(console.error);
