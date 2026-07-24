import { db, documentNumberSeries } from '../index.js';

/**
 * Seed default document number series for a company.
 *
 * MUST run once per company (at onboarding) before any transactional document
 * can be created — NumberSeriesService.next() throws if no active series row
 * exists for the (company, documentType, fiscalYear) being requested.
 *
 * Idempotent: uses INSERT … ON CONFLICT DO NOTHING (via ensureSeries-style insert),
 * so re-running is safe. Re-run at the start of each fiscal year too (the unique
 * key includes fiscalYear).
 *
 * Usage:
 *   npx tsx packages/db/src/seeds/number-series.ts <companyId>
 *   // or import and call seedPurchaseNumberSeries(companyId) during onboarding
 */

/** Indian fiscal year string for a date. FY 2026–27 → '2627'. */
function currentFiscalYear(d = new Date()): string {
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return `${String(fyStart).slice(-2)}${String(fyStart + 1).slice(-2)}`;
}

interface SeriesDef {
  documentType: string;
  prefix: string;
  includePlantCode?: boolean;
}

// Purchase chain + the accounting.jv series the PostingEngine needs for GL entries.
const PURCHASE_SERIES: SeriesDef[] = [
  { documentType: 'purchase.requisition', prefix: 'PR' },
  { documentType: 'purchase.po',          prefix: 'PO' },
  { documentType: 'purchase.grn',         prefix: 'GRN' },
  { documentType: 'purchase.invoice',     prefix: 'PINV' },
  { documentType: 'purchase.payment',     prefix: 'PPAY' },
  // Required by PostingEngine.post() — every GL entry draws an accounting.jv number.
  { documentType: 'accounting.jv',        prefix: 'JV' },
];

// Sales chain. accounting.jv repeated (idempotent) so sales can be seeded alone.
const SALES_SERIES: SeriesDef[] = [
  { documentType: 'sales.quotation', prefix: 'QTN' },
  { documentType: 'sales.so',        prefix: 'SO' },
  { documentType: 'sales.delivery',  prefix: 'DN' },
  { documentType: 'sales.invoice',   prefix: 'SINV' },
  { documentType: 'sales.payment',   prefix: 'RCPT' },
  { documentType: 'accounting.jv',   prefix: 'JV' },
];

// Manufacturing. accounting.jv repeated (idempotent) so it can be seeded alone.
const MANUFACTURING_SERIES: SeriesDef[] = [
  { documentType: 'manufacturing.bom',   prefix: 'BOM' },
  { documentType: 'manufacturing.order', prefix: 'MO' },
  { documentType: 'accounting.jv',       prefix: 'JV' },
];
// Inventory chain.
const INVENTORY_SERIES: SeriesDef[] = [
  { documentType: 'inventory.adjustment', prefix: 'SADJ' },
  { documentType: 'inventory.transfer',   prefix: 'STR' },
  { documentType: 'accounting.jv',        prefix: 'JV' },
];

async function seedSeries(companyId: string, defs: SeriesDef[], fiscalYear: string): Promise<void> {
  for (const s of defs) {
    await db
      .insert(documentNumberSeries)
      .values({
        companyId,
        plantId: null,
        documentType: s.documentType,
        prefix: s.prefix,
        fiscalYear,
        includeFiscalYear: true,
        includePlantCode: s.includePlantCode ?? false,
        padding: 4,
        currentNumber: 0,
        resetOnNewYear: true,
      })
      .onConflictDoNothing();
  }
}

export async function seedPurchaseNumberSeries(
  companyId: string,
  fiscalYear: string = currentFiscalYear()
): Promise<void> {
  await seedSeries(companyId, PURCHASE_SERIES, fiscalYear);
}

export async function seedSalesNumberSeries(
  companyId: string,
  fiscalYear: string = currentFiscalYear()
): Promise<void> {
  await seedSeries(companyId, SALES_SERIES, fiscalYear);
}

export async function seedManufacturingNumberSeries(
  companyId: string,
  fiscalYear: string = currentFiscalYear()
): Promise<void> {
  await seedSeries(companyId, MANUFACTURING_SERIES, fiscalYear);
}
export async function seedInventoryNumberSeries(
  companyId: string,
  fiscalYear: string = currentFiscalYear()
): Promise<void> {
  await seedSeries(companyId, INVENTORY_SERIES, fiscalYear);
}



if (process.argv[1] && process.argv[1].endsWith('number-series.ts')) {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error('Usage: tsx number-series.ts <companyId> [fiscalYear]');
    process.exit(1);
  }
  const fy = process.argv[3];
  Promise.all([
    seedPurchaseNumberSeries(companyId, fy),
    seedSalesNumberSeries(companyId, fy),
    seedManufacturingNumberSeries(companyId, fy),
    seedInventoryNumberSeries(companyId, fy),
  ])
    .then(() => {
      console.log(`✓ Seeded purchase + sales number series for company ${companyId}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
