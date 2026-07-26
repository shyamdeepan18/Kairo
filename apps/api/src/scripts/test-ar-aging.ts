import { db, journalEntries, journalEntryLines, chartOfAccounts, customers, companies, users, userRoles } from '@erp/db';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    const comp = await db.select().from(companies).limit(1).then(r => r[0]);
    const usr = await db.select().from(users).limit(1).then(r => r[0]);
    const cust = await db.select().from(customers).limit(1).then(r => r[0]);
    const coa = await db.select().from(chartOfAccounts).limit(1).then(r => r[0]);

    if (!cust || !coa || !comp || !usr) {
      console.log('Missing data');
      process.exit(1);
    }

    const [je] = await db.insert(journalEntries).values({
      companyId: comp.id,
      entryNumber: 'TEST-JV-01',
      postingDate: '2026-07-26',
      fiscalYear: '2627',
      period: 4,
      createdBy: usr.id,
    }).returning();

    await db.insert(journalEntryLines).values({
      journalEntryId: je.id,
      lineNumber: 1,
      accountId: coa.id,
      debitAmountPaise: 1000,
      creditAmountPaise: 0,
      partyType: 'customer',
      partyId: cust.id,
    });

    const query = sql`
        SELECT 
          c.name as customer_name,
          jel.party_id,
          SUM(jel.debit_amount_paise) as total_debit,
          SUM(jel.credit_amount_paise) as total_credit,
          SUM(jel.debit_amount_paise - jel.credit_amount_paise) as outstanding,
          SUM(CASE WHEN current_date - je.posting_date <= 30 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "0_30",
          SUM(CASE WHEN current_date - je.posting_date > 30 AND current_date - je.posting_date <= 60 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "31_60",
          SUM(CASE WHEN current_date - je.posting_date > 60 AND current_date - je.posting_date <= 90 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "61_90",
          SUM(CASE WHEN current_date - je.posting_date > 90 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "90_plus"
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN customers c ON jel.party_id = c.id
        WHERE jel.party_type = 'customer'
        GROUP BY c.name, jel.party_id
        HAVING SUM(jel.debit_amount_paise - jel.credit_amount_paise) > 0
      `;
    const result = await db.execute(query);
    console.log('AR Result:', result);

    await db.delete(journalEntryLines).where(sql`journal_entry_id = ${je.id}`);
    await db.delete(journalEntries).where(sql`id = ${je.id}`);
  } catch (error) {
    console.error('AR Error:', error);
  }
  process.exit(0);
}
run();
