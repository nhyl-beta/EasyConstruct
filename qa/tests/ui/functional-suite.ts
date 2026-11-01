// Functional checks from qa/spec/03_role_page_checks.csv: SEARCH / FILTER, PAGINATION, FORM VALIDATION.
// One parameterised template per check type; selectors are role/placeholder/text based (no data-testid).
// A page that lacks the control fails with "control not found", which is the correct result.
import { statePath } from "../../src/global-setup.js";
import { PAGE_UI } from "../../src/page-map.js";
import { ROLES } from "../../src/roles.js";
import { loadChecks } from "../../src/spec.js";
import { expect, openRolePage, openViaSidebar, test, type RolePage } from "./fixtures.js";

const TYPES = ["SEARCH / FILTER", "PAGINATION", "FORM VALIDATION"];
/** Defects the team already knows about (kept Failed in the CSV, listed under "known"). */
const KNOWN: Record<string, string> = {
  "Projects|PAGINATION": "@known:Projects-pagination",
  "User Accounts|SEARCH / FILTER": "@known:UserAccounts-RoleStatus-filter",
};
const SPECIAL = ["'", "%", "<script>alert(1)</script>", "😀"];
const NO_MATCH = "zzz-no-such-value-QA9f3";

const content = (rp: RolePage) => rp.page.locator("main:not(:has(main))").first();
const rowsOf = (rp: RolePage) => content(rp).locator("table tbody tr");
/** What the page currently shows, for comparing before/after Next (works for tables and card lists alike). */
const signature = async (rp: RolePage) => ((await content(rp).innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
const searchBox = (rp: RolePage) => content(rp).getByPlaceholder(/^(?!.*jump)(?=.*(search|filter))/i).first();

async function firstCellText(rp: RolePage): Promise<string> {
  const cells = await rowsOf(rp).first().locator("td").allInnerTexts();
  // First line of the first cell that has real text (a cell may stack a name over a code).
  const lines = cells.flatMap((c) => c.split("\n").map((l) => l.replace(/\s+/g, " ").trim()));
  const pick = lines.find((l) => l.length >= 3 && !/^\d+([.,]\d+)?%?$/.test(l));
  return (pick ?? "").slice(0, 25);
}

async function searchCheck(rp: RolePage) {
  const box = searchBox(rp);
  if (!(await box.count())) throw new Error("search control not found");
  await box.waitFor({ state: "visible", timeout: 5000 });
  const initial = await rowsOf(rp).count();
  if (initial === 0) { test.skip(true, "no rows on the page to take a known value from"); return; }
  const known = await firstCellText(rp);
  expect(known, "no searchable text in the first row").not.toBe("");
  await box.fill(known); await rp.page.waitForTimeout(700);
  const hit = rowsOf(rp);
  expect(await hit.count(), `known value '${known}' returned no rows`).toBeGreaterThan(0);
  expect((await hit.first().innerText()).toLowerCase(), "first result does not contain the searched value").toContain(known.toLowerCase());
  await box.fill(NO_MATCH); await rp.page.waitForTimeout(700);
  const n = await rowsOf(rp).count();
  const body = (await rp.page.locator("body").innerText()).toLowerCase();
  expect(n === 0 || (n === 1 && /no .*(found|result|match|data)|nothing|empty/.test(body)), `non-existent value still shows ${n} row(s) and no empty state`).toBe(true);
  const before = rp.health.failedRequests.length; rp.health.consoleErrors.length = 0;
  for (const s of SPECIAL) {
    await box.fill(s); await rp.page.waitForTimeout(500);
    await expect(rp.page.getByRole("heading").first(), `page broke on '${s}'`).toBeVisible();
  }
  await box.fill("");
  expect(rp.health.consoleErrors, "console errors after special characters").toEqual([]);
  expect(rp.health.failedRequests.slice(before), "failed requests after special characters").toEqual([]);
}

async function paginationCheck(rp: RolePage) {
  const rpp = rp.page.getByRole("combobox", { name: /rows per page/i });
  const next = rp.page.getByRole("button", { name: /go to next page/i });
  if (!(await rpp.count()) && !(await next.count())) throw new Error("pagination control not found (no rows-per-page selector, no next-page button)");
  const rows = rowsOf(rp);
  if (await rpp.count()) {
    await rpp.first().click();
    const opts = await rp.page.getByRole("option").allInnerTexts();
    const sizes = opts.map((o) => parseInt(o, 10)).filter((n) => n > 0).sort((a, b) => a - b);
    expect(sizes.length, "rows-per-page selector has no numeric options").toBeGreaterThan(0);
    await rp.page.getByRole("option", { name: String(sizes[0]), exact: true }).click();
    await rp.page.waitForTimeout(600);
    if (await rows.count()) expect(await rows.count(), `rows per page set to ${sizes[0]} but more rows are shown`).toBeLessThanOrEqual(sizes[0]!);
  } else test.info().annotations.push({ type: "remark", description: "no rows-per-page selector; only Next/Previous checked" });
  if (await next.count() && (await next.first().isEnabled())) {
    const first = await signature(rp);
    await next.first().click(); await rp.page.waitForTimeout(700);
    expect(await signature(rp), "Next did not load a different batch").not.toBe(first);
    await rp.page.getByRole("button", { name: /go to previous page/i }).first().click(); await rp.page.waitForTimeout(700);
    expect(await signature(rp), "Previous did not return to the first batch").toBe(first);
  } else test.info().annotations.push({ type: "remark", description: "Next is disabled (single page of data), so Next/Previous were not exercised" });
}

async function formCheck(rp: RolePage) {
  const { page } = rp;
  const CREATE = /^(new|add|create|upload|start|raise|draft|report|file|submit|send|generate|invite|request)\b/i;
  const create = content(rp).getByRole("button", { name: CREATE }).first();
  const createLink = content(rp).getByRole("link", { name: /^(new|add|create)\b/i }).first();
  if (!(await create.count()) && !(await createLink.count())) throw new Error("create control not found (no New / Add / Create / Raise / Start button on the page)");
  await ((await create.count()) ? create : createLink).click();
  await page.waitForTimeout(1000);
  const dialog = page.getByRole("dialog");
  const scope = (await dialog.count()) ? dialog.last() : content(rp);
  // A wizard's submit control is its "Next" button; a dialog's is Create / Save / Submit ...
  const submit = scope.getByRole("button", { name: /^(create|save|submit|add|upload|send|post|next|start|confirm|generate|raise)/i }).last();
  if (!(await submit.count())) throw new Error(`submit control not found in the form (buttons: ${(await scope.getByRole("button").allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 8).join(" | ")})`);
  const invalidSignals = async () => (await scope.locator("[aria-invalid='true'], [role=alert]").count()) + (await scope.getByText(/required|invalid|must|please|cannot be empty|at least|enter a/i).count());
  const stillOnForm = async () => (await scope.getByRole("button", { name: /^(cancel|back)/i }).count()) > 0 || (await scope.locator("input,textarea").count()) > 0;
  // A submit that stays disabled until the form is valid is itself a block on blank input.
  const blocked = async () => (await submit.isDisabled().catch(() => false)) || (await invalidSignals()) > 0;
  if (!(await submit.isDisabled().catch(() => false))) { await submit.click(); await page.waitForTimeout(800); }
  expect(await blocked(), "blank submit is neither blocked (disabled button) nor flagged with a validation message").toBe(true);
  expect(await stillOnForm(), "blank submit closed or left the form").toBe(true);
  const email = scope.locator("input[type=email]").first();
  const text = scope.locator("input[type=text], input:not([type]), textarea").first();
  if (await email.count()) await email.fill("not-an-email"); else if (await text.count()) await text.fill("   ");
  if (!(await submit.isDisabled().catch(() => false))) { await submit.click(); await page.waitForTimeout(800); }
  expect(await blocked(), "invalid values are neither blocked nor flagged").toBe(true);
  await page.keyboard.press("Escape");
  test.info().annotations.push({ type: "remark", description: "blank and invalid values were blocked; the valid-save step needs page-specific data and is not automated" });
  test.skip(true, "blank and invalid blocked; valid-save step is not automated for this form");
}

export function defineFunctionalSuite(role: (typeof ROLES)[number]) {
  const mine = loadChecks().filter((c) => c.role === role.label && TYPES.includes(c.type));
  test.describe(`${role.label} functional`, () => {
    let rp: RolePage;
    test.beforeAll(async ({ browser }) => { rp = await openRolePage(browser, statePath(role.slug)); });
    test.afterAll(async () => { await rp?.context.close(); });
    test.afterEach(async ({}, info) => {
      if (info.status !== info.expectedStatus && rp) {
        const path = info.outputPath("failure.png");
        await rp.page.screenshot({ path }).catch(() => {});
        await info.attach("screenshot", { path, contentType: "image/png" }).catch(() => {});
      }
    });
    for (const c of mine) {
      const tag = KNOWN[`${c.page}|${c.type}`] ?? "";
      test(`${c.id} [ui] ${c.type}: ${c.page} as ${role.label} ${tag}`.trim(), async () => {
        const ui = PAGE_UI[c.page];
        test.skip(!ui, `no UI mapping for '${c.page}'`);
        await openViaSidebar(rp, ui!.labels);
        if (c.type === "SEARCH / FILTER") await searchCheck(rp);
        else if (c.type === "PAGINATION") await paginationCheck(rp);
        else await formCheck(rp);
      });
    }
  });
}
