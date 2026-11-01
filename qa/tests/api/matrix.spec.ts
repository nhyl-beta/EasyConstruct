// API permission suite generated from qa/spec/01_access_matrix.csv.
// For every page and lifecycle action and every role: call the real endpoint with that role's token.
import { test, expect } from "@playwright/test";
import { call, createProject, type QaProject } from "../../src/api.js";
import { ACTION_API, PAGE_API } from "../../src/page-map.js";
import { ROLES, mxId } from "../../src/roles.js";
import { loadChecks, loadMatrix } from "../../src/spec.js";

const matrix = loadMatrix();
const checks = loadChecks();
const ckFor = (role: string, page: string, types: string[]) =>
  checks.filter((c) => c.role === role && c.page === page && types.includes(c.type)).map((c) => c.id);

const projects = new Map<string, Promise<QaProject>>();
const projectFor = (state: "Proposal" | "Design") => {
  if (!projects.has(state)) projects.set(state, createProject({ phase: state }));
  return projects.get(state)!;
};

const authorised = (s: number) => s !== 401 && s !== 403;
/** How many records a response carries, so a Deny that returns 200 can be told apart: rows>0 is data exposure, rows=0 is an empty scoped list. */
const rowCount = (data: unknown): string => {
  const find = (d: any): number | null => Array.isArray(d) ? d.length : d && typeof d === "object" ? (["items", "rows", "data", "results"].map((k) => find(d[k])).find((n) => n !== null) ?? null) : null;
  const n = find(data);
  return n === null ? "non-list body" : `${n} rows returned`;
};
const is2xx = (s: number) => s >= 200 && s < 300;

matrix.forEach((row, i) => {
  test.describe(row.page, () => {
    for (const role of ROLES) {
      const level = row.byRole[role.label];
      if (!level) continue;
      const id = mxId(role.code, i + 1);

      if (!row.isAction) {
        const api = PAGE_API[row.page];
        const types = level === "Deny" ? ["DENIED"] : level === "View only" ? ["READ-ONLY"] : [];
        const ck = ckFor(role.label, row.page, types).join(" ");
        test(`${id} ${ck} [api] ${row.page} as ${role.label} (${level})`, async () => {
          test.skip(!api || (api.read === null && !api.write), api?.note ?? "no API endpoint mapped for this page");
          if (api!.shared) test.info().annotations.push({ type: "remark", description: `shared endpoint: ${api!.note ?? "page reuses an endpoint used by other pages"}` });
          const probe = api!.write ?? null;

          if (api!.read) {
            await test.step("no token -> 401", async () => {
              const r = await call(null, "GET", api!.read!);
              expect(r.status, `GET ${api!.read} without a token`).toBe(401);
            });
            const r = await call(role.label, "GET", api!.read);
            if (level === "Deny") expect(r.status, `GET ${api!.read} as ${role.label} should be 403, got ${r.status}${is2xx(r.status) ? ` (${rowCount(r.data)})` : ""}`).toBe(403);
            else expect(is2xx(r.status), `GET ${api!.read} as ${role.label} should be 2xx, got ${r.status}`).toBe(true);
          }
          if (probe) {
            const w = await call(role.label, probe.method, probe.path, probe.body);
            if (level === "Full") expect(authorised(w.status), `${probe.method} ${probe.path} as ${role.label} should be authorised, got ${w.status}`).toBe(true);
            else expect(w.status, `${probe.method} ${probe.path} as ${role.label} should be 403, got ${w.status}`).toBe(403);
          }
        });
        continue;
      }

      // ACTION rows
      const probeDef = ACTION_API[row.page];
      const ck = ckFor(role.label, row.page, ["ACTION-ALLOWED", "ACTION-DENIED"]).join(" ");
      test(`${id} ${ck} [api] ${row.page.replace("ACTION: ", "")} as ${role.label} (${level})`, async () => {
        test.skip(!probeDef, "needs a Design-type project with plan sets; covered by LC-171 in the lifecycle suite");
        const p = probeDef!;
        const proj = p.state === "none" ? null : await projectFor(p.state);
        const path = p.path(proj?.id ?? 0);
        test.info().annotations.push({ type: "remark", description: p.note });
        const noToken = await call(null, p.method, path, p.body);
        expect(noToken.status, `${p.method} ${path} without a token`).toBe(401);
        const r = await call(role.label, p.method, path, p.body);
        if (level === "Deny") expect(r.status, `${p.method} ${path} as ${role.label} should be 403, got ${r.status}`).toBe(403);
        else expect(authorised(r.status), `${p.method} ${path} as ${role.label} should be authorised (not 401/403), got ${r.status}: ${r.body?.message ?? ""}`).toBe(true);
      });
    }
  });
});
