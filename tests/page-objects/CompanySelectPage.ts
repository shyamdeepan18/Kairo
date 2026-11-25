import { type Page, expect } from '@playwright/test';

export class CompanySelectPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async selectCompanyAndPlant(companyName = 'Company 1', plantName = 'Main Plant') {
    // Check if on select-company page
    if (this.page.url().includes('/select-company')) {
      const companyCard = this.page.locator('.ant-card').filter({ hasText: companyName }).first();
      await companyCard.waitFor({ state: 'visible', timeout: 10000 });
      await companyCard.click();

      // If plant selection step appears
      try {
        const plantCard = this.page.locator('.ant-card').filter({ hasText: plantName }).first();
        if (await plantCard.isVisible({ timeout: 2000 })) {
          await plantCard.click();
        }
      } catch {
        // Single plant auto-advances
      }

      await this.page.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 15000 });
    }
  }
}

