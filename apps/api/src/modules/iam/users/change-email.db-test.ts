// Real-database test (npm run test:db): IT Designer changes an account's sign-in email. The account and its linked
// employee record must change together, a taken address must be refused with nothing changed, and the person's
// sessions must end (tokens_valid_after moves).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { users } from "../../../core/db/schema/users.js";
import { ownerActionRequests } from "../../../core/db/schema/owner-action-requests.js";
import { employees } from "../../../core/db/schema/employees.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { changeEmail } from "./service.js";

const tag = `ce${Date.now().toString(36)}`;
const addr = (n: string) => `${n}.${tag}@example.test`;
const IT = { id: 0, name: "IT Test", role: "it-designer" } as Parameters<typeof changeEmail>[2];

let userId: number;
let otherUserId: number;
let ownerId: number;
let ownerEmail: string;
const employeeIds: number[] = [];

const makeEmployee = async (code: string, email: string, userIdForLink: number) => {
  const [e] = await db
    .insert(employees)
    .values({ employeeId: `${code}-${tag}`.slice(0, 20), name: `Emp ${code}`, initials: "EE", role: "Tester", department: "QA", site: "HQ", hiredOn: "2026-01-01", email, userId: userIdForLink })
    .returning({ id: employees.id });
  employeeIds.push(e!.id);
};
const makeUser = async (name: string, email: string, role = "engineer") =>
  (await db.insert(users).values({ name, email, password: "x", role }).returning({ id: users.id }))[0]!.id;

describe("changeEmail (IT Designer)", () => {
  before(async () => {
    assertDemoDatabase();
    userId = await makeUser("Ann Account", addr("ann"));
    otherUserId = await makeUser("Bob Account", addr("bob"));
    // There is only room for one Owner, so use the seeded one; the test never lets its email change.
    const [owner] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
    assert.ok(owner, "the throwaway database needs an Owner account (run db:seed)");
    ownerId = owner!.id;
    ownerEmail = owner!.email;
    await makeEmployee("A", addr("ann"), userId);
    await makeEmployee("B", addr("bob"), otherUserId);
  });

  after(async () => {
    await db.delete(ownerActionRequests).where(eq(ownerActionRequests.targetUserId, ownerId));
    await db.delete(employees).where(inArray(employees.id, employeeIds));
    await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
    await db.$client.end();
  });

  test("updates the account and its linked employee record together, and ends the sessions", async () => {
    const result = (await changeEmail(userId, addr("ann.new"), IT)) as { email: string };
    assert.equal(result.email, addr("ann.new"));
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    const [e] = await db.select().from(employees).where(eq(employees.userId, userId));
    assert.equal(u!.email, addr("ann.new"));
    assert.equal(e!.email, addr("ann.new"));
    assert.ok(u!.tokensValidAfter, "sessions issued before the change must stop working");
  });

  test("refuses an address another account or employee already uses, and changes nothing", async () => {
    await assert.rejects(changeEmail(userId, addr("bob").toUpperCase(), IT), /already exists/);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    assert.equal(u!.email, addr("ann.new"));
  });

  test("refuses the address the account already has", async () => {
    await assert.rejects(changeEmail(userId, addr("ann.new"), IT), /already this account's email/);
  });

  test("the Owner account goes through the Owner's approval, so nothing changes at once", async () => {
    // Asking for the approval emails the Owner; with no mail configured here that is refused. Either way the
    // address must be untouched until the Owner approves.
    await changeEmail(ownerId, addr("olga.new"), IT).catch(() => undefined);
    const [u] = await db.select().from(users).where(eq(users.id, ownerId));
    assert.equal(u!.email, ownerEmail);
  });
});
