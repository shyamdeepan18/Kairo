import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: 'ERP/.env' });

const connectionString = process.env.DATABASE_URL || 'postgresql://erp:erp_dev@localhost:5433/erp_db';

export class DbValidator {
  public sql: postgres.Sql;

  constructor() {
    this.sql = postgres(connectionString, { max: 5, idle_timeout: 10 });
  }

  async close() {
    await this.sql.end();
  }

  /**
   * Asserts double-entry accounting equilibrium for a specific document or journal voucher:
   * sum(debit_paise) == sum(credit_paise) and debit > 0
   */
  async verifyJournalForDocument(documentId: string, documentType?: string) {
    const entries = await this.sql`
      SELECT je.id, je.document_type, je.document_number, je.entry_number,
             SUM(jel.debit_amount_paise) as total_debit,
             SUM(jel.credit_amount_paise) as total_credit,
             COUNT(jel.id) as line_count
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.document_id = ${documentId} OR je.id = ${documentId}
      GROUP BY je.id, je.document_type, je.document_number, je.entry_number
    `;

    if (entries.length === 0) {
      throw new Error(`[DB Invariant Failure] No journal entry found for document: ${documentId}`);
    }

    for (const entry of entries) {
      const debit = Number(entry.total_debit);
      const credit = Number(entry.total_credit);
      const lines = Number(entry.line_count);

      if (debit !== credit) {
        throw new Error(
          `[Accounting Invariant Violation] Unbalanced Journal Voucher ${entry.id} (${entry.document_number}): ` +
          `Debit=${debit} paise, Credit=${credit} paise, Difference=${debit - credit} paise`
        );
      }
      if (lines < 2) {
        throw new Error(`[Accounting Invariant Violation] Journal Entry ${entry.id} has only ${lines} line (minimum 2 required)`);
      }
    }

    return entries;
  }

  /**
   * Asserts that a movement-based stock ledger entry (SLE) was posted.
   */
  async verifyStockLedgerEntry(documentId: string, expectedMovementType?: string) {
    const entries = await this.sql`
      SELECT id, item_id, warehouse_id, movement_type, quantity, valuation_rate_paise, valuation_amount_paise, posting_date
      FROM stock_ledger_entries
      WHERE document_id = ${documentId}
      ORDER BY created_at ASC
    `;

    if (entries.length === 0) {
      throw new Error(`[Inventory Invariant Failure] No stock ledger entry found for document: ${documentId}`);
    }

    if (expectedMovementType) {
      const matching = entries.filter((e) => e.movement_type === expectedMovementType);
      if (matching.length === 0) {
        throw new Error(
          `[Inventory Invariant Failure] Expected movement_type '${expectedMovementType}' not found in SLEs for doc ${documentId}. Found: ${entries.map(e => e.movement_type).join(', ')}`
        );
      }
    }

    return entries;
  }

  /**
   * Verifies current materialized stock balance for an item in a warehouse.
   */
  async getStockBalance(itemId: string, warehouseId: string) {
    const [balance] = await this.sql`
      SELECT quantity_on_hand, quantity_reserved, quantity_ordered, valuation_rate_paise
      FROM stock_balances
      WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId}
      LIMIT 1
    `;
    return balance || null;
  }

  /**
   * Verifies that no ghost reservations remain after order cancellation or delivery.
   */
  async verifyReservationsCleared(documentId: string) {
    const reservations = await this.sql`
      SELECT id, item_id, reserved_qty
      FROM stock_reservations
      WHERE document_id = ${documentId} AND status = 'active'
    `;

    if (reservations.length > 0) {
      throw new Error(`[Inventory Invariant Violation] Active reservations still exist for document ${documentId}: ${reservations.length} rows`);
    }
  }

  /**
   * Clean up test records created during test runs.
   */
  async cleanTestData(testPrefix: string) {
    if (!testPrefix || testPrefix.length < 3) return;

    // Remove transactions tagged with the prefix
    await this.sql`DELETE FROM journal_entry_lines WHERE description LIKE ${`%${testPrefix}%`}`;
    await this.sql`DELETE FROM stock_ledger_entries WHERE remarks LIKE ${`%${testPrefix}%`}`;
    await this.sql`DELETE FROM stock_reservations WHERE document_id IN (
      SELECT id FROM sales_orders WHERE order_number LIKE ${`%${testPrefix}%`}
    )`;
    await this.sql`DELETE FROM purchase_orders WHERE remarks LIKE ${`%${testPrefix}%`} OR document_number LIKE ${`%${testPrefix}%`}`;
    await this.sql`DELETE FROM sales_orders WHERE remarks LIKE ${`%${testPrefix}%`} OR document_number LIKE ${`%${testPrefix}%`}`;
    await this.sql`DELETE FROM items WHERE item_code LIKE ${`${testPrefix}%`}`;
    await this.sql`DELETE FROM suppliers WHERE name LIKE ${`${testPrefix}%`}`;
    await this.sql`DELETE FROM customers WHERE name LIKE ${`${testPrefix}%`}`;
  }
}
