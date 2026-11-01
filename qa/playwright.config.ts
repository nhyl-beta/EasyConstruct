import { defineConfig } from "@playwright/test";
import { guardOrExit } from "./src/guard.js";

// Safety first: refuse to load at all unless the QA environment is valid.
const cfg = guardOrExit();

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results/playwright-artifacts",
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["./src/reporter/csv-reporter.ts"]],
  use: {
    baseURL: cfg.baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.QA_CHROMIUM_PATH || undefined },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
