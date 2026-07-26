import { db } from '@erp/db';
import { sql } from 'drizzle-orm';

async function run() {
  const rs = await db.execute(sql`
    SELECT * FROM stock_balances
    WHERE company_id = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519'
      AND plant_id = '0e2ad5ed-14c3-4036-98ce-bed2c9e378c2'
      AND warehouse_id = '19793696-2a95-4331-a6b3-595e930a8a81'
      AND item_id = '9fbc988e-86c9-46fb-a17d-f42d9e3811b8'
  `);
  console.log('Result type:', Array.isArray(rs));
  console.log('Result length:', rs.length);
  console.log('Result[0]:', rs[0]);
  
  process.exit(0);
}
run();
