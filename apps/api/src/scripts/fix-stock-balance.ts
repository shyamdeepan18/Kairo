import { db, stockBalances } from '@erp/db';
import { eq, and } from 'drizzle-orm';

async function run() {
  await db.update(stockBalances)
    .set({
      quantityOnHand: '2.0000',
      valuationRatePaise: 4000450,
      valuationAmountPaise: 8000900,
    })
    .where(
      and(
        eq(stockBalances.itemId, '9fbc988e-86c9-46fb-a17d-f42d9e3811b8'),
        eq(stockBalances.warehouseId, '19793696-2a95-4331-a6b3-595e930a8a81')
      )
    );
  console.log('Fixed stock balance for item 9fbc988e-86c9-46fb-a17d-f42d9e3811b8');
  process.exit(0);
}
run().catch(console.error);
