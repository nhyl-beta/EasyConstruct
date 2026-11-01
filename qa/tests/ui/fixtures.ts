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

/** Expands every collapsed group, then lists the sidebar links. */
export async function sidebarItems(page: Page): Promise<SidebarItem[]> {
  const nav = page.locator("aside, [data-sidebar='sidebar'], nav").first();
  await nav.waitFor({ state: "visible", timeout: 15_000 });
  for (let i = 0; i < 4; i++) {
    const closed = nav.locator("[aria-expanded='false']");
    const n = await closed.count();
    if (!n) break;
    for (let k = 0; k < n; k++) await closed.nth(k).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  return nav.locator("a").evaluateAll((as) => as.map((a) => ({ text: (a.textContent ?? "").replace(/\s+/g, " ").trim(), href: a.getAttribute("href") ?? "" })).filter((x) => x.text));
}

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const findItem = (items: SidebarItem[], labels: string[]) => items.find((i) => labels.some((l) => norm(i.text) === norm(l)));

export const DENIED_TEXT = /access denied|page not found|don't have permission|not authorized|restricted/i;

/** The app keeps a live notification stream open, so "networkidle" never fires. Wait for load, then a short settle. */
export async function settle(page: Page) {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForTimeout(700);
}
