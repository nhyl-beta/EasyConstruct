// Links existing accounts to their employee records by email (case-insensitive), only when exactly one match exists.
// Idempotent and non-destructive: it only sets employees.user_id where it is NULL. Ambiguous or missing matches are
// left alone and printed. `--dry-run` prints the report without writing.
//
//   npm run db:backfill-employee-links -- --dry-run
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../src/core/db/connection.js";
import { employees } from "../../src/core/db/schema/employees.js";
import { users } from "../../src/core/db/schema/users.js";
import { planEmployeeLinks } from "./employee-link-plan.js";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const allEmployees = await db
    .select({ id: employees.id, employeeId: employees.employeeId, name: employees.name, email: employees.email, userId: employees.userId })
    .from(employees);
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users);

  const plan = planEmployeeLinks(allEmployees, allUsers);

  let linked = 0;
  for (const l of plan.links) {
    if (dryRun) {
      console.log(`would link ${l.employeeId} -> account ${l.email}`);
      continue;
    }
    const done = await db
      .update(employees)
      .set({ userId: l.userId, updatedAt: new Date() })
      .where(and(eq(employees.id, l.employeeRowId), isNull(employees.userId)))
      .returning({ id: employees.id });
    if (done.length > 0) {
      linked++;
      console.log(`linked ${l.employeeId} -> account ${l.email}`);
    }
  }

  console.log(`\n${dryRun ? "Would link" : "Linked"} ${dryRun ? plan.links.length : linked} account(s) by email.`);
  if (plan.ambiguous.length > 0) {
    console.log(`\nAmbiguous (several employees or accounts share one email; left alone):`);
    for (const a of plan.ambiguous) console.log(`  ${a.email}: employees ${a.employees.join(", ")}; account ids ${a.users.join(", ")}`);
  }
  if (plan.alreadyLinked.length > 0) {
    console.log(`\nAccount already belongs to another employee (left alone):`);
    for (const a of plan.alreadyLinked) console.log(`  ${a.employeeId} -> ${a.userEmail}`);
  }
  const unlinkedLeft = plan.accountsWithoutEmployee;
  console.log(`\nAccounts with NO employee record after this run: ${unlinkedLeft.length}`);
  for (const u of unlinkedLeft) console.log(`  ${u.email} (${u.role})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
