// API permission suite generated from qa/spec/01_access_matrix.csv (owner decisions of 2026-11-01 applied).
// For every page, lifecycle action and function and every role: call the real endpoint with that role's token.
//   Full / View only / Reference read / Scoped / Names only / Directory only -> the read answers 2xx; Deny -> 403; no token -> 401.
//   Scoped (and any operational role on project data): every returned row belongs to a project the user is assigned to.
//   Names only / Directory only: rows carry only the permitted fields.
//   Writes use VALID payloads on a fresh fixture (src/valid-writes.ts): Full or Allowed -> 2xx, everything else -> 403.
import { test, expect } from "@playwright/test";
import { call, createProject, session, type QaProject } from "../../src/api.js";
import { isKnown, knownTag } from "../../src/known.js";
import { ACTION_API, PAGE_API } from "../../src/page-map.js";
import { ROLES, mxId } from "../../src/roles.js";
import { rowsOf, scopeViolations } from "../../src/scope.js";
import { levelOf, loadChecks, loadMatrix, READS_ALLOWED, type Access } from "../../src/spec.js";
import { WRITE } from "../../src/valid-writes.js";

const matrix = loadMatrix();
const checks = loadChecks();
const OPS = new Set(["Project Manager", "Architect", "Engineer", "Consultant", "Site Personnel"]);
const ckFor = (role: string, page: string, types: string[]) => checks.filter((c) => c.role === role && c.page === page && types.includes(c.type)).map((c) => c.id);

const projects = new Map<string, Promise<QaProject>>();
const projectFor = (state: "Proposal" | "Design") => { if (!projects.has(state)) projects.set(state, createProject({ phase: state })); return projects.get(state)!; };

const authorised = (s: number) => s !== 401 && s !== 403;
const is2xx = (s: number) => s >= 200 && s < 300;
const FIELDS: Partial<Record<Access, Set<string>>> = {
  "Names only": new Set(["id", "name"]),
  "Directory only": new Set(["id", "employeeId", "name", "email", "hasAccount", "userId"]),
};
const rowCount = (data: unknown) => `${rowsOf(data).length} rows returned`;

matrix.forEach((row, i) => {
  test.describe(row.page, () => {
    for (const role of ROLES) {
      const level = row.byRole[role.label] as Access | undefined;
      if (!level) continue;
      const id = mxId(role.code, i + 1);
      const tag = knownTag(role.label, row.page);

      if (!row.isAction) {
        const api = PAGE_API[row.page];
        const types = level === "Deny" ? ["DENIED"] : READS_ALLOWED.includes(level) && level !== "Full" ? ["READ-ONLY"] : [];
        const ck = ckFor(role.label, row.page, types).join(" ");
        test(`${id} ${ck} [api] ${row.page} as ${role.label} (${level})${tag}`, async () => {
          test.skip(!api || (api.read === null && !api.write), api?.note ?? "no API endpoint mapped for this page");
          if (api!.shared) test.info().annotations.push({ type: "remark", description: `shared endpoint: ${api!.note ?? "page reuses an endpoint used by other pages"}` });
          if (level !== "Deny" && level !== "Full") test.info().annotations.push({ type: "remark", description: `owner decision 2026-11-01: ${level}` });

          if (api!.read) {
            const none = await call(null, "GET", api!.read);
            expect(none.status, `GET ${api!.read} without a token`).toBe(401);
            const r = await call(role.label, "GET", api!.read);
            if (level === "Deny") {
              expect(r.status, `GET ${api!.read} as ${role.label} should be 403, got ${r.status}${is2xx(r.status) ? ` (${rowCount(r.data)})` : ""}`).toBe(403);
            } else {
              expect(is2xx(r.status), `GET ${api!.read} as ${role.label} should be 2xx, got ${r.status}`).toBe(true);
              const rows = rowsOf(r.data);
              const allowed = FIELDS[level];
              if (allowed) {
                const extra = [...new Set(rows.flatMap((x) => Object.keys(x ?? {})))].filter((k) => !allowed.has(k));
                expect(extra, `${level}: rows also carry ${extra.join(", ")} (permitted: ${[...allowed].join(", ")})`).toEqual([]);
              }
              if (api!.projectData && OPS.has(role.label)) {
                const me = await session(role.label);
                const v = await scopeViolations(rows, me.userId!);
                expect(v.outside, `${v.outside.length} project(s) in the ${rows.length} returned rows are not assigned to ${role.label}: ${v.outside.slice(0, 5).join(", ")}${v.outside.length > 5 ? "…" : ""}`).toEqual([]);
              }
            }
          }
          const w = api!.write;
          if (w) {
            const exception = api!.writeAction ? levelOf(role.label, api!.writeAction) === "Allowed" : false;
            const writeAllowed = level === "Full" || exception;
            const status = w.valid ? await (await WRITE[w.valid]!())(role.label) : (await call(role.label, w.method, w.path, w.body)).status;
            if (writeAllowed) expect(w.valid ? is2xx(status) : authorised(status), `${w.method} ${w.path} as ${role.label} should succeed, got ${status}`).toBe(true);
            else expect(status, `${w.method} ${w.path} as ${role.label} should be 403, got ${status}`).toBe(403);
          }
        });
        continue;
      }

      // ACTION / FUNCTION rows
      const probeDef = ACTION_API[row.page];
      const ck = ckFor(role.label, row.page, ["ACTION-ALLOWED", "ACTION-DENIED"]).join(" ");
      test(`${id} ${ck} [api] ${row.page.replace(/^(ACTION|FUNCTION): /, "")} as ${role.label} (${level})${tag}`, async () => {
        test.skip(!probeDef, "needs a Design-type project with plan sets; covered by LC-171 in the lifecycle suite");
        const p = probeDef!;
        test.info().annotations.push({ type: "remark", description: p.note });
        if (p.valid) {
          const bad: string[] = [];
          for (const key of p.valid) {
            const status = await (await WRITE[key]!())(role.label);
            if (level === "Deny" ? status !== 403 : !is2xx(status)) bad.push(`${key} -> ${status}`);
          }
          expect(bad, `${level === "Deny" ? "should be 403" : "should succeed"}: ${bad.join("; ")}`).toEqual([]);
          return;
        }
        const proj = p.state === "none" ? null : await projectFor(p.state);
        const path = p.path(proj?.id ?? 0);
        const noToken = await call(null, p.method, path, p.body);
        expect(noToken.status, `${p.method} ${path} without a token`).toBe(401);
        const r = await call(role.label, p.method, path, p.body);
        if (level === "Deny") expect(r.status, `${p.method} ${path} as ${role.label} should be 403, got ${r.status}`).toBe(403);
        else expect(authorised(r.status), `${p.method} ${path} as ${role.label} should be authorised (not 401/403), got ${r.status}: ${r.body?.message ?? ""}`).toBe(true);
      });
    }
  });
});
