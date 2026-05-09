// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * Playwright E2E configuration for InfoBill React frontend.
 * Tests run against the dev server at http://localhost:3050.
 *
 * Run locally: npx playwright test
 * Run headed:  npx playwright test --headed
 * Show report: npx playwright show-report
 */
module.exports = defineConfig({
  // Directory where test files live
  testDir: "./tests/e2e",

  // Timeout per test (30s is plenty for local POS flows)
  timeout: 30_000,

  // Retry failed tests once on CI, never locally
  retries: process.env.CI ? 1 : 0,

  // Run tests in parallel on CI, sequentially locally
  workers: process.env.CI ? 2 : 1,

  // Always produce HTML report (opens automatically on failure locally)
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "on-failure" }],
    ["list"],
  ],

  use: {
    // Base URL — React dev server
    baseURL: "http://localhost:3050",

    // Capture screenshot on failure for debugging
    screenshot: "only-on-failure",

    // Capture video on first retry
    video: "on-first-retry",

    // Don't show browser head unless --headed flag is passed
    headless: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the React dev server automatically before tests
  webServer: {
    command: "npm start --prefix frontend",
    url: "http://localhost:3050",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 min to start the dev server
  },
});
