// UI role suite from qa/spec/03_role_page_checks.csv: NAVIGATE, CONTENT, DENIED, READ-ONLY. Grouped by role, one
// storageState per role (created once in global setup). Selectors are role/text based; no data-testid is used.
import { statePath } from "../../src/global-setup.js";
import { PAGE_ROUTES, PAGE_UI } from "../../src/page-map.js";
import { ROLES } from "../../src/roles.js";
import { loadChecks, loadMatrix } from "../../src/spec.js";
import { DENIED_TEXT, expect, findItem, settle, sidebarButton, sidebarItems, test } from "./fixtures.js";

const checks = loadChecks().filter((c) => ["NAVIGATE", "CONTENT", "DENIED", "READ-ONLY"].includes(c.type));
const matrix = loadMatrix();

for (const role of ROLES) {
  test.describe(`${role.label} UI access`, () => {
    test.use({ storageState: statePath(role.slug) });

    // Routes and labels the matrix says this role may use: a "Deny" page that shares a route/label with one of these
    // cannot be judged by that route/label alone (reported as inconclusive for that part).
    const allowedRoutes = new Set(matrix.filter((m) => !m.isAction && m.byRole[role.label] && m.byRole[role.label] !== "Deny").flatMap((m) => PAGE_ROUTES[m.page] ?? []));
    const allowedLabels = new Set(matrix.filter((m) => !m.isAction && m.byRole[role.label] && m.byRole[role.label] !== "Deny").flatMap((m) => (PAGE_UI[m.page]?.labels ?? []).map((l) => l.toLowerCase())));

    for (const c of checks.filter((x) => x.role === role.label)) {
      test(`${c.id} [ui] ${c.type}: ${c.page} as ${role.label}`, async ({ page, health }) => {
        const ui = PAGE_UI[c.page];
        test.skip(!ui, `no UI mapping for '${c.page}' (page not identified in the web app's resources)`);
        if (ui!.approx) test.info().annotations.push({ type: "remark", description: `sidebar label '${ui!.labels.join(" / ")}' is an approximation of '${c.page}'` });

        await page.goto("/dashboard");
        await settle(page);
        expect(page.url(), "session was not accepted by the web app (redirected to login)").not.toContain("/login");
        const items = await sidebarItems(page);
        const item = findItem(items, ui!.labels);

        if (c.type === "DENIED") {
          const sharedLabel = ui!.labels.some((l) => allowedLabels.has(l.toLowerCase()));
          if (item && !sharedLabel) expect.soft(item, `'${item!.text}' is in the sidebar for ${role.label}`).toBeUndefined();
          else if (item && sharedLabel) test.info().annotations.push({ type: "remark", description: `sidebar label '${item.text}' is also used by a page this role may open: sidebar part inconclusive` });
          const routes = (PAGE_ROUTES[c.page] ?? []).filter((r) => !allowedRoutes.has(r));
          if (!routes.length && !(item && !sharedLabel)) test.skip(true, "every route of this page is shared with an allowed page; direct-URL check inconclusive");
          for (const route of routes) {
            await page.goto(route);
            await settle(page);
            const url = new URL(page.url());
            const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
            const blocked = url.pathname !== route || DENIED_TEXT.test(body);
            expect.soft(blocked, `direct URL ${route} was served to ${role.label} (stayed on ${url.pathname}, no access-denied message)`).toBe(true);
          }
          expect(test.info().errors, "one or more denied-access expectations failed").toHaveLength(0);
          return;
        }

        // NAVIGATE / CONTENT / READ-ONLY: the page must be reachable from the sidebar.
        expect(item, `sidebar item '${ui!.labels.join("' / '")}' not found (sidebar has: ${items.map((i) => i.text).join(", ")})`).toBeTruthy();
        const before = health.failedRequests.length;
        await sidebarButton(page, item!.text).click();
        await settle(page);
        expect(page.url(), "navigation ended on the login page").not.toContain("/login");
        const body = (await page.locator("main, body").first().innerText()) ?? "";

        if (c.type === "NAVIGATE") {
          expect(DENIED_TEXT.test(body), "page shows an access-denied / not-found screen").toBe(false);
          expect(health.consoleErrors, "console errors").toEqual([]);
          expect(health.failedRequests.slice(before), "failed network requests").toEqual([]);
        } else if (c.type === "CONTENT") {
          test.info().annotations.push({ type: "remark", description: "generic content check only (heading + non-empty body); column order and labels are not in the spec data" });
          expect(DENIED_TEXT.test(body), "page shows an access-denied / not-found screen").toBe(false);
          expect(body.trim().length, "page body is blank").toBeGreaterThan(40);
          const heading = page.getByRole("heading").first();
          await expect(heading, "no heading rendered").toBeVisible();
        } else {
          // READ-ONLY: no create / edit / approve / delete controls inside the page content.
          const controls = await page.locator("main").getByRole("button", { name: /^(new|add|create|edit|approve|delete|remove|upload|submit|save|reject)\b/i }).allInnerTexts();
          const links = await page.locator("main").getByRole("link", { name: /^(new|add|create|edit)\b/i }).allInnerTexts();
          expect([...controls, ...links].map((t) => t.trim()), `modifying controls shown to a View-only role`).toEqual([]);
        }
      });
    }
  });
}
