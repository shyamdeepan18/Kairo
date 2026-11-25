import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E & Integration Testing Configuration for Kairo ERP
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false, // Invariant preservation: run sequential suites to preserve inventory & GL state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker avoids database record collisions during transactional tests
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/qa/reports/test-results.json' }],
    ['html', { outputFolder: 'docs/qa/reports/playwright-html', open: 'never' }],
  ],
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});

