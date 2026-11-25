import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: 'ERP/.env' });

const connectionString = process.env.DATABASE_URL || 'postgresql://erp:erp_dev@localhost:5433/erp_db';

export interface JournalLineRecord {
  id: string;
  accountCode: string;
  accountName: string;
  postingCategory: string | null;
  debitAmountPaise: number;
  creditAmountPaise: number;
  partyType: 'supplier' | 'customer' | null;
  partyId: string | null;
  narration: string | null;
}

export interface JournalRecord {
  id: string;
  documentType: string;
  documentNumber: string;
  entryNumber: string;
  postingDate: string;
  fiscalYear: string;
  period: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  lines: JournalLineRecord[];
}

export interface PartyBalanceResult {
  partyType: 'supplier' | 'customer';
  partyId: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  outstandingPaise: number;
}

export interface AccountBalanceResult {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: 'debit' | 'credit';
  postingCategory: string | null;
  totalDebitPaise: number;
  totalCreditPaise: number;
  netBalancePaise: number;
}

export class FinancialValidator {
  public sql: postgres.Sql;

  constructor() {
    this.sql = postgres(connectionString, { max: 5, idle_timeout: 10 });
  }

  async close() {
    await this.sql.end();
  }

  /**
   * Retrieves and verifies all journal entries and lines for a given document.
   * Asserts strict double-entry equilibrium: sum(debit) == sum(credit) > 0.
   */
  async getDocumentJournal(documentId: string): Promise<JournalRecord[]> {
    const rawLines = await this.sql`
      SELECT je.id as journal_id, je.document_type, je.document_number, je.entry_number,
             je.posting_date, je.fiscal_year, je.period,
             jel.id as line_id, jel.debit_amount_paise, jel.credit_amount_paise,
             jel.party_type, jel.party_id, jel.narration,
             coa.id as account_id, coa.code as account_code, coa.name as account_name,
             coa.posting_category
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts coa ON coa.id = jel.account_id
      WHERE je.document_id = ${documentId} OR je.id = ${documentId}
      ORDER BY je.created_at ASC, jel.id ASC;
    `;

    if (rawLines.length === 0) {
      throw new Error(`[FinancialValidator] No journal entry found for document ID: ${documentId}`);
    }

    const journalsMap = new Map<string, JournalRecord>();

    for (const r of rawLines) {
      let j = journalsMap.get(r.journal_id);
      if (!j) {
        j = {
          id: r.journal_id,
          documentType: r.document_type,
          documentNumber: r.document_number,
          entryNumber: r.entry_number,
          postingDate: r.posting_date,
          fiscalYear: r.fiscal_year,
          period: r.period,
          totalDebitPaise: 0,
          totalCreditPaise: 0,
          lines: [],
        };
        journalsMap.set(r.journal_id, j);
      }

      const dr = Number(r.debit_amount_paise);
      const cr = Number(r.credit_amount_paise);
      j.totalDebitPaise += dr;
      j.totalCreditPaise += cr;

      j.lines.push({
        id: r.line_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        postingCategory: r.posting_category,
        debitAmountPaise: dr,
        creditAmountPaise: cr,
        partyType: r.party_type,
        partyId: r.party_id,
        narration: r.narration,
      });
    }

    const journals = Array.from(journalsMap.values());
    for (const j of journals) {
      if (j.totalDebitPaise !== j.totalCreditPaise) {
        throw new Error(
          `[Double-Entry Invariant Failure] Journal ${j.documentNumber} (${j.entryNumber}) is unbalanced: ` +
          `Debit = ${j.totalDebitPaise} paise, Credit = ${j.totalCreditPaise} paise, Diff = ${j.totalDebitPaise - j.totalCreditPaise}`
        );
      }
      if (j.totalDebitPaise === 0) {
        throw new Error(`[Double-Entry Invariant Failure] Journal ${j.documentNumber} has zero total value.`);
      }
    }

    return journals;
  }

  /**
   * Computes party (Vendor or Customer) subledger balance from all posted journal entries.
   * For Suppliers: Outstanding = Total Credits (Liabilities) - Total Debits (Payments/Debit Notes)
   * For Customers: Outstanding = Total Debits (Receivables) - Total Credits (Receipts/Credit Notes)
   */
  async getPartyBalance(partyType: 'supplier' | 'customer', partyId: string): Promise<PartyBalanceResult> {
    const [row] = await this.sql`
      SELECT COALESCE(SUM(debit_amount_paise), 0)::bigint as total_debit,
             COALESCE(SUM(credit_amount_paise), 0)::bigint as total_credit
      FROM journal_entry_lines
      WHERE party_type = ${partyType} AND party_id = ${partyId};
    `;

    const dr = Number(row?.total_debit ?? 0);
    const cr = Number(row?.total_credit ?? 0);

    // Vendor outstanding liability is credit-normal; customer outstanding receivable is debit-normal
    const outstanding = partyType === 'supplier' ? cr - dr : dr - cr;

    return {
      partyType,
      partyId,
      totalDebitPaise: dr,
      totalCreditPaise: cr,
      outstandingPaise: outstanding,
    };
  }

  /**
   * Computes the net balance of a specific GL account category (e.g. 'grn_clearing', 'inventory_raw_material', etc.)
   */
  async getAccountBalanceByCategory(companyId: string, category: string): Promise<AccountBalanceResult> {
    const [row] = await this.sql`
      SELECT coa.id, coa.code, coa.name, coa.account_type, coa.normal_balance, coa.posting_category,
             COALESCE(SUM(jel.debit_amount_paise), 0)::bigint as total_debit,
             COALESCE(SUM(jel.credit_amount_paise), 0)::bigint as total_credit
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
      WHERE coa.company_id = ${companyId} AND coa.posting_category = ${category}
      GROUP BY coa.id, coa.code, coa.name, coa.account_type, coa.normal_balance, coa.posting_category
      LIMIT 1;
    `;

    if (!row) {
      throw new Error(`[FinancialValidator] Account category '${category}' not found in Chart of Accounts for company ${companyId}`);
    }

    const dr = Number(row.total_debit);
    const cr = Number(row.total_credit);
    const net = row.normal_balance === 'debit' ? dr - cr : cr - dr;

    return {
      accountId: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      normalBalance: row.normal_balance,
      postingCategory: row.posting_category,
      totalDebitPaise: dr,
      totalCreditPaise: cr,
      netBalancePaise: net,
    };
  }

  /**
   * Asserts that GRNI (GR/IR Clearing suspense account 'grn_clearing' / Code 2510) has a specific expected net balance.
   */
  async assertGrnClearingBalance(companyId: string, expectedBalancePaise: number) {
    const bal = await this.getAccountBalanceByCategory(companyId, 'grn_clearing');
    if (bal.netBalancePaise !== expectedBalancePaise) {
      throw new Error(
        `[GRNI Accrual Invariant Failure] GR/IR Clearing Account ${bal.code} (${bal.name}) expected balance ` +
        `${expectedBalancePaise} paise, but found ${bal.netBalancePaise} paise (DR=${bal.totalDebitPaise}, CR=${bal.totalCreditPaise})`
      );
    }
    return bal;
  }

  /**
   * Asserts complete Inventory Subledger Reconciliation:
   * 1. stock_balances (quantity_on_hand, quantity_reserved) matches physical records.
   * 2. Total movement history in stock_ledger_entries exactly sums up to stock_balances.
   * 3. Total valuation amount matches quantity * current WAC rate.
   */
  async assertInventorySubledger(itemId: string, warehouseId: string, expectedOnHand: number, expectedValuationPaise?: number) {
    const [bal] = await this.sql`
      SELECT quantity_on_hand, quantity_reserved, quantity_ordered
      FROM stock_balances
      WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId}
      LIMIT 1;
    `;

    const onHand = Number(bal?.quantity_on_hand ?? 0);
    if (onHand !== expectedOnHand) {
      throw new Error(
        `[Inventory Invariant Failure] Item ${itemId} in Warehouse ${warehouseId}: expected on-hand ${expectedOnHand}, found ${onHand}`
      );
    }

    // Verify stock_ledger_entries movement history
    const sles = await this.sql`
      SELECT id, movement_type, quantity, valuation_rate_paise, valuation_amount_paise, created_at
      FROM stock_ledger_entries
      WHERE item_id = ${itemId} AND warehouse_id = ${warehouseId}
      ORDER BY created_at ASC;
    `;

    let calculatedOnHand = 0;
    for (const sle of sles) {
      const q = Number(sle.quantity);
      // Inward movements add stock; Outward movements subtract stock
      const isInward = ['purchase_receipt', 'subcon_receipt', 'production_receipt', 'transfer_receipt', 'opening_stock', 'adjustment_in', 'sales_return'].includes(sle.movement_type);
      calculatedOnHand += isInward ? q : -q;
    }

    if (calculatedOnHand !== expectedOnHand) {
      throw new Error(
        `[Stock Ledger Reconciliation Failure] Sum of movements in stock_ledger_entries (${calculatedOnHand}) ` +
        `does not match expected on-hand (${expectedOnHand}) for item ${itemId}`
      );
    }

    if (expectedValuationPaise !== undefined) {
      const latestSle = sles[sles.length - 1];
      const actualValuation = onHand * Number(latestSle?.valuation_rate_paise ?? 0);
      if (actualValuation !== expectedValuationPaise) {
        throw new Error(
          `[Inventory Valuation Failure] Expected inventory valuation ${expectedValuationPaise} paise, ` +
          `calculated ${actualValuation} paise (${onHand} units @ ${latestSle?.valuation_rate_paise} paise/unit)`
        );
      }
    }

    return {
      quantityOnHand: onHand,
      quantityReserved: Number(bal?.quantity_reserved ?? 0),
      quantityOrdered: Number(bal?.quantity_ordered ?? 0),
      movementsCount: sles.length,
    };
  }

  /**
   * Asserts Global Double-Entry Accounting Equilibrium across all active companies:
   * Total Debits == Total Credits across the entire database with 0 imbalance.
   */
  async assertGlobalAccountingEquilibrium() {
    const [result] = await this.sql`
      SELECT COALESCE(SUM(debit_amount_paise), 0)::bigint as global_debit,
             COALESCE(SUM(credit_amount_paise), 0)::bigint as global_credit,
             COUNT(DISTINCT journal_entry_id)::int as total_journals
      FROM journal_entry_lines;
    `;

    const dr = Number(result?.global_debit ?? 0);
    const cr = Number(result?.global_credit ?? 0);

    if (dr !== cr) {
      throw new Error(
        `[Critical Accounting Ledger Invariant Violation] Global General Ledger is out of equilibrium! ` +
        `Total Dr = ${dr} paise, Total Cr = ${cr} paise, Discrepancy = ${dr - cr} paise`
      );
    }

    return {
      globalDebitPaise: dr,
      globalCreditPaise: cr,
      totalJournals: result.total_journals,
    };
  }
}

