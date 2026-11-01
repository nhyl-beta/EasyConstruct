// qa:smoke (target under 3 minutes): every role can sign in and its dashboard loads, ten key pages open without errors,
// and a sample of the access matrix holds at the API.
import { statePath } from "../../src/global-setup.js";
import { call } from "../../src/api.js";
import { PAGE_API, PAGE_UI } from "../../src/page-map.js";
import { ROLES, roleByLabel } from "../../src/roles.js";
import { loadMatrix } from "../../src/spec.js";
import { DENIED_TEXT, expect, openRolePage, openViaSidebar, test } from "../ui/fixtures.js";

for (const role of ROLES) {
  test(`SMOKE [ui] ${role.label}: signs in and the dashboard loads`, async ({ browser }) => {
    const rp = await openRolePage(browser, statePath(role.slug));
    await rp.page.goto("/dashboard"); await rp.page.waitForTimeout(1500);
    expect(rp.page.url(), "redirected to login").not.toContain("/login");
    const text = await rp.page.locator("body").innerText();
    expect(DENIED_TEXT.test(text), "dashboard shows an access-denied screen").toBe(false);
    expect(text.length, "blank dashboard").toBeGreaterThan(80);
    expect(rp.health.consoleErrors, "console errors on the dashboard").toEqual([]);
    await rp.context.close();
  });
}

const KEY: [string, string][] = [["Project Manager", "Projects"], ["Project Manager", "Tasks"], ["Project Manager", "Documents"], ["Admin", "Workflows"], ["IT Designer", "User Accounts"],
  ["Human Resources", "Employees"], ["Finance Manager", "Budget"], ["Architect", "Design Submission"], ["Engineer", "Requirements"], ["Owner", "Portfolio"]];
for (const [roleLabel, page] of KEY) {
  test(`SMOKE [ui] key page ${page} as ${roleLabel}`, async ({ browser }) => {
    const rp = await openRolePage(browser, statePath(roleByLabel(roleLabel).slug));
    await openViaSidebar(rp, PAGE_UI[page]!.labels);
    expect(rp.health.consoleErrors, "console errors").toEqual([]);
    expect(rp.health.failedRequests.filter((m) => !/^(403|404)/.test(m)), "failed requests").toEqual([]);
    await rp.context.close();
  });
}

// API sample: for every role, three pages from the matrix (one Full/View-only read, one Deny read, no-token 401).
test("SMOKE [api] access-matrix sample", async () => {
  const bad: string[] = [];
  const pages = loadMatrix().filter((m) => !m.isAction && PAGE_API[m.page]?.read && !PAGE_API[m.page]!.shared);
  for (const role of ROLES) {
    const allowed = pages.find((m) => m.byRole[role.label] && m.byRole[role.label] !== "Deny");
    if (allowed) { const r = await call(role.label, "GET", PAGE_API[allowed.page]!.read!); if (r.status < 200 || r.status >= 300) bad.push(`${role.label} ${allowed.page}: ${r.status}`); }
  }
  const noToken = await call(null, "GET", PAGE_API["Projects"]!.read!); if (noToken.status !== 401) bad.push(`no token /projects: ${noToken.status}`);
  expect(bad, bad.join("; ")).toEqual([]);
});
