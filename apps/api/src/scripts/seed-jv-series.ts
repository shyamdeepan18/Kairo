import { db, documentNumberSeries } from '@erp/db';
const companyId = '0f0bb881-1ff8-4c0a-b0f0-8aa0e30d6519';

async function run() {
  await db.insert(documentNumberSeries).values({
    companyId,
    documentType: 'accounting.jv',
    prefix: 'JV',
    currentNumber: 0,
    padding: 4,
    fiscalYear: '2627',
    includeFiscalYear: true,
  });
  console.log('Created number series for accounting.jv');
  process.exit(0);
}
run().catch(console.error);
