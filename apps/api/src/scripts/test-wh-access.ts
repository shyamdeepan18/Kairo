import { db, userWarehouseAccess } from '@erp/db';
import { eq } from 'drizzle-orm';
const userId = 'a978a835-e449-4580-80fc-b7f0bb54e9d2';

async function run() {
  const rs = await db.select().from(userWarehouseAccess).where(eq(userWarehouseAccess.userId, userId));
  console.log('Warehouse Access:', rs);
  process.exit(0);
}
run().catch(console.error);
