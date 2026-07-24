/**
 * Seed: Standard Indian SME Chart of Accounts
 *
 * Creates the COA for a given companyId and auto-builds the
 * company_account_config row so PostingEngine works out of the box.
 *
 * Usage (called during company onboarding, not a one-time global seed):
 *   await seedCoaForCompany(companyId, createdByUserId);
 *
 * Safe to call multiple times — uses INSERT ON CONFLICT DO NOTHING.
 *
 * Account numbering:
 *   1xxx = Assets
 *   2xxx = Liabilities
 *   3xxx = Revenue
 *   4xxx = Expenses
 */

import { db, chartOfAccounts, companyAccountConfig } from '../index.js';
import type { PostingCategory } from '../schema/accounting.js';

interface AccountDef {
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  isGroup: boolean;
  parentCode?: string;
  postingCategory?: PostingCategory;
}

// ─── Account definitions ──────────────────────────────────────────────────

const ACCOUNTS: AccountDef[] = [
  // ── Assets ────────────────────────────────────────────────────────────
  { code: '1000', name: 'Assets',                 accountType: 'asset',     normalBalance: 'debit',  isGroup: true },
  { code: '1100', name: 'Fixed Assets',           accountType: 'asset',     normalBalance: 'debit',  isGroup: true, parentCode: '1000' },
  { code: '1110', name: 'Land',                   accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1100' },
  { code: '1120', name: 'Buildings',              accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1100' },
  { code: '1130', name: 'Plant & Machinery',      accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1100', postingCategory: 'fixed_assets' },
  { code: '1140', name: 'Vehicles',               accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1100' },
  { code: '1150', name: 'Furniture & Fixtures',   accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1100' },
  { code: '1190', name: 'Accumulated Depreciation', accountType: 'asset',   normalBalance: 'credit', isGroup: false, parentCode: '1100', postingCategory: 'accumulated_depreciation' },

  { code: '1300', name: 'Inventories',            accountType: 'asset',     normalBalance: 'debit',  isGroup: true,  parentCode: '1000' },
  { code: '1310', name: 'Raw Materials',          accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_raw_material' },
  { code: '1320', name: 'Work in Progress',       accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_wip' },
  { code: '1325', name: 'Semi-Finished Goods',    accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_semi_finished' },
  { code: '1330', name: 'Finished Goods',         accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_finished' },
  { code: '1340', name: 'Stores & Consumables',   accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_stores' },
  { code: '1350', name: 'Scrap',                  accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1300', postingCategory: 'inventory_scrap' },

  { code: '1400', name: 'Trade Receivables',      accountType: 'asset',     normalBalance: 'debit',  isGroup: true,  parentCode: '1000' },
  { code: '1410', name: 'Debtors (Trade)',         accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1400', postingCategory: 'accounts_receivable' },
  { code: '1420', name: 'Advance from Customers', accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1400', postingCategory: 'customer_advance' },

  { code: '1500', name: 'Cash & Bank',            accountType: 'asset',     normalBalance: 'debit',  isGroup: true,  parentCode: '1000' },
  { code: '1510', name: 'Cash in Hand',           accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1500', postingCategory: 'cash' },
  { code: '1520', name: 'Bank Account',           accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1500', postingCategory: 'bank' },

  { code: '1600', name: 'Other Current Assets',   accountType: 'asset',     normalBalance: 'debit',  isGroup: true,  parentCode: '1000' },
  { code: '1610', name: 'GST Input Credit',       accountType: 'asset',     normalBalance: 'debit',  isGroup: true,  parentCode: '1600' },
  { code: '1611', name: 'Input CGST',             accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1610', postingCategory: 'input_cgst' },
  { code: '1612', name: 'Input SGST',             accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1610', postingCategory: 'input_sgst' },
  { code: '1613', name: 'Input IGST',             accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1610', postingCategory: 'input_igst' },
  { code: '1620', name: 'Advance to Suppliers',   accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1600', postingCategory: 'supplier_advance' },
  { code: '1630', name: 'Prepaid Expenses',       accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1600' },
  { code: '1640', name: 'Other Receivables',      accountType: 'asset',     normalBalance: 'debit',  isGroup: false, parentCode: '1600' },

  // ── Liabilities ───────────────────────────────────────────────────────
  { code: '2000', name: 'Liabilities',            accountType: 'liability', normalBalance: 'credit', isGroup: true },
  { code: '2100', name: 'Equity & Reserves',      accountType: 'equity',    normalBalance: 'credit', isGroup: true,  parentCode: '2000' },
  { code: '2110', name: 'Share Capital',          accountType: 'equity',    normalBalance: 'credit', isGroup: false, parentCode: '2100' },
  { code: '2120', name: 'Retained Earnings',      accountType: 'equity',    normalBalance: 'credit', isGroup: false, parentCode: '2100' },
  { code: '2130', name: 'General Reserve',        accountType: 'equity',    normalBalance: 'credit', isGroup: false, parentCode: '2100' },

  { code: '2200', name: 'Long-term Borrowings',   accountType: 'liability', normalBalance: 'credit', isGroup: true,  parentCode: '2000' },
  { code: '2210', name: 'Term Loans',             accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2200' },

  { code: '2300', name: 'Trade Payables',         accountType: 'liability', normalBalance: 'credit', isGroup: true,  parentCode: '2000' },
  { code: '2310', name: 'Creditors (Trade)',       accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2300', postingCategory: 'accounts_payable' },

  { code: '2400', name: 'Statutory Liabilities',  accountType: 'liability', normalBalance: 'credit', isGroup: true,  parentCode: '2000' },
  { code: '2410', name: 'GST Payable',            accountType: 'liability', normalBalance: 'credit', isGroup: true,  parentCode: '2400' },
  { code: '2411', name: 'GST Payable (CGST)',     accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2410', postingCategory: 'output_cgst' },
  { code: '2412', name: 'GST Payable (SGST)',     accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2410', postingCategory: 'output_sgst' },
  { code: '2413', name: 'GST Payable (IGST)',     accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2410', postingCategory: 'output_igst' },
  { code: '2420', name: 'TDS Payable',            accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2400' },
  { code: '2430', name: 'Salaries Payable',       accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2400', postingCategory: 'salary_payable' },
  { code: '2440', name: 'PF Payable',             accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2400', postingCategory: 'pf_payable' },
  { code: '2450', name: 'ESI Payable',            accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2400', postingCategory: 'esi_payable' },
  { code: '2460', name: 'Professional Tax Payable', accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2400', postingCategory: 'professional_tax_payable' },

  { code: '2500', name: 'Clearing Accounts',      accountType: 'liability', normalBalance: 'credit', isGroup: true,  parentCode: '2000' },
  { code: '2510', name: 'GR/IR Clearing',         accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2500', postingCategory: 'grn_clearing' },
  { code: '2511', name: 'GR/IR Tax Clearing',     accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2500', postingCategory: 'grn_tax_clearing' },
  { code: '2520', name: 'Round-off Account',      accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2500', postingCategory: 'round_off' },
  { code: '2530', name: 'Customer Advances',      accountType: 'liability', normalBalance: 'credit', isGroup: false, parentCode: '2500' },

  // ── Revenue ───────────────────────────────────────────────────────────
  { code: '3000', name: 'Revenue',                accountType: 'revenue',   normalBalance: 'credit', isGroup: true },
  { code: '3010', name: 'Sales — Products',       accountType: 'revenue',   normalBalance: 'credit', isGroup: false, parentCode: '3000', postingCategory: 'sales_revenue' },
  { code: '3020', name: 'Sales — Services',       accountType: 'revenue',   normalBalance: 'credit', isGroup: false, parentCode: '3000', postingCategory: 'service_revenue' },
  { code: '3030', name: 'Sales Returns',          accountType: 'revenue',   normalBalance: 'debit',  isGroup: false, parentCode: '3000' },
  { code: '3040', name: 'Other Income',           accountType: 'revenue',   normalBalance: 'credit', isGroup: false, parentCode: '3000' },

  // ── Expenses ──────────────────────────────────────────────────────────
  { code: '4000', name: 'Expenses',              accountType: 'expense',   normalBalance: 'debit',  isGroup: true },
  { code: '4100', name: 'Material Costs',        accountType: 'expense',   normalBalance: 'debit',  isGroup: true,  parentCode: '4000' },
  { code: '4110', name: 'Raw Material Consumed', accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4100', postingCategory: 'raw_material_consumed' },
  { code: '4120', name: 'Packaging Material',    accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4100' },
  { code: '4200', name: 'Direct Labour',         accountType: 'expense',   normalBalance: 'debit',  isGroup: true,  parentCode: '4000' },
  { code: '4210', name: 'Factory Wages',         accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4200', postingCategory: 'salary_expense' },
  { code: '4220', name: 'Labour Absorption',     accountType: 'expense',   normalBalance: 'credit', isGroup: false, parentCode: '4200', postingCategory: 'labour_absorption' },
  { code: '4300', name: 'Manufacturing Overhead',accountType: 'expense',   normalBalance: 'debit',  isGroup: true,  parentCode: '4000' },
  { code: '4310', name: 'Factory Overhead',      accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4300' },
  { code: '4320', name: 'Overhead Absorption',   accountType: 'expense',   normalBalance: 'credit', isGroup: false, parentCode: '4300', postingCategory: 'overhead_absorption' },
  { code: '4400', name: 'Purchases (Trading)',   accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000', postingCategory: 'purchases' },
  { code: '4500', name: 'Administrative Expenses',accountType: 'expense',  normalBalance: 'debit',  isGroup: false, parentCode: '4000' },
  { code: '4600', name: 'Selling & Distribution',accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000' },
  { code: '4700', name: 'Finance Costs',         accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000' },
  { code: '4800', name: 'Depreciation',          accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000', postingCategory: 'depreciation_expense' },
  { code: '4900', name: 'Inventory Adjustments', accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000', postingCategory: 'stock_adjustment' },
  { code: '4910', name: 'Production Variance',   accountType: 'expense',   normalBalance: 'debit',  isGroup: false, parentCode: '4000', postingCategory: 'production_variance' },

  // ── Payroll expenses (employer contributions) ─────────────────────────
  { code: '4230', name: 'PF Employer Contribution',  accountType: 'expense', normalBalance: 'debit',  isGroup: false, parentCode: '4200', postingCategory: 'pf_employer_contribution' },
  { code: '4240', name: 'ESI Employer Contribution', accountType: 'expense', normalBalance: 'debit',  isGroup: false, parentCode: '4200', postingCategory: 'esi_employer_contribution' },
];

import { sql } from 'drizzle-orm';

// ─── seedCoaForCompany ─────────────────────────────────────────────────────
//
// Called during company onboarding (not a global one-time seed).
// Creates all COA accounts for the company and builds the account config map.

export async function seedCoaForCompany(
  companyId: string,
  createdByUserId: string
): Promise<void> {
  console.log(`Seeding COA for company ${companyId}...`);

  // Build insertion order: parents before children
  // ACCOUNTS is already ordered correctly (parents listed before children)

  // Map code → inserted UUID
  const codeToId = new Map<string, string>();

  for (const acct of ACCOUNTS) {
    const parentId = acct.parentCode ? codeToId.get(acct.parentCode) : null;

    const [inserted] = await db
      .insert(chartOfAccounts)
      .values({
        companyId,
        code: acct.code,
        name: acct.name,
        accountType: acct.accountType,
        normalBalance: acct.normalBalance,
        isGroup: acct.isGroup,
        parentId: parentId ?? undefined,
        postingCategory: acct.postingCategory,
        isSystemAccount: true,
        createdBy: createdByUserId,
      })
      .onConflictDoNothing()
      .returning({ id: chartOfAccounts.id });

    if (inserted) {
      codeToId.set(acct.code, inserted.id);
    } else {
      // Account already existed — look it up
      const existing = await db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(
          sql`${chartOfAccounts.companyId} = ${companyId} AND ${chartOfAccounts.code} = ${acct.code}`
        )
        .limit(1);
      if (existing[0]) codeToId.set(acct.code, existing[0].id);
    }
  }

  // Build account config map from postingCategory → UUID
  const config: Partial<Record<PostingCategory, string>> = {};
  for (const acct of ACCOUNTS) {
    if (acct.postingCategory && codeToId.has(acct.code)) {
      config[acct.postingCategory] = codeToId.get(acct.code)!;
    }
  }

  // Upsert company_account_config
  await db
    .insert(companyAccountConfig)
    .values({ companyId, plantId: null, config })
    .onConflictDoUpdate({
      target: [companyAccountConfig.companyId, companyAccountConfig.plantId],
      set: { config, updatedAt: new Date() },
    });

  console.log(
    `  ✓ ${ACCOUNTS.length} accounts, ${Object.keys(config).length} posting categories configured`
  );
}

// ─── CLI runner (npx tsx packages/db/src/seeds/coa.ts <companyId> <userId>) ──

if (process.argv[2]) {
  const [,, companyId, userId] = process.argv;
  if (!companyId || !userId) {
    console.error('Usage: npx tsx packages/db/src/seeds/coa.ts <companyId> <userId>');
    process.exit(1);
  }
  seedCoaForCompany(companyId, userId)
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}
