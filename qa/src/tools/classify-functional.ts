// Classifies each failed functional check (file 03: SEARCH / FILTER, PAGINATION, FORM VALIDATION) by looking at the real page:
//   control missing in app | role not given the page | selector gap in the test | matrix wrong (check does not fit the page type)
// Read-only against the app: it opens pages through the sidebar and inspects the DOM; it clicks "create" only to read the form.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { statePath } from "../global-setup.js";
import { PAGE_UI } from "../page-map.js";
import { ROLES } from "../roles.js";
import { parseCsv } from "../spec.js";

const root = join(import.meta.dirname, "..", "..", "..");
const dir = process.argv[2]!;
const rows = parseCsv(readFileSync(join(dir, "03_role_page_checks.csv"), "utf8"));
const H = rows[0]!; const col = (n: string) => H.indexOf(n);
const failed = rows.slice(1).filter((r) => r[col("Status")] === "Failed" && ["SEARCH / FILTER", "PAGINATION", "FORM VALIDATION"].includes(r[col("Objective")]!.split(" — ").pop()!));

// ── what the app's own config gives each role ──
const roleRes = readFileSync(join(root, "apps/web/src/config/role-resources.ts"), "utf8");
const resByRole: Record<string, string[]> = {};
for (const m of roleRes.matchAll(/^\s{2}(\w+): \[([^\]]*)\]/gms)) resByRole[m[1]!] = [...m[2]!.matchAll(/"([\w-]+)"/g)].map((x) => x[1]!);
const resSrc = readFileSync(join(root, "apps/web/src/providers/resources.ts"), "utf8");
const labelOf: Record<string, string> = {};
for (const m of resSrc.matchAll(/name: "([\w-]+)",[\s\S]*?label: "([^"]+)"/g)) labelOf[m[1]!] = m[2]!;
const KEY: Record<string, string> = { Owner: "owner", Admin: "admin", "IT Designer": "it_designer", "Project Manager": "project_manager", "Human Resources": "human_resources", "Finance Manager": "finance_manager", Architect: "architect", Engineer: "engineer", "Site Personnel": "site_personnel", Consultant: "consultant" };
const roleHasPage = (role: string, page: string) => {
  const labels = (PAGE_UI[page]?.labels ?? []).map((l) => l.toLowerCase());
  return (resByRole[KEY[role]!] ?? []).some((res) => labels.includes((labelOf[res] ?? "").toLowerCase()));
};

const PROBE = `(() => {
  var vis = function (e) { return !!(e.offsetParent || e.getClientRects().length); };
  var inSide = function (e) { return !!e.closest("[data-slot='sidebar']"); };
  var inputs = [].slice.call(document.querySelectorAll("input,textarea,[role=searchbox],[role=combobox]")).filter(function (e) { return vis(e) && !inSide(e); })
    .map(function (e) { return ((e.getAttribute("placeholder") || "") + "|" + (e.getAttribute("aria-label") || "") + "|" + (e.getAttribute("type") || "")); });
  var buttons = [].slice.call(document.querySelectorAll("button,a[role=button],a")).filter(function (e) { return vis(e) && !inSide(e); })
    .map(function (e) { return (e.textContent || e.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " ").slice(0, 30); }).filter(Boolean);
  var text = document.body.innerText;
  return { tables: document.querySelectorAll("table").length, rows: document.querySelectorAll("table tbody tr").length, cards: document.querySelectorAll("[data-slot='card']").length,
    inputs: inputs.slice(0, 20), buttons: buttons.slice(0, 40), pagText: /rows per page|page \\d+ of \\d+|next page|previous page|load more|show more|go to next/i.test(text), forms: document.querySelectorAll("form").length };
})()`;

type Cls = "control missing in app" | "role not given the page" | "selector gap in the test" | "matrix wrong";
const out: string[][] = [["Check ID", "Role", "Page", "Check type", "Observed failure", "Classification", "Evidence"]];
const tally: Record<string, number> = {};
const emit = (r: string[], cls: Cls, ev: string) => {
  const id = r[col("Test Case ID")]!, role = r[col("Role")]!, type = r[col("Objective")]!.split(" — ").pop()!, page = r[col("Objective")]!.split(" — ")[0]!;
  out.push([id, role, page, type, r[col("Actual Results")]!.replace(/\s+/g, " ").slice(0, 110), cls, ev]); tally[cls] = (tally[cls] ?? 0) + 1;
};

const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctxs: Record<string, Awaited<ReturnType<typeof browser.newContext>>> = {};
const pageFor = async (role: string) => { const slug = ROLES.find((x) => x.label === role)!.slug; ctxs[slug] ??= await browser.newContext({ storageState: statePath(slug), baseURL: "http://localhost:5173" }); return ctxs[slug]!.newPage(); };

for (const r of failed) {
  const role = r[col("Role")]!, page_ = r[col("Objective")]!.split(" — ")[0]!, type = r[col("Objective")]!.split(" — ").pop()!;
  const actual = r[col("Actual Results")]!.replace(/\s+/g, " ");
  if (/sidebar item/.test(actual)) {
    if (!roleHasPage(role, page_)) emit(r, "role not given the page", `no resource labelled ${JSON.stringify(PAGE_UI[page_]?.labels)} in ${KEY[role]} (apps/web/src/config/role-resources.ts)`);
    else emit(r, "selector gap in the test", "role config includes the page but the sidebar label was not matched");
    continue;
  }
  const ui = PAGE_UI[page_]; if (!ui) { emit(r, "selector gap in the test", "no UI mapping"); continue; }
  const p = await pageFor(role);
  try {
    await p.goto("/dashboard"); await p.waitForTimeout(1500);
    const item = p.locator("[data-slot='sidebar'] [data-sidebar='menu-button'], [data-slot='sidebar'] [data-sidebar='menu-sub-button']");
    for (let i = 0; i < 3; i++) { const c = p.locator("[data-slot='sidebar'] [data-sidebar='menu-button'][aria-expanded='false']"); const n = await c.count(); if (!n) break; for (let k = 0; k < n; k++) await c.nth(0).click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(150); }
    let clicked = false;
    for (const label of ui.labels) { const b = item.filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\d*\\s*$`) }).first(); if (await b.count()) { await b.click(); clicked = true; break; } }
    if (!clicked) { emit(r, "role not given the page", "sidebar item absent on re-check"); continue; }
    await p.waitForTimeout(2000);
    let info: any = await p.evaluate(PROBE);
    const listy = info.tables > 0 || info.rows > 0;
    const own = info.inputs.filter((i: string) => !/jump/i.test(i));
    const searchy = own.some((i: string) => /search|filter|find/i.test(i));
    const createBtn = info.buttons.find((b: string) => /^(new|add|create|upload|start|raise|request|submit|send|invite|generate|log|report|file|post|\+)/i.test(b));
    if (/search control/.test(actual)) {
      if (searchy) emit(r, "selector gap in the test", `search-like input present: ${own.filter((i: string) => /search|filter|find/i.test(i)).join(" ; ")}`);
      else if (!listy) emit(r, "matrix wrong", `page has no table or list (tables ${info.tables}, cards ${info.cards}): search does not fit this page type`);
      else emit(r, "control missing in app", `table with ${info.rows} rows and no search input (page-own inputs: ${own.join(" ; ") || "none"})`);
    } else if (/pagination control/.test(actual)) {
      if (info.pagText) emit(r, "selector gap in the test", "pagination-like text present on the page");
      else if (!listy) emit(r, "matrix wrong", "page has no table or list: pagination does not fit this page type");
      else emit(r, "control missing in app", `table with ${info.rows} rows and no pagination text`);
    } else if (/create control/.test(actual)) {
      if (createBtn) emit(r, "selector gap in the test", `action button present: "${createBtn}"`);
      else if (!listy && info.forms === 0) emit(r, "matrix wrong", "page has no list and no form: create does not fit this page type");
      else emit(r, "control missing in app", `no create-like button (buttons: ${info.buttons.slice(0, 8).join(" | ")})`);
    } else if (/submit control|blank submit/.test(actual)) {
      const c = createBtn ? p.locator("main button, main a").filter({ hasText: createBtn }).first() : null;
      if (!c || !(await c.count())) { emit(r, "selector gap in the test", "create button not re-found"); continue; }
      await c.click(); await p.waitForTimeout(1000);
      const dlg = p.getByRole("dialog");
      const scopeBtns = (await dlg.count()) ? await dlg.last().getByRole("button").allInnerTexts() : (await p.evaluate(PROBE) as any).buttons;
      const submit = scopeBtns.find((b: string) => /^(create|save|submit|add|upload|send|post|confirm|register|issue|generate|continue|next|finish)/i.test(b.trim()));
      if (/submit control/.test(actual)) emit(r, submit ? "selector gap in the test" : "control missing in app", `form buttons: ${scopeBtns.map((b: string) => b.trim()).filter(Boolean).slice(0, 8).join(" | ") || "none"}`);
      else {
        const sub = (await dlg.count() ? dlg.last() : p.locator("body")).getByRole("button", { name: /^(create|save|submit|add|upload|send|post)/i }).last();
        if (await sub.count() && await sub.isEnabled()) await sub.click().catch(() => {});
        await p.waitForTimeout(800);
        const cue = await p.evaluate(`(() => [].slice.call(document.querySelectorAll("main [role=alert],main [aria-invalid=true],main p[class*=destructive],main [data-slot=form-message]")).filter(function(e){return e.offsetParent && !e.closest("[data-slot='sidebar']");}).map(function(e){return (e.textContent||"").trim().slice(0,60);}).filter(Boolean))()`) as string[];
        if (cue.length) emit(r, "selector gap in the test", `validation cue present: ${cue.slice(0, 2).join(" | ")}`);
        else emit(r, "control missing in app", "blank form submitted with no validation message or disabled submit");
      }
    } else if (/Timeout/.test(actual)) {
      emit(r, "selector gap in the test", `${info.tables ? "table present" : "no <table>"}: the check assumed table rows (${info.cards} cards on the page)`);
    } else if (/rows per page/.test(actual)) {
      emit(r, "control missing in app", "rows-per-page selector present but the page ignores the chosen size");
    } else emit(r, "selector gap in the test", actual.slice(0, 80));
  } catch (e) { emit(r, "selector gap in the test", `probe error: ${(e as Error).message.split("\n")[0]}`); }
  finally { await p.close(); }
}
await browser.close();
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
writeFileSync(join(import.meta.dirname, "..", "..", "results", "functional-failure-classification.csv"), out.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n");
console.log(failed.length, "failures classified:", JSON.stringify(tally));
