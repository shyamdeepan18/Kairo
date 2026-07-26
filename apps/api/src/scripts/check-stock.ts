import { db, stockLedgerEntries, stockBalances } from '@erp/db';
import { eq } from 'drizzle-orm';

async function run() {
  const grnId = '1c494b72-c938-4dd2-aebd-b21f0c4d9d13';
  
  const entries = await db.select().from(stockLedgerEntries).where(eq(stockLedgerEntries.documentId, grnId));
  console.log('SLEs:', entries.map(e => ({ item: e.itemId, qty: e.quantity, amount: e.valuationAmountPaise })));
  
  if (entries.length > 0) {
    const itemIds = [...new Set(entries.map(e => e.itemId))];
    for (const itemId of itemIds) {
      const balances = await db.select().from(stockBalances).where(eq(stockBalances.itemId, itemId));
      console.log(`Balances for item ${itemId}:`, balances.map(b => ({ warehouse: b.warehouseId, qty: b.quantityOnHand })));
    }
  }

  process.exit(0);
}
run().catch(console.error);
