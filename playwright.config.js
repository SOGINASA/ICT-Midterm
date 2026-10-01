const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  outputDir: process.env.RUN_ACCOUNT_E2E === "1"
    ? "./artifacts/playwright-accounts"
    : "./artifacts/playwright",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1440, height: 1100 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { BROWSER: "none" },
    timeout: 120000,
  },
});
