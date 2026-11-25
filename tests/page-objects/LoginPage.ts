import { type Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async fillAndSubmit(email = 'shyam18@kairo.com', password = 'Shyam18') {
    const emailInput = this.page.locator('input#email, input[placeholder*="you@company.com"]').first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill(email);

    const passwordInput = this.page.locator('input#password, input[placeholder*="••••••••"]').first();
    await passwordInput.fill(password);

    await this.page.click('button[type="submit"]');
  }

  async login(email = 'shyam18@kairo.com', password = 'Shyam18') {
    await this.fillAndSubmit(email, password);
    // Wait for redirection out of /login
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  }

  async loginExpectFailure(email = 'invalid@kairo.com', password = 'wrongpassword') {
    await this.fillAndSubmit(email, password);
    const alert = this.page.locator('.ant-alert-error');
    await alert.waitFor({ state: 'visible', timeout: 10000 });
  }

  async expectError(messageSubstr: string) {
    const alert = this.page.locator('.ant-alert-error');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(messageSubstr);
  }
}
