// Shared UI helpers: safety net, sidebar discovery, health collection.
import { test as base, expect, type Page } from "@playwright/test";
import { assertQaEnvironment } from "../../src/guard.js";

export interface Health { consoleErrors: string[]; failedRequests: string[] }

export const test = base.extend<{ health: Health }>({
  health: async ({ page, context }, use) => {
    const cfg = assertQaEnvironment();
    const web = new URL(cfg.baseUrl).origin;
    const api = new URL(cfg.apiUrl).origin;
    const h: Health = { consoleErrors: [], failedRequests: [] };
    // Safety net: only the QA web app and QA API may be reached. A relative /api call on the web origin means the
    // web app was NOT started with VITE_API_URL pointing at the QA API (its proxy targets port 8000), so block it.
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
      if (u.origin === web && u.pathname.startsWith("/api/")) { h.failedRequests.push(`BLOCKED ${u.pathname}: web app is not pointed at the QA API`); return route.abort(); }
      if (u.origin === web || u.origin === api) return route.continue();
      if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.abort(); // cosmetic, never needed
      h.failedRequests.push(`BLOCKED external ${u.origin}`);
      return route.abort();
    });
    page.on("console", (m) => { if (m.type() === "error") h.consoleErrors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => h.consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => {
      const s = r.status();
      if (s >= 400 && r.url().startsWith(api)) h.failedRequests.push(`${s} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    await use(h);
  },
});
export { expect };

export interface SidebarItem { text: string; href: string }

const SIDEBAR = "[data-slot='sidebar']";

/** Expands every collapsed group, then lists the page buttons (groups themselves are not pages). The sidebar uses
 *  buttons, not links, and appends a count badge to some labels ("Approvals1"), which is stripped. */
export async function sidebarItems(page: Page): Promise<SidebarItem[]> {
  const sb = page.locator(SIDEBAR);
  await sb.first().waitFor({ state: "attached", timeout: 15_000 });
  await page.locator(`${SIDEBAR} [data-sidebar='menu-button']`).first().waitFor({ state: "visible", timeout: 15_000 });
  for (let i = 0; i < 4; i++) {
    const closed = sb.locator("[data-sidebar='menu-button'][aria-expanded='false']");
    const n = await closed.count();
    if (!n) break;
    for (let k = 0; k < n; k++) await closed.nth(0).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  return sb.locator("[data-sidebar='menu-button']:not([aria-expanded]), [data-sidebar='menu-sub-button']").evaluateAll((els) =>
    els.map((e) => ({ text: (e.textContent ?? "").replace(/\s+/g, " ").trim().replace(/\s*\d+$/, ""), href: "" })).filter((x) => x.text));
}

export const sidebarButton = (page: Page, label: string) =>
  page.locator(`${SIDEBAR} [data-sidebar='menu-button']:not([aria-expanded]), ${SIDEBAR} [data-sidebar='menu-sub-button']`)
    .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\d*\\s*$`) }).first();

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const findItem = (items: SidebarItem[], labels: string[]) => items.find((i) => labels.some((l) => norm(i.text) === norm(l)));

export const DENIED_TEXT = /access denied|page not found|don't have permission|not authorized|restricted/i;

/** The app keeps a live notification stream open, so "networkidle" never fires. Wait for load, then a short settle. */
export async function settle(page: Page) {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(700);
}

import type { BrowserContext } from "@playwright/test";
export interface RolePage { page: Page; context: BrowserContext; health: Health; items: SidebarItem[] | null }

/** One browser context + page per role, reused by every check of that role (much faster than a page per test). */
export async function openRolePage(browser: import("@playwright/test").Browser, statePathFile: string): Promise<RolePage> {
  const cfg = assertQaEnvironment();
  const web = new URL(cfg.baseUrl).origin;
  const api = new URL(cfg.apiUrl).origin;
  const context = await browser.newContext({ storageState: statePathFile, baseURL: cfg.baseUrl });
  const page = await context.newPage();
  const health: Health = { consoleErrors: [], failedRequests: [] };
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === "data:" || u.protocol === "blob:") return route.continue();
    if (u.origin === web && u.pathname.startsWith("/api/")) { health.failedRequests.push(`BLOCKED ${u.pathname}: web app is not pointed at the QA API`); return route.abort(); }
    if (u.origin === web || u.origin === api) return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return route.abort();
    health.failedRequests.push(`BLOCKED external ${u.origin}`);
    return route.abort();
  });
  page.on("console", (m) => { if (m.type() === "error") health.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => health.consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(api)) health.failedRequests.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return { page, context, health, items: null };
}

/** Opens a page through the sidebar like a person would; throws a readable message if it cannot be reached. */
export async function openViaSidebar(rp: RolePage, labels: string[]) {
  const { page } = rp;
  if (!rp.items || !(await page.locator("[data-slot='sidebar'] [data-sidebar='menu-button']").first().isVisible().catch(() => false))) {
    await page.goto("/dashboard");
    await settle(page);
    if (page.url().includes("/login")) throw new Error("session was not accepted by the web app (redirected to login)");
    rp.items = await sidebarItems(page);
  }
  const item = findItem(rp.items, labels);
  if (!item) throw new Error(`sidebar item '${labels.join("' / '")}' not found (sidebar has: ${rp.items.map((i) => i.text).join(", ")})`);
  rp.health.consoleErrors.length = 0;
  await sidebarButton(page, item.text).click();
  await settle(page);
  const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
  if (DENIED_TEXT.test(body)) throw new Error("page shows an access-denied / not-found screen");
  return item;
}
