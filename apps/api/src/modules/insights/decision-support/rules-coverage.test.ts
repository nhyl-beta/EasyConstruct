// objectives fix 3.8: every decision-support rule is a pure function with tests.
//
// This does not test any rule's behaviour (each has its own test file). It
// guards the structure so a future rule cannot be added as untested database
// code: each listed module must exist, import no database or ORM, and be
// imported by at least one test file next to it.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Pure rule modules behind the objectives 1 to 3 fixes. Add a new rule here when it is added to the app. */
const RULE_MODULES = [
  "modules/projects/tasks/suggest",
  "modules/insights/plan-suggestion/plan",
  "modules/insights/plan-suggestion/templates",
  "modules/insights/forecast/change-impact",
  "modules/insights/signals/projected-finish",
  "modules/insights/signals/overdue-tasks",
  "modules/insights/signals/milestone-slip",
  "modules/insights/signals/findings",
  "modules/insights/signals/playbook",
  "modules/design/proposals/validation",
  "modules/projects/requirements/templates",
  "modules/workforce/attendance/exceptions",
  "modules/workforce/payroll/validation",
  "modules/workforce/payroll/trace",
  "modules/workforce/workforce-reports/fairness",
  "modules/insights/reconciliation/checks",
  "modules/platform/reference/names",
  "modules/platform/reference/backfill",
  "modules/projects/dashboard/cycle-times",
  "core/auth/throttle",
  "modules/insights/decision-support/summary",
];

const FORBIDDEN_IMPORT = /from\s+["'][^"']*(db\/connection|drizzle-orm|\/repository\.js)["']/;
const TYPE_ONLY_IMPORT = /^\s*import\s+type\b/;

describe("decision-support rules are pure and tested", () => {
  for (const mod of RULE_MODULES) {
    test(mod, () => {
      const file = join(src, `${mod}.ts`);
      assert.ok(existsSync(file), `${mod}.ts does not exist`);

      // A type-only import reads no data at run time, so it does not make a rule impure.
      const text = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => !TYPE_ONLY_IMPORT.test(line))
        .join("\n");
      assert.doesNotMatch(text, FORBIDDEN_IMPORT, `${mod}.ts must stay pure: no database, ORM or repository imports`);

      const dir = dirname(file);
      const name = mod.split("/").pop()!;
      const importedByATest = readdirSync(dir)
        .filter((f) => f.endsWith(".test.ts"))
        .some((f) => new RegExp(`from\\s+["']\\./${name}\\.js["']`).test(readFileSync(join(dir, f), "utf8")));
      assert.ok(importedByATest, `${mod}.ts is not imported by any test file in its folder`);
    });
  }
});
