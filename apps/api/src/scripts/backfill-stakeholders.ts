// Creates one Owner stakeholder row for each project that has a client name or email and no Owner row yet.
// DRY RUN by default: it only prints what it would add. Safe to run twice (the second run finds nothing).
//
//   npm --prefix server run db:backfill-stakeholders              show the plan, change nothing
//   npm --prefix server run db:backfill-stakeholders -- --apply   write it
//
// It runs against whatever DATABASE_URL points at (printed first). The staging deployment shares the
// production database, so read the host before using --apply.
import "dotenv/config";
import { db } from "../db/connection.js";
import { projects } from "../db/schema/projects.js";
import { planBackfill } from "../project-stakeholders/rules.js";
import * as repo from "../project-stakeholders/repository.js";

const apply = process.argv.includes("--apply");

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(unreadable DATABASE_URL)";
  }
})();
console.log(`Target database host: ${host}`);

const [all, withOwner] = await Promise.all([
  db.select({ code: projects.code, client: projects.client, clientEmail: projects.clientEmail }).from(projects),
  repo.projectCodesWithOwner(),
]);
const plan = planBackfill(all, withOwner);

console.log(`${all.length} project(s), ${withOwner.size} already have an Owner row.`);
for (const row of plan) console.log(`  ${apply ? "add " : "would add "} ${row.projectCode}: ${row.company ?? row.name}${row.email ? ` <${row.email}>` : ""}`);

if (plan.length === 0) {
  console.log("Nothing to do.");
} else if (!apply) {
  console.log(`\nDry run: ${plan.length} Owner row(s) would be added. Run again with --apply to write them.`);
} else {
  const added = await repo.insertMany(plan);
  console.log(`\nAdded ${added} Owner row(s).`);
}
process.exit(0);
