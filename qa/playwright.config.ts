import { defineConfig } from "@playwright/test";
import { guardOrExit } from "./src/guard.js";

// Safety first: refuse to load at all unless the QA environment is valid.
const cfg = guardOrExit();

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results/playwright-artifacts",
  globalSetup: "./src/global-setup.ts",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["./src/reporter/csv-reporter.ts"]],
  expect: { timeout: 6_000 },
  use: {
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
    baseURL: cfg.baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.QA_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] },
  },
  projects: [
    { name: "api", testMatch: /api\/.*\.spec\.ts/ },
    { name: "lifecycle", testMatch: /lifecycle\/.*\.spec\.ts/, fullyParallel: false },
    { name: "lifecycle-ui", testMatch: /lifecycle-ui\/.*\.spec\.ts/, fullyParallel: false, timeout: 240_000, use: { browserName: "chromium", actionTimeout: 25_000, navigationTimeout: 40_000 } },
    { name: "crawl", testMatch: /crawl\/crawl\..*\.spec\.ts/, fullyParallel: false, use: { browserName: "chromium" } },
    { name: "smoke", testMatch: /smoke\/.*\.spec\.ts/, fullyParallel: true, use: { browserName: "chromium" } },
    { name: "write-probes", testMatch: /probes\/.*\.spec\.ts/, fullyParallel: false },
    { name: "functional", testMatch: /ui\/functional\..*\.spec\.ts/, fullyParallel: false, use: { browserName: "chromium" } },
    { name: "ui-access", testMatch: /ui\/access\..*\.spec\.ts/, fullyParallel: false, use: { browserName: "chromium" } },
  ],
});
