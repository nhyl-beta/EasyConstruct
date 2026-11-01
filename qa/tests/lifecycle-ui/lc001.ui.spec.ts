// LC-001 driven through the UI: HR creates an employee, IT Designer creates the linked account, the new user signs in.
import { expect, test } from "@playwright/test";
import { steps } from "../../src/kit.js";
import { QA_PASSWORD } from "../../src/roles.js";
import { asRole, choose, settle } from "./ui-kit.js";

test("LC-001 [ui] (UI) Account creation is linked to an employee record", async ({ browser }) => {
  test.setTimeout(180_000);
  const S = steps("LC-001");
  const n = Date.now().toString(36).slice(-5);
  const first = "Quinn", last = `Uitest${n}`, email = `quinn.uitest.${n}@easyconstruct.demo`, empId = `EMP-UI${n.toUpperCase()}`.slice(0, 20);
  const hr = await asRole(browser, "Human Resources"), it = await asRole(browser, "IT Designer");

  await S.run(1, "HR creates a new employee record in the Add employee wizard -> saved and listed", async () => {
    const p = hr.page;
    await p.goto("/employees/create"); await settle(p);
    await p.getByPlaceholder("e.g. Adaeze").fill(first); await p.getByPlaceholder("e.g. Nwosu").fill(last);
    await p.getByPlaceholder("e.g. a.nwosu@orra.com").fill(email); await p.getByPlaceholder("+63 9XX XXX XXXX").fill("+63 900 111 2222");
    await p.getByPlaceholder("e.g. EMP-011").fill(empId); await p.getByPlaceholder("Select hire date").fill("2026-11-01");
    await p.getByRole("button", { name: /Next/ }).click(); await p.waitForTimeout(700);
    await p.getByPlaceholder("e.g. Site Engineer").fill("Site Worker");
    await choose(p, p, "Select department", /./); await choose(p, p, "Select site", /./);
    await p.getByPlaceholder("0.00").fill("150");
    for (let i = 0; i < 4; i++) {
      const done = p.getByRole("button", { name: /^(create|save|submit|finish|add employee|confirm)/i }).last();
      if (await done.count()) { await done.click(); break; }
      await p.getByRole("button", { name: /Next/ }).click(); await p.waitForTimeout(700);
    }
    await p.waitForTimeout(1500);
    await p.goto("/employees"); await settle(p);
    await p.getByPlaceholder(/search/i).last().fill(last); await p.waitForTimeout(900);
    await expect(p.getByText(last).first(), "new employee not listed").toBeVisible();
  });

  await S.run(2, "IT Designer opens New account and searches the new employee -> offered", async () => {
    const p = it.page;
    await p.goto("/it-designer/users"); await settle(p);
    await p.getByRole("button", { name: /^New account/ }).click(); await p.waitForTimeout(800);
    await p.getByRole("combobox").filter({ hasText: /Select an employee/ }).click();
    await p.getByPlaceholder(/search/i).last().fill(last).catch(() => {}); await p.waitForTimeout(700);
    await expect(p.getByRole("option", { name: new RegExp(last) }).first(), "employee without an account is not offered").toBeVisible();
  });
  await S.run(3, "Selecting the employee fills Full name and Email, both locked", async () => {
    const p = it.page;
    await p.getByRole("option", { name: new RegExp(last) }).first().click(); await p.waitForTimeout(600);
    const dlg = p.getByRole("dialog");
    await expect(dlg.getByLabel("Full name")).toHaveValue(new RegExp(last));
    await expect(dlg.getByLabel("Email")).toHaveValue(email);
    await expect(dlg.getByLabel("Full name"), "Full name is editable").toHaveAttribute("readonly", "");
    await expect(dlg.getByLabel("Email"), "Email is editable").toHaveAttribute("readonly", "");
  });
  await S.run(4, "A 5-character password blocks creation", async () => {
    const dlg = it.page.getByRole("dialog");
    await dlg.getByLabel("Initial password").fill("12345");
    await choose(it.page, dlg, "Select a role", /Engineer/);
    const create = dlg.getByRole("button", { name: /^Create account/ });
    const blocked = (await create.isDisabled()) || (await dlg.getByText(/at least 10|10 characters/i).count()) > 0;
    expect(blocked, "a 5-character password was not blocked").toBe(true);
  });
  await S.run(5, "A valid password and role -> account created and shown in the table", async () => {
    const p = it.page, dlg = p.getByRole("dialog");
    await dlg.getByLabel("Initial password").fill(QA_PASSWORD);
    await dlg.getByRole("button", { name: /^Create account/ }).click(); await p.waitForTimeout(1500);
    await p.getByPlaceholder(/search accounts/i).fill(email); await p.waitForTimeout(900);
    await expect(p.getByText(email).first(), "account not shown in the table").toBeVisible();
  });
  await S.run(6, "The new user signs in and lands on the dashboard of the assigned role only", async () => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:5173" });
    const p = await ctx.newPage();
    await p.goto("/login"); await p.fill("#email", email); await p.fill("#password", QA_PASSWORD);
    await p.getByRole("button", { name: /sign in/i }).click();
    await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15_000 });
    await settle(p, 1500);
    const side = (await p.locator("[data-slot='sidebar']").innerText()).toLowerCase();
    expect(side, "Engineer sidebar items missing").toContain("progress");
    expect(side, "an Engineer sees User Accounts").not.toContain("user accounts");
    await ctx.close();
  });
  await hr.context.close(); await it.context.close();
  S.done();
});
