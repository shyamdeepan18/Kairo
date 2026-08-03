import { sql, eq, and, isNull } from 'drizzle-orm';
import { db, documentNumberSeries, plants } from '@erp/db';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@erp/db';

type DB = PostgresJsDatabase<typeof schema>;

// ─── NumberSeriesService ───────────────────────────────────────────────────
//
// Generates sequential, gap-free document numbers.
//
// CRITICAL: always call next() inside the same db.transaction() as the
// document INSERT. If the transaction rolls back, the sequence number is
// "lost" (a gap forms). This is acceptable for Indian GST compliance —
// what's not acceptable is duplicate numbers.
//
// Format examples:
//   includeFiscalYear=true,  includePlantCode=false → PO/2425/0001
//   includeFiscalYear=true,  includePlantCode=true  → PO/2425/MUM/0001
//   includeFiscalYear=false, includePlantCode=false → PO/0001

export class NumberSeriesService {
  /**
   * Atomically increments the series counter and returns the formatted number.
   *
   * @param tx          Drizzle transaction (must be the same tx used to insert the doc)
   * @param companyId   Company UUID
   * @param documentType  e.g. 'purchase.po'
   * @param opts.plantId    Plant UUID (used to find plant-specific series first)
   * @param opts.plantCode  Plant short code for the formatted number (e.g. 'MUM')
   * @param opts.fiscalYear Override fiscal year (e.g. '2425'). Defaults to current FY.
   */
  async next(
    tx: any,
    companyId: string,
    documentType: string,
    opts?: { plantId?: string; plantCode?: string; fiscalYear?: string }
  ): Promise<string> {
    const fiscalYear = opts?.fiscalYear ?? this.currentFiscalYear();

    // Atomically find, lock, and increment the best-matching series row.
    //
    // Resolution priority:
    //   1. Plant-specific row (company + type + plantId + fiscalYear)
    //   2. Company-wide row  (company + type + plantId IS NULL + fiscalYear)
    //
    // UPDATE … RETURNING is atomic — no separate SELECT + UPDATE needed.
    const result = await tx.execute(sql`
      WITH target AS (
        SELECT id
        FROM document_number_series
        WHERE company_id   = ${companyId}
          AND document_type = ${documentType}
          AND (fiscal_year = ${fiscalYear} OR fiscal_year IS NULL)
          AND is_active     = true
          AND (
            plant_id = ${opts?.plantId ?? null}::uuid
            OR plant_id IS NULL
          )
        ORDER BY
          CASE WHEN plant_id = ${opts?.plantId ?? null}::uuid THEN 0 ELSE 1 END,
          CASE WHEN fiscal_year = ${fiscalYear} THEN 0 ELSE 1 END
        LIMIT 1
        FOR UPDATE
      )
      UPDATE document_number_series s
      SET
        current_number = s.current_number + 1,
        updated_at     = NOW()
      FROM target
      WHERE s.id = target.id
      RETURNING
        s.prefix,
        s.current_number,
        s.padding,
        s.include_fiscal_year,
        s.include_plant_code,
        s.fiscal_year
    `);

    const rows = result as unknown as Array<{
      prefix: string;
      current_number: number;
      padding: number;
      include_fiscal_year: boolean;
      include_plant_code: boolean;
      fiscal_year: string | null;
    }>;

    if (!rows || rows.length === 0) {
      // Auto-provision a default series for this document type if missing
      const defaultPrefixes: Record<string, string> = {
        'purchase.requisition': 'PR',
        'purchase.po': 'PO',
        'purchase.grn': 'GRN',
        'purchase.invoice': 'PINV',
        'purchase.payment': 'PPAY',
        'sales.quotation': 'QTN',
        'sales.so': 'SO',
        'sales.delivery': 'DN',
        'sales.invoice': 'SINV',
        'sales.receipt': 'RCPT',
        'sales.payment': 'RCPT',
        'inventory.adjustment': 'SADJ',
        'inventory.transfer': 'STR',
        'manufacturing.bom': 'BOM',
        'manufacturing.order': 'MO',
        'accounting.jv': 'JV',
      };
      const prefix = defaultPrefixes[documentType] || documentType.split('.').pop()?.toUpperCase() || 'DOC';

      await tx.insert(documentNumberSeries).values({
        companyId,
        plantId: null,
        documentType,
        prefix,
        fiscalYear,
        includeFiscalYear: true,
        includePlantCode: false,
        padding: 4,
        currentNumber: 1,
        resetOnNewYear: true,
        isActive: true,
      }).onConflictDoNothing();

      const retryResult = await tx.execute(sql`
        SELECT prefix, current_number, padding, include_fiscal_year, include_plant_code, fiscal_year
        FROM document_number_series
        WHERE company_id = ${companyId} AND document_type = ${documentType}
        LIMIT 1
      `);
      const retryRows = retryResult as unknown as Array<{
        prefix: string;
        current_number: number;
        padding: number;
        include_fiscal_year: boolean;
        include_plant_code: boolean;
        fiscal_year: string | null;
      }>;
      if (retryRows && retryRows.length > 0) {
        return this.format(retryRows[0], opts?.plantCode);
      }

      throw new Error(
        `No active number series found for documentType="${documentType}" ` +
        `companyId="${companyId}" fiscalYear="${fiscalYear}". ` +
        `Create a row in document_number_series first.`
      );
    }

    const s = rows[0];
    return this.format(s, opts?.plantCode);
  }

  /**
   * Seed helper: create a default company-wide series for a document type.
   * Safe to call multiple times (no-op if the series already exists).
   */
  async ensureSeries(
    companyId: string,
    documentType: string,
    prefix: string,
    opts?: {
      plantId?: string;
      includeFiscalYear?: boolean;
      includePlantCode?: boolean;
      padding?: number;
    }
  ): Promise<void> {
    const fiscalYear = this.currentFiscalYear();

    await db
      .insert(documentNumberSeries)
      .values({
        companyId,
        plantId: opts?.plantId ?? null,
        documentType,
        prefix,
        fiscalYear,
        includeFiscalYear: opts?.includeFiscalYear ?? true,
        includePlantCode: opts?.includePlantCode ?? false,
        padding: opts?.padding ?? 4,
        currentNumber: 0,
        resetOnNewYear: true,
      })
      .onConflictDoNothing();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns the fiscal year string for the current date.
   * Indian fiscal year runs April 1 – March 31.
   * FY 2026–27 → '2627'
   */
  currentFiscalYear(): string {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-indexed
    const year = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = fyStart + 1;
    return `${String(fyStart).slice(-2)}${String(fyEnd).slice(-2)}`;
  }

  private format(
    s: {
      prefix: string;
      current_number: number;
      padding: number;
      include_fiscal_year: boolean;
      include_plant_code: boolean;
      fiscal_year: string | null;
    },
    plantCode?: string
  ): string {
    const seq = String(s.current_number).padStart(s.padding, '0');
    const parts = [s.prefix];
    if (s.include_fiscal_year && s.fiscal_year) parts.push(s.fiscal_year);
    if (s.include_plant_code && plantCode) parts.push(plantCode);
    parts.push(seq);
    return parts.join('/');
  }
}
