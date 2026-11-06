import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-overdue-review.ts
//
// Tops up the Consultant's "Overdue" card on Proposal Review (Workflow approvals) to a target
// number (default 5) so the card can be tested. "Overdue" = a stage still "current" that was
// created more than 48 hours ago (findApprovalStats, workflow/workflows/repository.ts).
// It counts the consultant stages that are already overdue, then starts the missing number of
// "Document Compliance Review" workflows as the Consultant on DEMO-S2 (through the real API,
// so the stage is genuinely pending) and moves each new stage's created_at 3 days back.
// Idempotent: once the count is at the target, a second run changes nothing.
//
// A real run needs the API running from this shell with PORT=8123 (same rule as the other demo seeds);
// a --dry-run needs only the database.
// Usage:  ALLOW_DEMO_RESET=true npm run demo:overdue-review -- --dry-run
//         ALLOW_DEMO_RESET=true npm run demo:overdue-review            (target 5)
//         ALLOW_DEMO_RESET=true npm run demo:overdue-review -- --target=8
import "dotenv/config";
import pg from "pg";
import { assertDemoDatabase } from "./demo-guard.js";
import { api, BASE, openSession } from "./demo-seed-lib.js";
import { uploadPdf } from "./demo-files.js";

const CODE = "DEMO-S2";
const TEMPLATE = "Document Compliance Review";
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DRY = process.argv.includes("--dry-run");
const target = Math.max(1, Number(arg("target") ?? 5) || 5);

async function main() {
  assertDemoDatabase(); // a dry run needs only the database guard, not the API
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const count = async (overdueOnly: boolean) =>
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM workflow_stages WHERE status = 'current' AND role = 'consultant'${overdueOnly ? " AND created_at < now() - interval '48 hours'" : ""}`,
        )
      ).rows[0].n as number;
    const pending = await count(false);
    const overdue = await count(true);
    const missing = Math.max(0, target - overdue);
    console.log(`Consultant: ${pending} pending, ${overdue} overdue, target ${target}, to add ${missing}.`);
    if (missing === 0) return console.log("Already at or above the target: nothing changed.");
    if (DRY) return console.log("Dry run: nothing changed.");

    const s = await openSession(); // signs in as the demo accounts; needs the API on the demo port
    const templates = await api<{ id: number; name: string }[]>("/workflows/templates", s.admin.token);
    const templateId = templates.find((t) => t.name === TEMPLATE)?.id;
    if (templateId === undefined) throw new Error(`No workflow template named "${TEMPLATE}" in this database.`);

    const stamp = Date.now().toString(36);
    for (let i = 1; i <= missing; i++) {
      const title = `Overdue test ${stamp}-${i}: compliance review`;
      const file = await uploadPdf(BASE, s.consultant.token, `overdue-test-${stamp}-${i}.pdf`, title, [
        `Project: ${CODE}`,
        "Synthetic file made by demo:overdue-review to test the Overdue card.",
      ]);
      const wf = await api<{ id: number; stages: { id: number; role: string; status: string }[] }>("/workflows", s.consultant.token, {
        method: "POST",
        body: { title, projectCode: CODE, templateId, attachments: [{ kind: "document", label: title, fileUrl: file.url, fileName: file.filename, fileSize: `${Math.round(file.sizeBytes / 1024)} KB` }] },
      });
      const view = await api<{ stages: { id: number; role: string; status: string }[] }>(`/workflows/${wf.id}`, s.admin.token);
      const stage = view.stages.find((x) => x.role === "consultant" && x.status === "current");
      if (!stage) throw new Error(`Workflow ${wf.id} has no current consultant stage.`);
      await pool.query(`UPDATE workflow_stages SET created_at = now() - interval '3 days' WHERE id = $1`, [stage.id]);
      console.log(`  added workflow ${wf.id} "${title}" (stage ${stage.id} backdated 3 days)`);
    }
    console.log(`Done: Consultant overdue is now ${await count(true)} of ${await count(false)} pending. Reload Proposal Review.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
