import { db } from '@erp/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    const query = sql`
        SELECT 
          s.name as supplier_name,
          jel.party_id,
          SUM(jel.credit_amount_paise) as total_credit,
          SUM(jel.debit_amount_paise) as total_debit,
          SUM(jel.credit_amount_paise - jel.debit_amount_paise) as outstanding,
          SUM(CASE WHEN current_date - je.posting_date <= 30 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "0_30",
          SUM(CASE WHEN current_date - je.posting_date > 30 AND current_date - je.posting_date <= 60 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "31_60",
          SUM(CASE WHEN current_date - je.posting_date > 60 AND current_date - je.posting_date <= 90 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "61_90",
          SUM(CASE WHEN current_date - je.posting_date > 90 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "90_plus"
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN suppliers s ON jel.party_id = s.id
        WHERE jel.party_type = 'supplier'
        GROUP BY s.name, jel.party_id
        HAVING SUM(jel.credit_amount_paise - jel.debit_amount_paise) > 0
      `;
    const result = await db.execute(query);
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}
run();
