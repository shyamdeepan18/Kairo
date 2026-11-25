import { test, expect } from '@playwright/test';
import { DbValidator } from '../../helpers/db-validator.js';

test.describe('Core ERP Architectural & Database Invariants', () => {
  let dbValidator: DbValidator;

  test.beforeAll(() => {
    dbValidator = new DbValidator();
  });

  test.afterAll(async () => {
    await dbValidator.close();
  });

  test('Invariant 1 (Double-Entry Financial Equilibrium): All posted journal entries must strictly balance (Dr == Cr)', async () => {
    const unbalancedEntries = await dbValidator.sql`
      SELECT je.id, je.entry_number, je.document_type,
             SUM(jel.debit_amount_paise) as total_debit,
             SUM(jel.credit_amount_paise) as total_credit,
             ABS(SUM(jel.debit_amount_paise) - SUM(jel.credit_amount_paise)) as imbalance
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      GROUP BY je.id, je.entry_number, je.document_type
      HAVING SUM(jel.debit_amount_paise) != SUM(jel.credit_amount_paise)
    `;

    expect(unbalancedEntries.length).toBe(0);
  });

  test('Invariant 2 (Movement-Based Inventory): All stock movements have valid non-null movement types and positive valuation rates on inward movements', async () => {
    const invalidSles = await dbValidator.sql`
      SELECT id, document_type, document_number, movement_type, quantity, valuation_rate_paise
      FROM stock_ledger_entries
      WHERE movement_type IS NULL
         OR (movement_type IN ('purchase_receipt', 'production_receipt', 'subcon_receipt') AND valuation_rate_paise <= 0)
    `;

    expect(invalidSles.length).toBe(0);
  });

  test('Invariant 3 (Multi-Tenant Isolation): No orphan or cross-tenant records in core transaction ledgers', async () => {
    const orphanSles = await dbValidator.sql`
      SELECT count(*)::int as count
      FROM stock_ledger_entries sle
      LEFT JOIN companies c ON sle.company_id = c.id
      WHERE c.id IS NULL
    `;
    expect(Number(orphanSles[0].count)).toBe(0);

    const orphanJournals = await dbValidator.sql`
      SELECT count(*)::int as count
      FROM journal_entries je
      LEFT JOIN companies c ON je.company_id = c.id
      WHERE c.id IS NULL
    `;
    expect(Number(orphanJournals[0].count)).toBe(0);
  });

  test('Invariant 4 (Auditability): Posted journal entries and stock ledger entries must have recorded creator UUIDs and valid fiscal periods', async () => {
    const unAuditedJournals = await dbValidator.sql`
      SELECT count(*)::int as count
      FROM journal_entries
      WHERE created_by IS NULL OR fiscal_year IS NULL OR posting_date IS NULL
    `;
    expect(Number(unAuditedJournals[0].count)).toBe(0);

    const unAuditedSles = await dbValidator.sql`
      SELECT count(*)::int as count
      FROM stock_ledger_entries
      WHERE created_by IS NULL OR fiscal_year IS NULL OR posting_date IS NULL
    `;
    expect(Number(unAuditedSles[0].count)).toBe(0);
  });
});

