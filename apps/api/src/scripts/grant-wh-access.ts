import { db, userWarehouseAccess, warehouses } from '@erp/db';
import { eq } from 'drizzle-orm';
const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';
const companyId = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

async function run() {
  const whs = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
  for (const wh of whs) {
    const existing = await db.select().from(userWarehouseAccess).where(eq(userWarehouseAccess.warehouseId, wh.id));
    if (existing.length === 0) {
      await db.insert(userWarehouseAccess).values({
        userId,
        companyId,
        warehouseId: wh.id,
        canIssue: true,
        canReceive: true,
      });
      console.log('Granted access to warehouse:', wh.name);
    }
  }
  process.exit(0);
}
run().catch(console.error);
