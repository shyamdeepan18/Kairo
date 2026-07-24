import { db, documentNumberSeries, companies } from './packages/db/src/index.js';
async function test() {
  const allComps = await db.select().from(companies);
  console.log('Companies:', allComps.map(c => c.id));
  const series = await db.select().from(documentNumberSeries);
  console.log('Series for purchase.payment:', series.filter(s => s.documentType === 'purchase.payment'));
}
test().then(() => process.exit(0)).catch(console.error);
