// The request / decide flows with an in-memory repository, a fake mailer and no database.
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { OwnerActionRequest } from "../../../core/db/schema/owner-action-requests.js";
import { AppError } from "../../../core/utils/errors.js";
import type { Executor, ExecutorKey } from "./executors.js";
import { decide, getDetails, request, type Deps } from "./service.js";

const NOW = new Date("2026-10-28T10:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

const OWNER = { id: 1, name: "Olivia Owner", email: "owner@example.com", role: "owner" };
const IT = { id: 7, name: "Ian IT", role: "it-designer" };

let rows: OwnerActionRequest[] = [];
let mails: { to: string; subject: string; text: string; html?: string }[] = [];
let audits: { action: string; summary: string }[] = [];
let notes: { title: string; recipientUserId?: number; recipientRole?: string }[] = [];
let executed: string[] = [];
let mailConfigured = true;
let mailFails = false;
let executorFails = false;

// A repository that behaves like the SQL one, in memory.
const memoryRepo = {
  create: async (row: Partial<OwnerActionRequest>) => {
    if (rows.some((r) => r.targetUserId === row.targetUserId && r.action === row.action && r.status === "pending")) {
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    }
    const created = { id: rows.length + 1, payload: null, decidedAt: null, decidedIp: null, executedAt: null, createdAt: NOW, ...row } as OwnerActionRequest;
    rows.push(created);
    return created;
  },
  findByTokenHash: async (hash: string) => rows.find((r) => r.tokenHash === hash) ?? null,
  findPending: async (target: number, action: string) => rows.find((r) => r.targetUserId === target && r.action === action && r.status === "pending") ?? null,
  expireStale: async (target: number | null, now: Date) => {
    const stale = rows.filter((r) => r.status === "pending" && r.expiresAt < now && (target == null || r.targetUserId === target));
    stale.forEach((r) => (r.status = "expired"));
    return stale;
  },
  recentCreationTimes: async (by: number, now: Date) => rows.filter((r) => r.requestedByUserId === by && now.getTime() - r.createdAt.getTime() < 3_600_000).map((r) => r.createdAt),
  // Like the SQL: one conditional update, so only the first caller wins.
  claim: async (id: number, status: "approved" | "declined", ip: string, now: Date) => {
    const r = rows.find((x) => x.id === id);
    if (!r || r.status !== "pending" || r.expiresAt <= now) return null;
    r.status = status;
    r.decidedAt = now;
    r.decidedIp = ip;
    return r;
  },
  markExecuted: async (id: number, now: Date) => void (rows.find((x) => x.id === id)!.executedAt = now),
  cancelUnsent: async (id: number) => void (rows.find((x) => x.id === id && x.status === "pending")!.status = "cancelled"),
  cancel: async (id: number, by: number) => {
    const r = rows.find((x) => x.id === id && x.requestedByUserId === by && x.status === "pending");
    if (r) r.status = "cancelled";
    return r ?? null;
  },
  list: async () => rows,
};

const deps = (): Deps => ({
  repo: memoryRepo as unknown as Deps["repo"],
  findUser: async (id) => (id === OWNER.id ? OWNER : null),
  assertMailConfigured: () => {
    if (!mailConfigured) throw new AppError(503, "MAIL_NOT_CONFIGURED", "Email delivery is not configured");
  },
  sendMail: async (m) => {
    if (mailFails) throw new AppError(502, "MAIL_SEND_FAILED", "The email could not be sent");
    mails.push(m);
  },
  audit: async (row, action, _actor, summary) => void audits.push({ action, summary }),
  notify: async (n) => void notes.push(n),
  getExecutor: (key: ExecutorKey): Executor | undefined =>
    async () => {
      if (executorFails) throw new Error("last owner guard");
      executed.push(key);
    },
  ttlMinutes: () => 60,
  appUrl: () => "https://app.example.com",
});

const tokenFromMail = () => /owner-approval\/([A-Za-z0-9_-]{43})/.exec(mails.at(-1)!.text)![1]!;
const ask = (action: Parameters<typeof request>[0]["action"], payload = {}, requester = IT, now = NOW) =>
  request({ targetUserId: OWNER.id, action, payload, requester }, now, deps());

beforeEach(() => {
  rows = [];
  mails = [];
  audits = [];
  notes = [];
  executed = [];
  mailConfigured = true;
  mailFails = false;
  executorFails = false;
});

describe("asking", () => {
  test("holds the change: a pending row, an email to the Owner's address from the database, nothing executed", async () => {
    const result = await ask("change_role", { role: "admin", fromRole: "owner" });
    assert.equal(result.status, "pending_owner_approval");
    assert.equal(result.ownerEmailMasked, "o***@example.com");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.status, "pending");
    assert.deepEqual(executed, []);
    assert.equal(mails.length, 1);
    assert.equal(mails[0]!.to, OWNER.email);
    assert.match(mails[0]!.text, /Ian IT \(it-designer\)/);
    assert.deepEqual(notes.map((n) => n.recipientRole), ["owner"]);
  });

  test("the token reaches only the email: not the result, not the audit trail, and only its hash is stored", async () => {
    const result = await ask("deactivate");
    const token = tokenFromMail();
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.equal(JSON.stringify(audits).includes(token), false);
    assert.equal(JSON.stringify(rows).includes(token), false);
    assert.equal(rows[0]!.tokenHash.length, 64);
  });

  test("mail not configured fails closed: 503, no row, no change", async () => {
    mailConfigured = false;
    await assert.rejects(() => ask("delete"), (e: AppError) => e.statusCode === 503);
    assert.equal(rows.length, 0);
    assert.deepEqual(executed, []);
  });

  test("a send failure cancels the request, audits it, and surfaces the error", async () => {
    mailFails = true;
    await assert.rejects(() => ask("deactivate"), (e: AppError) => e.code === "MAIL_SEND_FAILED");
    assert.equal(rows[0]!.status, "cancelled");
    assert.ok(audits.some((a) => a.action === "delivery_failed"));
    assert.deepEqual(executed, []);
  });

  test("a second pending request for the same action is refused", async () => {
    await ask("deactivate");
    await assert.rejects(() => ask("deactivate"), (e: AppError) => e.statusCode === 409);
    assert.equal(rows.length, 1);
  });

  test("an old pending request that ran out of time no longer blocks a new one", async () => {
    await ask("deactivate");
    await ask("deactivate", {}, IT, minutes(61));
    assert.deepEqual(rows.map((r) => r.status), ["expired", "pending"]);
  });

  test("a requester gets at most 3 requests an hour", async () => {
    await ask("deactivate");
    await ask("reactivate");
    await ask("delete");
    await assert.rejects(() => ask("password_reset", { passwordHash: "x" }), (e: AppError) => e.statusCode === 429);
    assert.equal(rows.length, 3);
    // another requester is not affected
    await ask("change_role", { role: "admin", fromRole: "owner" }, { id: 8, name: "Other IT", role: "it-designer" });
    assert.equal(rows.length, 4);
  });

  test("a password reset stores only the hash, and neither the hash nor a password appears in the email or audit", async () => {
    const hash = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456";
    await ask("password_reset", { passwordHash: hash });
    assert.equal((rows[0]!.payload as { passwordHash: string }).passwordHash, hash);
    assert.equal(JSON.stringify(rows[0]!.payload).includes("plain"), false);
    assert.equal(mails[0]!.text.includes(hash), false);
    assert.equal((mails[0]!.html ?? "").includes(hash), false);
    assert.equal(JSON.stringify(audits).includes(hash), false);
  });

  test("a target that is not the Owner is refused", async () => {
    await assert.rejects(() => request({ targetUserId: 99, action: "delete", requester: IT }, NOW, deps()), (e: AppError) => e.statusCode === 400);
  });
});

describe("deciding", () => {
  test("viewing the link changes nothing", async () => {
    await ask("deactivate");
    const token = tokenFromMail();
    const details = await getDetails(token, NOW, deps());
    assert.equal(details.action, "deactivate");
    assert.equal(rows[0]!.status, "pending");
    assert.equal(rows[0]!.decidedAt, null);
    assert.deepEqual(executed, []);
  });

  test("approve executes exactly once, even when two approvals arrive together", async () => {
    await ask("deactivate");
    const token = tokenFromMail();
    const results = await Promise.allSettled([decide(token, "approve", "1.1.1.1", NOW, deps()), decide(token, "approve", "2.2.2.2", NOW, deps())]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.deepEqual(executed, ["deactivate"]);
    assert.equal(rows[0]!.status, "approved");
    assert.ok(rows[0]!.executedAt);
    assert.equal(rows[0]!.decidedIp, "1.1.1.1");
    assert.ok(notes.some((n) => n.recipientUserId === IT.id), "the requester is told");
  });

  test("a link works once: a second use gets the 'already answered' message", async () => {
    await ask("deactivate");
    const token = tokenFromMail();
    await decide(token, "approve", "1.1.1.1", NOW, deps());
    await assert.rejects(() => decide(token, "approve", "1.1.1.1", NOW, deps()), (e: AppError) => e.statusCode === 410 && e.code === "APPROVAL_LINK_USED");
    assert.deepEqual(executed, ["deactivate"]);
  });

  test("decline changes nothing and tells the requester", async () => {
    await ask("delete");
    const token = tokenFromMail();
    const result = await decide(token, "decline", "1.1.1.1", NOW, deps());
    assert.equal(result.applied, false);
    assert.equal(rows[0]!.status, "declined");
    assert.deepEqual(executed, []);
    assert.ok(notes.some((n) => n.recipientUserId === IT.id));
  });

  test("an expired link changes nothing and is recorded as expired", async () => {
    await ask("deactivate");
    const token = tokenFromMail();
    await assert.rejects(() => decide(token, "approve", "1.1.1.1", minutes(61), deps()), (e: AppError) => e.statusCode === 410 && e.code === "APPROVAL_LINK_EXPIRED");
    assert.equal(rows[0]!.status, "expired");
    assert.deepEqual(executed, []);
    assert.ok(audits.some((a) => a.action === "expired"));
  });

  test("a malformed or unknown token is a plain 404 and touches nothing", async () => {
    await ask("deactivate");
    for (const bad of ["nope", "a".repeat(43)]) {
      await assert.rejects(() => decide(bad, "approve", "1.1.1.1", NOW, deps()), (e: AppError) => e.statusCode === 404);
    }
    assert.equal(rows[0]!.status, "pending");
  });

  test("if the approved change can no longer be applied, the Owner is told and the failure is audited", async () => {
    await ask("deactivate");
    executorFails = true;
    const result = await decide(tokenFromMail(), "approve", "1.1.1.1", NOW, deps());
    assert.equal(result.applied, false);
    assert.match(result.message, /could not be applied/);
    assert.equal(rows[0]!.executedAt, null);
    assert.ok(audits.some((a) => a.action === "execution_failed"));
  });

  test("an approved email change also notifies the old address", async () => {
    await ask("change_identity", { email: "new@example.com", from: { name: OWNER.name, email: OWNER.email } });
    await decide(tokenFromMail(), "approve", "1.1.1.1", NOW, deps());
    assert.equal(mails.at(-1)!.to, OWNER.email);
    assert.match(mails.at(-1)!.subject, /email was changed/);
  });

  test("every step is audited without the token", async () => {
    await ask("deactivate");
    const token = tokenFromMail();
    await decide(token, "approve", "1.1.1.1", NOW, deps());
    const seen = audits.map((a) => a.action);
    for (const step of ["requested", "emailed", "approved", "executed"]) assert.ok(seen.includes(step), step);
    assert.equal(JSON.stringify(audits).includes(token), false);
  });
});
