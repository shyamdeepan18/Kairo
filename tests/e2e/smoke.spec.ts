import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage.js';
import { CompanySelectPage } from '../page-objects/CompanySelectPage.js';

test.describe('ERP Smoke Suite — Core Shell & Navigation', () => {
  test('User can log in, select company, and navigate across all modules without crash', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const companySelectPage = new CompanySelectPage(page);

    // 1. Visit Login
    await loginPage.goto();
    await expect(page).toHaveTitle(/ERP|Kairo/i);

    // 2. Perform Login
    await loginPage.login('shyam18@kairo.com', 'Shyam18');

    // 3. Select Company & Plant
    await companySelectPage.selectCompanyAndPlant('Company 1', 'Main Plant');

    // 4. Validate Dashboard Loaded
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator('h1, h2, h3').filter({ hasText: /Executive Business Command Center|Dashboard/i }).first()).toBeVisible({ timeout: 15000 });

    // 5. Navigate through Key Operational Routes and ensure no unhandled exceptions
    const routesToTest = [
      { path: '/settings/company', titleMatch: /Company|Settings/i },
      { path: '/settings/plants', titleMatch: /Plant|Warehouse/i },
      { path: '/settings/coa', titleMatch: /Chart of Accounts|Accounts/i },
      { path: '/masters/items', titleMatch: /Item/i },
      { path: '/masters/suppliers', titleMatch: /Supplier|Vendor/i },
      { path: '/masters/customers', titleMatch: /Customer/i },
      { path: '/purchase/orders', titleMatch: /Purchase Order|Orders/i },
      { path: '/purchase/grn', titleMatch: /Goods Receipt|GRN/i },
      { path: '/purchase/invoices', titleMatch: /Invoice|Bill/i },
      { path: '/sales/orders', titleMatch: /Sales Order/i },
      { path: '/sales/delivery', titleMatch: /Deliver/i },
      { path: '/sales/invoices', titleMatch: /Sales Invoice/i },
      { path: '/inventory/stock', titleMatch: /Stock Balance|Inventory/i },
      { path: '/inventory/ledger', titleMatch: /Stock Ledger/i },
      { path: '/manufacturing/orders', titleMatch: /Production|Manufacturing/i },
      { path: '/manufacturing/subcontracting', titleMatch: /Subcontracting|Job Work/i },
      { path: '/accounting/jv', titleMatch: /Journal|Voucher/i },
      { path: '/accounting/projects', titleMatch: /Project/i },
      { path: '/accounting/bank-reconciliation', titleMatch: /Bank Reconciliation/i },
      { path: '/reports/inventory', titleMatch: /Report|Stock/i },
      { path: '/reports/finance', titleMatch: /Report|Ledger/i },
    ];

    for (const r of routesToTest) {
      await page.goto(r.path);
      await page.waitForLoadState('domcontentloaded');
      // Assert page loaded without full error boundary crash
      await expect(page.locator('.ant-result-error, #error-boundary')).toHaveCount(0);
    }
  });

  test('Invalid credentials trigger appropriate validation alert', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginExpectFailure('invalid-user@test.com', 'WrongPassword123!');
    await loginPage.expectError('Invalid email or password');
  });
});
