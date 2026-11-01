// UI helpers for lifecycle steps a person does in the browser. Selectors are role/label/text based (no data-testid).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { statePath } from "../../src/global-setup.js";
import { ROLES } from "../../src/roles.js";
import { assertQaEnvironment } from "../../src/guard.js";

export async function asRole(browser: Browser, roleLabel: string): Promise<{ page: Page; context: BrowserContext }> {
  const r = ROLES.find((x) => x.label === roleLabel)!;
  const context = await browser.newContext({ storageState: statePath(r.slug), baseURL: assertQaEnvironment().baseUrl });
  const page = await context.newPage();
  return { page, context };
}
export const settle = async (page: Page, ms = 900) => { await page.waitForLoadState("load").catch(() => {}); await page.waitForTimeout(ms); };

/** Radix select: open the trigger that shows `current` text and choose the option whose text matches `option`. */
export async function choose(page: Page, scope: ReturnType<Page["locator"]> | Page, current: string | RegExp, option: string | RegExp) {
  await scope.getByRole("combobox").filter({ hasText: current }).first().click();
  const opt = page.getByRole("option", { name: option }).first();
  await opt.waitFor({ state: "visible", timeout: 6000 });
  await opt.click();
}
/** Opens a project through the Projects page by code, like a person searching the list. */
export async function openProject(page: Page, code: string, sidebarLabel = "Projects") {
  await page.goto("/dashboard"); await settle(page);
  const groups = page.locator("[data-slot='sidebar'] [data-sidebar='menu-button'][aria-expanded='false']");
  for (let i = 0, n = await groups.count(); i < n; i++) await groups.nth(0).click({ timeout: 1500 }).catch(() => {});
  await page.locator("[data-slot='sidebar'] [data-sidebar^='menu-']").filter({ hasText: new RegExp(`^\\s*${sidebarLabel}\\s*\\d*\\s*$`) }).first().click();
  await settle(page);
  const search = page.getByPlaceholder(/search/i).filter({ hasNot: page.locator("[aria-label*='jump']") }).last();
  await search.fill(code); await page.waitForTimeout(900);
  await page.getByText(code, { exact: false }).first().click();
  await settle(page, 1500);
}

import { pdfBytes } from "../../src/kit.js";
/** The smallest element that contains both the project code and an Approve button: the workflow's row/card. */
export const approveRowFor = (page: Page, text: string) =>
  page.locator(`xpath=//*[contains(normalize-space(.), "${text}") and .//button[normalize-space()="Approve"] and not(.//*[contains(normalize-space(.), "${text}") and .//button[normalize-space()="Approve"]])]`)
    .first().getByRole("button", { name: "Approve", exact: true }).first();
/** Approval lists are paginated (10 per page, oldest first): walk the pages until the row for this project shows up. */
export async function findApprove(page: Page, text: string) {
  for (let i = 0; i < 12; i++) {
    const btn = approveRowFor(page, text);
    if (await btn.count()) return btn;
    const next = page.getByRole("button", { name: /go to next page/i }).first();
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click(); await page.waitForTimeout(700);
  }
  return null;
}
/** Finds the project's Approve button on the current page, clicks it and confirms a dialog if one opens. */
export async function clickApprove(page: Page, code: string, where: string) {
  const btn = await findApprove(page, code);
  expect(btn, `no Approve button for ${code} on ${where} (all pages searched)`).toBeTruthy();
  await btn!.click(); await page.waitForTimeout(800);
  const confirm = page.locator("[role=alertdialog],[role=dialog]").getByRole("button", { name: /^(approve|confirm|submit)/i }).last();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(1500);
}
/** Documents page -> Upload dialog: title, project, type, file. */
export async function uploadDocument(page: Page, code: string, type: string) {
  await page.goto("/documents"); await settle(page);
  await page.getByRole("button", { name: /^Upload/ }).first().click(); await page.waitForTimeout(700);
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder(/Foundation pour/).fill(`${type} - ${code}`);
  await choose(page, dlg, "Select a project", new RegExp(code));
  await dlg.getByRole("combobox").filter({ hasText: "Field Report" }).click();
  await page.getByRole("option", { name: new RegExp(`^${type}`) }).first().click();
  await dlg.locator("input[type=file]").setInputFiles({ name: `${type.replace(/\W+/g, "-")}.pdf`, mimeType: "application/pdf", buffer: pdfBytes(type) });
  await dlg.getByRole("button", { name: /^Upload$/ }).click(); await page.waitForTimeout(2200);
}
/** Project page -> "Advance to <phase>" button (+ confirm dialog). */
export async function advanceViaUi(page: Page, projectId: number, to: string) {
  await page.goto(`/projects/${projectId}`); await settle(page, 1800);
  const adv = page.getByRole("button", { name: new RegExp(`^Advance to ${to}`) });
  await expect(adv, `'Advance to ${to}' is not enabled`).toBeEnabled();
  await adv.click(); await page.waitForTimeout(800);
  const confirm = page.locator("[role=alertdialog],[role=dialog]").getByRole("button", { name: /advance|confirm|yes|continue/i }).last();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(2500);
}
export { expect };
