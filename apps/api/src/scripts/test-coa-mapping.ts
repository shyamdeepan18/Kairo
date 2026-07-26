import { db, chartOfAccounts } from '@erp/db';
import { eq } from 'drizzle-orm';
const companyId = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

async function run() {
  const rs = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const categories = rs.map(r => r.postingCategory).filter(Boolean);
  console.log('Mapped Categories:', categories);
  process.exit(0);
}
run().catch(console.error);
