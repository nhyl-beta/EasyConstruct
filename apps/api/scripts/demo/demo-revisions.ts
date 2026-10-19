import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-revisions.ts
//
// Explicit demo generator for design revisions (never runs on a read).
//   npm run demo:revisions                       every project that has no revisions (Proposal-phase projects skipped)
//   npm run demo:revisions -- --project DEMO-S4  one project
//   npm run demo:revisions -- --dry-run          print what would be created, write nothing
//   npm run demo:revisions -- --include-proposal also generate for Proposal-phase projects
//   npm run demo:revisions -- --remove           delete ONLY is_demo revisions (then is_demo designs left empty)
// Idempotent: a project that already has any revision (real or demo) is left alone.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../../src/core/db/connection.js";
import { designRevisions } from "../../src/core/db/schema/design-revisions.js";
import { designs } from "../../src/core/db/schema/designs.js";
import { projects } from "../../src/core/db/schema/projects.js";
import { ensureProjectRevisionDemo, removeDemoRevisions } from "../../src/modules/design/designs/design-revisions/demo.js";
import { assertDemoDatabase } from "./demo-guard.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const valueOf = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const counts = async () => {
  const [revs, demoRevs, ds, demoDs] = await Promise.all([
    db.select().from(designRevisions),
    db.select().from(designRevisions).where(eq(designRevisions.isDemo, true)),
    db.select().from(designs),
    db.select().from(designs).where(eq(designs.isDemo, true)),
  ]);
  return { design_revisions: revs.length, demo_revisions: demoRevs.length, designs: ds.length, demo_designs: demoDs.length };
};

async function main() {
  assertDemoDatabase();
  const project = valueOf("--project");
  console.log("Before:", await counts());

  if (flag("--remove")) {
    const r = await removeDemoRevisions(project);
    console.log(`Removed ${r.revisionsRemoved} demo revision(s) and ${r.designsRemoved} demo design(s).`);
    console.log("After: ", await counts());
    return;
  }

  const codes = project ? [project] : (await db.select({ code: projects.code }).from(projects).orderBy(projects.code)).map((p) => p.code);
  let created = 0;
  for (const code of codes) {
    const r = await ensureProjectRevisionDemo(code, { dryRun: flag("--dry-run"), includeProposal: flag("--include-proposal") });
    created += r.created;
    const detail = r.skipped
      ? `skipped (${r.skipped})`
      : `${flag("--dry-run") ? "would create" : "created"} ${r.created} revision(s)${r.designsCreated ? ` + ${r.designsCreated} demo design` : ""}: ${r.plan?.map((p) => `${p.design} [${p.versions.join(" → ")}]`).join("; ")}`;
    console.log(`  ${code.padEnd(12)} ${detail}`);
  }
  console.log(`${flag("--dry-run") ? "Dry run — nothing written. Would create" : "Created"} ${created} revision(s) in total.`);
  console.log("After: ", await counts());
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
