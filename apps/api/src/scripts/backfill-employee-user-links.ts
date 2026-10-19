import { eq, isNull } from "drizzle-orm";
import { db } from "../db/connection.js";
import { employees } from "../db/schema/employees.js";
import { users } from "../db/schema/users.js";

async function main() {
  const unlinked = await db.select().from(employees).where(isNull(employees.userId));
  let linked = 0;

  for (const emp of unlinked) {
    if (!emp.email) continue;
    const [user] = await db.select().from(users).where(eq(users.email, emp.email));
    if (user) {
      await db.update(employees).set({ userId: user.id }).where(eq(employees.id, emp.id));
      linked++;
    }
  }

  console.log(`Linked ${linked} of ${unlinked.length} unlinked employee records by email match.`);
  console.log(`${unlinked.length - linked} employees have no matching user account and remain unlinked.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});