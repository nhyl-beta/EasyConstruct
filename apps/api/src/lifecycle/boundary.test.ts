// apps/api/src/lifecycle/boundary.test.ts — NEW (ai-signals D10)
//
// Enforces in code, not just in review, the "decision support never blocks"
// boundary from docs/ai-signals-progress.md section 1: gates.ts and the
// gate/progress logic in service.ts must never import the signals or
// ai-validation modules. The one sanctioned exception is
// getLifecycleView's own evaluateSignals call (Group E), which only
// APPENDS a `signals` field to the response — it can't affect canAdvance,
// gate checks, or progress, which are all computed before it runs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT_PATTERN = /from\s+["']\.\.\/(signals|ai-validation)\//g;

test("gates.ts never imports from ../signals or ../ai-validation", () => {
  const source = readFileSync(join(here, "gates.ts"), "utf8");
  const matches = source.match(IMPORT_PATTERN) ?? [];
  assert.deepEqual(matches, [], "gates.ts must stay a pure gate-only module — decision support can never gate anything");
});

test("service.ts imports the signals module at most once, and only for evaluateSignals", () => {
  const source = readFileSync(join(here, "service.ts"), "utf8");
  const matches = source.match(IMPORT_PATTERN) ?? [];
  assert.ok(
    matches.length <= 1,
    `service.ts should import from ../signals or ../ai-validation at most once (found ${matches.length}) — a second import risks decision support leaking into a gating path`,
  );
  if (matches.length === 1) {
    assert.match(
      source,
      /import\s*\{[^}]*\bevaluateSignals\b[^}]*\}\s*from\s*["']\.\.\/signals\/index\.js["']/,
      "the one allowed import must bring in evaluateSignals from ../signals/index.js",
    );
  }
});
