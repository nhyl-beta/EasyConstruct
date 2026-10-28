// Real-database test for the Owner approval gate (npm run test:db). Guarded like the demo scripts: it refuses to run
// unless ALLOW_DEMO_RESET=true and DATABASE_URL points at this machine (or a host listed in DEMO_RESET_ALLOWED_HOSTS).
//
// It never approves anything: every request it raises stays pending (or is cancelled/removed at the end), so the
// Owner account of the throwaway database is never changed. The mail transport is faked; nothing is sent.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { env } from "../../../core/config/env.js";
import { ownerActionRequests } from "../../../core/db/schema/owner-action-requests.js";
import { users } from "../../../core/db/schema/users.js";
import { resetMailer } from "../../../core/mail/mailer.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
/* eslint-disable import/no-restricted-paths -- a test may reach into the modules it exercises */
import * as employeeService from "../../workforce/employees/service.js";
import * as employeeRepo from "../../workforce/employees/repository.js";
import { isPendingApproval } from "./service.js";
import * as repo from "./repository.js";
import * as usersService from "../users/service.js";
import { generateToken, hashToken } from "./tokens.js";

type MailEnv = { MAIL_USER?: string; MAIL_APP_PASSWORD?: string };
const mailEnv = env as unknown as MailEnv;
const original = { ...mailEnv };
const created: number[] = [];
let sent: { to: string }[] = [];
let owner: { id: number; name: string; email: string; role: string; isActive: boolean };
const IT = { id: 0, name: "DB test IT", role: "it-designer" };

before(async () => {
  assertDemoDatabase();
  mailEnv.MAIL_USER = "test";
  mailEnv.MAIL_APP_PASSWORD = "test";
  resetMailer();
  (nodemailer as unknown as { createTransport: unknown }).createTransport = () => ({
    sendMail: async (m: { to: string }) => {
      sent.push(m);
      return { rejected: [] };
    },
  });
  const [row] = await db.select().from(users).where(eq(users.role, "owner")).limit(1);
  assert.ok(row, "the throwaway database needs an Owner account (run db:seed)");
  owner = row;
  const [it] = await db.select().from(users).where(eq(users.role, "it-designer")).limit(1);
  IT.id = it?.id ?? owner.id + 100000;
});

after(async () => {
  if (created.length) await db.delete(ownerActionRequests).where(inArray(ownerActionRequests.id, created));
  Object.assign(mailEnv, original);
  resetMailer();
});

const trackPending = async () => {
  const rows = await repo.list({ statuses: ["pending"], limit: 100 });
  created.push(...rows.filter((r) => r.targetUserId === owner.id).map((r) => r.id));
};

describe("the gate on the users service", () => {
  test("changing the Owner's role is held: a pending request, an email to the Owner, the account unchanged", async () => {
    sent = [];
    const result = await usersService.update(owner.id, { role: "admin" }, IT).catch((e: Error) => e);
    // A single-owner database refuses the demotion at request time (last-owner guard); either way nothing changed.
    const [after] = await db.select().from(users).where(eq(users.id, owner.id));
    assert.equal(after!.role, "owner");
    if (isPendingApproval(result)) {
      assert.equal(sent.length, 1);
      assert.equal(sent[0]!.to, owner.email);
    } else {
      assert.match((result as Error).message, /last owner/i);
      assert.equal(sent.length, 0);
    }
    await trackPending();
  });

  test("a password reset on the Owner is held and the stored request carries a hash, never the plaintext", async () => {
    sent = [];
    const result = await usersService.setPassword(owner.id, "Plaintext-Password-123!", IT);
    assert.ok(isPendingApproval(result));
    const [row] = await db.select().from(ownerActionRequests).where(eq(ownerActionRequests.id, (result as { requestId: number }).requestId));
    created.push(row!.id);
    assert.equal(row!.status, "pending");
    assert.equal(JSON.stringify(row).includes("Plaintext-Password-123!"), false);
    assert.match((row!.payload as { passwordHash: string }).passwordHash, /^\$2[aby]\$/);
    const [account] = await db.select({ password: users.password }).from(users).where(eq(users.id, owner.id));
    assert.notEqual(account!.password, (row!.payload as { passwordHash: string }).passwordHash, "the password is not changed yet");
  });

  test("with mail not configured nothing is created and the call fails closed", async () => {
    const before = (await repo.list({ limit: 200 })).length;
    mailEnv.MAIL_USER = undefined;
    resetMailer();
    await assert.rejects(() => usersService.setPassword(owner.id, "Another-Password-456!", { ...IT, id: IT.id + 1 }), /not configured/i);
    mailEnv.MAIL_USER = "test";
    resetMailer();
    assert.equal((await repo.list({ limit: 200 })).length, before);
  });
});

describe("the HR employee-email path cannot dodge the gate", () => {
  test("editing the Owner's employee email is held and neither record changes", async () => {
    const [emp] = await db.query.employees.findMany({ where: (e, { eq: same }) => same(e.userId, owner.id), limit: 1 });
    if (!emp) return; // the throwaway Owner has no linked employee record: nothing to dodge
    sent = [];
    const result = await employeeService.update(emp.id, { email: `held-${Date.now()}@example.com` }, { id: IT.id, name: "HR test", role: "human-resources" });
    assert.ok(isPendingApproval(result));
    assert.equal((await employeeRepo.findLinkedUser(owner.id))!.email, owner.email);
    assert.equal(sent[0]!.to, owner.email);
    await trackPending();
  });
});

describe("the exactly-once claim", () => {
  const raise = async (expiresInMs: number) => {
    const row = await repo.create({
      targetUserId: owner.id,
      action: "delete",
      requestedByName: "claim test",
      status: "pending",
      tokenHash: hashToken(generateToken()),
      expiresAt: new Date(Date.now() + expiresInMs),
    });
    created.push(row!.id);
    return row!;
  };

  test("two approvals at once: exactly one wins", async () => {
    // Clear any pending delete request so the partial unique index allows this one.
    await db.update(ownerActionRequests).set({ status: "cancelled" }).where(eq(ownerActionRequests.action, "delete"));
    const row = await raise(60_000);
    const claims = await Promise.all([repo.claim(row.id, "approved", "1.1.1.1", new Date()), repo.claim(row.id, "approved", "2.2.2.2", new Date())]);
    assert.equal(claims.filter(Boolean).length, 1);
  });

  test("a decline cannot follow an approval, and an expired request cannot be claimed", async () => {
    await db.update(ownerActionRequests).set({ status: "cancelled" }).where(eq(ownerActionRequests.action, "delete"));
    const decided = await raise(60_000);
    assert.ok(await repo.claim(decided.id, "approved", "1.1.1.1", new Date()));
    assert.equal(await repo.claim(decided.id, "declined", "1.1.1.1", new Date()), null);

    await db.update(ownerActionRequests).set({ status: "cancelled" }).where(eq(ownerActionRequests.action, "delete"));
    const late = await raise(-1000);
    assert.equal(await repo.claim(late.id, "approved", "1.1.1.1", new Date()), null);
    const [still] = await db.select().from(ownerActionRequests).where(eq(ownerActionRequests.id, late.id));
    assert.equal(still!.status, "pending", "expiry is recorded by the sweep, never by a claim");
  });

  test("a second pending request for the same target and action is refused by the database", async () => {
    await db.update(ownerActionRequests).set({ status: "cancelled" }).where(eq(ownerActionRequests.action, "delete"));
    await raise(60_000);
    await assert.rejects(() => raise(60_000), (e: { code?: string; cause?: { code?: string } }) => (e.code ?? e.cause?.code) === "23505");
  });
});
