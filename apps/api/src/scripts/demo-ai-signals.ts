// apps/api/src/scripts/demo-ai-signals.ts
//
// Verifier for the advisory-signal scenario. The scenario itself now lives in
// DEMO-S4 (built by demo-seed-stages.ts through the real services): a Budget
// Change Request with three validation verdicts, a change-order budget line
// pushing planned spend over the contract value, burn running ahead of task
// completion, three Material issues in 30 days, and a stalled workflow stage.
//
// This script reads the live lifecycle view and asserts that all five signals
// fire, and that the gate checks / canAdvance are exactly what the pure gate
// code computes (decision support never blocks).
//
// Prerequisites: API running with FEATURE_AI=true, `npm run demo:seed` applied.
// Run with: npm run demo:ai-signals
import "dotenv/config";
import { api, login, EMAILS } from "./demo-seed-lib.js";
import { loadSnapshot } from "../lifecycle/repository.js";
import { evaluateGate } from "../lifecycle/gates.js";
import { NEXT_PHASE, isSequencedPhase, type SequencedPhase } from "../lifecycle/phases.js";

const PROJECT_CODE = process.env.AISIG_PROJECT_CODE ?? "DEMO-S4";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}`, detail ?? "");
  }
}

async function main() {
  const pm = await login(EMAILS.pm);
  const projects = await api<{ id: number; code: string }[]>("/projects", pm);
  const project = projects.find((p) => p.code === PROJECT_CODE);
  if (!project) throw new Error(`${PROJECT_CODE} not found — run npm run demo:seed first.`);

  const view = await api<{
    phase: string;
    canAdvance: boolean;
    checks: { key: string; passed: boolean }[];
    signals: { rule: string; severity: string; detail: string; label: string }[];
  }>(`/projects/${project.id}/lifecycle`, pm);

  console.log(`\n${PROJECT_CODE} (id ${project.id}) phase=${view.phase}; ${view.signals.length} signal(s):`);
  for (const s of view.signals) console.log(`  [${s.severity}] ${s.rule}: ${s.label}`);

  const byRule = (rule: string) => view.signals.filter((s) => s.rule === rule);
  check("cost-variance fired", byRule("cost-variance").length > 0, byRule("cost-variance"));
  check("cumulative-change-impact fired", byRule("cumulative-change-impact").length > 0, byRule("cumulative-change-impact"));
  check("burn-vs-progress fired", byRule("burn-vs-progress").length > 0, byRule("burn-vs-progress"));
  check("issue-recurrence fired", byRule("issue-recurrence").length > 0, byRule("issue-recurrence"));
  check("stalled-stage fired", byRule("stalled-stage").length > 0, byRule("stalled-stage"));

  const snapshot = await loadSnapshot(PROJECT_CODE);
  if (!snapshot) throw new Error("Could not load snapshot for independent verification");
  const phase = snapshot.project.status as SequencedPhase;
  const pureChecks = isSequencedPhase(phase) ? evaluateGate(phase, snapshot) : [];
  const nextPhase = isSequencedPhase(phase) ? NEXT_PHASE[phase] : null;
  const eligible = isSequencedPhase(phase) && phase !== "Completed" && phase !== "Archived" && nextPhase != null;
  const pureCanAdvance = eligible && pureChecks.every((c) => c.passed);
  check(
    "gate checks match the pure gate code exactly",
    JSON.stringify(view.checks.map((c) => ({ key: c.key, passed: c.passed }))) ===
      JSON.stringify(pureChecks.map((c) => ({ key: c.key, passed: c.passed }))),
  );
  check("canAdvance matches exactly", view.canAdvance === pureCanAdvance);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("\n✘ failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
