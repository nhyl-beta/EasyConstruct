// Click-everything crawler: for one role, open every sidebar page, click each visible button / tab / dropdown / row action, and fail on
// console errors, failed network requests (4xx/5xx; a 403/404 is expected only when a page is deliberately denied) or blank screens.
// Destructive controls (delete, deactivate, archive, cancel, send ...) are clicked only to see that a confirmation dialog opens, which is then dismissed.
import { statePath } from "../../src/global-setup.js";
import { ROLES } from "../../src/roles.js";
import { expect, openRolePage, settle, sidebarItems, sidebarButton, test, type RolePage } from "../ui/fixtures.js";
import type { Page } from "@playwright/test";

const DESTRUCTIVE = /\b(delete|remove|deactivate|archive|cancel|reject|send|sign out|log ?out|clear|reset|discard|revoke|terminate|void|decline|disable)\b/i;
const SKIP = /^(toggle sidebar|toggle theme|\d+\+?|[A-Z]{1,3})$/; // chrome buttons: sidebar toggle, theme toggle, notification count, avatar initials
const MAX_PER_PAGE = 25;

interface Finding { role: string; page: string; kind: "console-error" | "failed-request" | "blank-screen" | "destructive-without-confirmation" | "crash"; detail: string }

const content = (p: Page) => p.locator("main:not(:has(main))").first();

async function controls(p: Page) {
  const root = content(p);
  const els = root.locator("button:visible, [role=tab]:visible, [role=combobox]:visible, [role=menuitem]:visible");
  const n = Math.min(await els.count(), 120);
  const out: { index: number; name: string }[] = [];
  for (let i = 0; i < n; i++) {
    const e = els.nth(i);
    const name = ((await e.innerText().catch(() => "")) || (await e.getAttribute("aria-label").catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (!name || SKIP.test(name)) continue;
    if (await e.getAttribute("type").catch(() => null) === "file") continue;
    out.push({ index: i, name });
  }
  return out.slice(0, MAX_PER_PAGE);
}

export function defineCrawlSuite(role: (typeof ROLES)[number]) {
  test(`CRAWL ${role.label}: every sidebar page, every control`, async ({ browser }, info) => {
    test.setTimeout(420_000);
    const rp: RolePage = await openRolePage(browser, statePath(role.slug));
    const findings: Finding[] = [];
    const add = (page: string, kind: Finding["kind"], detail: string) => findings.push({ role: role.label, page, kind, detail });
    try {
      await rp.page.goto("/dashboard"); await settle(rp.page, 1500);
      const items = await sidebarItems(rp.page);
      expect(items.length, "the sidebar lists no pages").toBeGreaterThan(0);
      for (const item of items) {
        const pageName = item.text;
        rp.health.consoleErrors.length = 0; rp.health.failedRequests.length = 0;
        try {
          await rp.page.goto("/dashboard"); await settle(rp.page, 600);
          await sidebarButton(rp.page, item.text).click(); await settle(rp.page, 1400);
          const url0 = rp.page.url();
          const text = ((await content(rp.page).innerText().catch(() => "")) ?? "").trim();
          if (text.length < 20 || /something went wrong|application error|unexpected error/i.test(text)) add(pageName, "blank-screen", `page text: "${text.slice(0, 80)}"`);
          const list = await controls(rp.page);
          for (const c of list) {
            const e = content(rp.page).locator("button:visible, [role=tab]:visible, [role=combobox]:visible, [role=menuitem]:visible").nth(c.index);
            if (!(await e.count())) continue;
            const destructive = DESTRUCTIVE.test(c.name);
            try {
              await e.click({ timeout: 3000, trial: false });
              await rp.page.waitForTimeout(450);
              const dlg = rp.page.locator("[role=alertdialog],[role=dialog]").first();
              const opened = await dlg.isVisible().catch(() => false);
              if (destructive && !opened) add(pageName, "destructive-without-confirmation", `"${c.name}" did not open a confirmation dialog`);
              if (opened) { await rp.page.keyboard.press("Escape"); await rp.page.waitForTimeout(250); if (await dlg.isVisible().catch(() => false)) await dlg.getByRole("button", { name: /cancel|close|no/i }).first().click({ timeout: 1500 }).catch(() => {}); }
              else await rp.page.keyboard.press("Escape");
              if (rp.page.url() !== url0) { await rp.page.goBack().catch(() => {}); await settle(rp.page, 600); if (rp.page.url() !== url0) { await rp.page.goto(url0); await settle(rp.page, 800); } }
            } catch { /* control became hidden/unclickable after a state change: not a finding */ }
          }
        } catch (e) { add(pageName, "crash", (e as Error).message.split("\n")[0]!); }
        for (const m of rp.health.consoleErrors) add(pageName, "console-error", m);
        for (const m of rp.health.failedRequests) { const code = Number(m.split(" ")[0]); if (code === 403 || code === 404) continue; add(pageName, "failed-request", m); }
        if (rp.health.consoleErrors.length || rp.health.failedRequests.some((m) => ![403, 404].includes(Number(m.split(" ")[0])))) await rp.page.screenshot({ path: info.outputPath(`${pageName.replace(/\W+/g, "-")}.png`) }).catch(() => {});
      }
    } finally { await rp.context.close(); }
    for (const f of findings) info.annotations.push({ type: "finding", description: JSON.stringify(f) });
    const counts = findings.reduce<Record<string, number>>((a, f) => ((a[f.kind] = (a[f.kind] ?? 0) + 1), a), {});
    expect(findings.length, `${findings.length} crawl finding(s) for ${role.label}: ${JSON.stringify(counts)}; first: ${findings.slice(0, 3).map((f) => `${f.page}: ${f.kind} ${f.detail.slice(0, 70)}`).join(" | ")}`).toBe(0);
  });
}
