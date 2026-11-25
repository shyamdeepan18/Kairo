import { test, expect } from '@playwright/test';
import { ErpApiClient } from '../../helpers/api-client.js';
import { DbValidator } from '../../helpers/db-validator.js';
import { TestDataFactory } from '../../helpers/test-data-factory.js';

test.describe('Accounting, General Ledger & Project Accounting (GAP 8)', () => {
  let api: ErpApiClient;
  let dbValidator: DbValidator;
  let factory: TestDataFactory;
  const testId = `ACC-${Date.now().toString().slice(-6)}`;

  test.beforeAll(async () => {
    api = new ErpApiClient();
    await api.login('shyam18@kairo.com', 'Shyam18');
    dbValidator = new DbValidator();
    factory = new TestDataFactory(api);
  });

  test.afterAll(async () => {
    await dbValidator.close();
  });

  test('Balanced Journal Voucher (JV) Creation & Double-Entry Integrity', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch available accounts from Chart of Accounts
    const coaRes = await api.get<{ accounts?: any[]; data?: any[] }>(`/settings/coa`);
    const accounts = coaRes.accounts || coaRes.data || coaRes;
    expect(accounts.length).toBeGreaterThan(1);

    const debitAcc = accounts[0];
    const creditAcc = accounts[1];
    expect(debitAcc.id).toBeDefined();
    expect(creditAcc.id).toBeDefined();

    // 2. Post a Balanced Manual Journal Voucher
    const transferAmountPaise = 75000; // 750 INR
    const jvRes = await api.post('/accounting/jv', {
      postingDate: today,
      narration: `${testId} Inter-account settlement`,
      lines: [
        {
          accountId: debitAcc.id,
          debitAmountPaise: transferAmountPaise,
          creditAmountPaise: 0,
          narration: 'Line 1 Debit',
        },
        {
          accountId: creditAcc.id,
          debitAmountPaise: 0,
          creditAmountPaise: transferAmountPaise,
          narration: 'Line 2 Credit',
        },
      ],
    });

    const jvId = jvRes.id || jvRes.journalEntryId || jvRes.data?.id;
    expect(jvId).toBeDefined();

    // 3. Database Invariant Assertion: Verify Double-Entry Balance in Postgres
    const entries = await dbValidator.verifyJournalForDocument(jvId);
    expect(entries.length).toBe(1);
    expect(Number(entries[0].total_debit)).toBe(transferAmountPaise);
    expect(Number(entries[0].total_credit)).toBe(transferAmountPaise);
  });

  test('Negative Validation: Unbalanced Journal Voucher is Rejected', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    const coaRes = await api.get<{ accounts?: any[]; data?: any[] }>(`/settings/coa`);
    const accounts = coaRes.accounts || coaRes.data || coaRes;
    const debitAcc = accounts[0];
    const creditAcc = accounts[1];

    // Attempt to post unbalanced voucher (Debit: 500 INR, Credit: 400 INR)
    try {
      await api.post('/accounting/jv', {
        postingDate: today,
        narration: `${testId} Unbalanced test`,
        lines: [
          {
            accountId: debitAcc.id,
            debitAmountPaise: 50000,
            creditAmountPaise: 0,
          },
          {
            accountId: creditAcc.id,
            debitAmountPaise: 0,
            creditAmountPaise: 40000, // Imbalance: 100 INR
          },
        ],
      });
      expect(true).toBe(false); // Should have thrown
    } catch (err: any) {
      expect(err.message).toContain('400');
    }
  });

  test('Project Accounting (GAP 8): Project Lifecycle & Budget vs Actual Telemetry', async () => {
    const ctx = await factory.getContext();
    const today = new Date().toISOString().slice(0, 10);

    // 1. Create a Project
    const projectCode = `PRJ-${testId.slice(-4)}`;
    const contractAmountPaise = 50000000; // 500,000 INR
    const projRes = await api.post('/accounting/projects', {
      code: projectCode,
      name: `${testId} Infrastructure Substation`,
      description: 'Turnkey high-voltage substation installation',
      status: 'active',
      contractAmountPaise,
      startDate: today,
    });

    const proj = projRes.data || projRes.project || projRes;
    expect(proj.id).toBeDefined();

    // 2. Fetch Project Summary & Profitability Telemetry
    const summaryRes = await api.get(`/accounting/projects/${proj.id}/summary`);
    expect(summaryRes).toBeDefined();
    expect(summaryRes.project).toBeDefined();
    expect(summaryRes.project.code).toBe(projectCode);
    expect(summaryRes.totals).toBeDefined();
    expect(summaryRes.breakdown).toBeDefined();
    expect(Array.isArray(summaryRes.breakdown)).toBe(true);
  });
});
