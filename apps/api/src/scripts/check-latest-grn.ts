import { db, goodsReceiptNotes, goodsReceiptNoteLines, journalEntries } from '@erp/db';
import { eq, desc } from 'drizzle-orm';

async function run() {
  const grns = await db.select().from(goodsReceiptNotes).orderBy(desc(goodsReceiptNotes.createdAt)).limit(1);
  if (grns.length === 0) {
    console.log('No GRNs found');
    process.exit(0);
  }
  const grn = grns[0];
  console.log('Latest GRN:', grn);
  
  const lines = await db.select().from(goodsReceiptNoteLines).where(eq(goodsReceiptNoteLines.grnId, grn.id));
  console.log('Lines:', lines);
  
  process.exit(0);
}
run().catch(console.error);
