import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hostOf, parseArgs, runRemoval, type Queryable } from "./remove-claims-data.js";

/** A fake database: records every statement and answers the count queries from its state. */
function fakeDb(state: { claims: Record<string, number>; claimExpenses: number }, opts: { failOn?: RegExp; keepClaims?: boolean } = {}) {
  const statements: string[] = [];
  let snapshot: typeof state | null = null;
  const db: Queryable = {
    async query(text: string) {
      statements.push(text);
      if (opts.failOn?.test(text)) throw new Error("boom");
      if (text === "BEGIN") snapshot = JSON.parse(JSON.stringify(state));
      if (text === "ROLLBACK" && snapshot) {
        state.claims = snapshot.claims;
        state.claimExpenses = snapshot.claimExpenses;
      }
      if (/^DELETE FROM reimbursements/.test(text) && !opts.keepClaims) state.claims = {};
      if (/^DELETE FROM expenses/.test(text)) state.claimExpenses = 0;
      if (/FROM reimbursements GROUP BY status/.test(text)) {
        return { rows: Object.entries(state.claims).map(([status, count]) => ({ status, count })), rowCount: null };
      }
      if (/FROM expenses WHERE source_type = 'reimbursement'/.test(text) && text.startsWith("SELECT")) {
        return { rows: [{ count: state.claimExpenses }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { db, statements };
}

const quiet = () => {};
const writes = (s: string[]) => s.filter((x) => /^(DELETE|UPDATE|INSERT|DROP|ALTER|TRUNCATE|BEGIN|COMMIT)/i.test(x));

describe("argument handling", () => {
  test("no arguments is a dry run", () => {
    assert.deepEqual(parseArgs([]), { apply: false, withExpenses: false });
  });
  test("--apply writes; --with-expenses is separate and off by default", () => {
    assert.deepEqual(parseArgs(["--apply"]), { apply: true, withExpenses: false });
    assert.deepEqual(parseArgs(["--apply", "--with-expenses"]), { apply: true, withExpenses: true });
    assert.deepEqual(parseArgs(["--with-expenses"]), { apply: false, withExpenses: true });
  });
  test("an unknown flag is an error, so a typo never means apply", () => {
    assert.throws(() => parseArgs(["--aply"]), /Unknown option/);
    assert.throws(() => parseArgs(["--apply", "--force"]), /Unknown option/);
  });
  test("the host name comes from DATABASE_URL, and a missing URL is an error", () => {
    assert.equal(hostOf("postgresql://u:p@ep-x.neon.tech/db?sslmode=require"), "ep-x.neon.tech");
    assert.throws(() => hostOf(undefined), /DATABASE_URL/);
  });
});

describe("dry run (the default)", () => {
  test("only reads: no delete, no transaction", async () => {
    const { db, statements } = fakeDb({ claims: { "pending-pm": 1, paid: 2 }, claimExpenses: 1 });
    const r = await runRemoval(db, parseArgs([]), quiet);
    assert.equal(r.applied, false);
    assert.equal(r.before.claimsTotal, 3);
    assert.equal(r.before.claimExpenses, 1);
    assert.deepEqual(writes(statements), []);
  });
  test("prints the counts by status and the claim expense count", async () => {
    const { db } = fakeDb({ claims: { approved: 1, "pending-finance": 2 }, claimExpenses: 4 });
    const lines: string[] = [];
    await runRemoval(db, parseArgs([]), (m) => lines.push(m));
    const out = lines.join("\n");
    assert.match(out, /approved: 1/);
    assert.match(out, /pending-finance: 2/);
    assert.match(out, /source_type = 'reimbursement': 4/);
    assert.match(out, /Nothing was changed/);
  });
  test("--with-expenses without --apply is still a dry run and prints the warning", async () => {
    const { db, statements } = fakeDb({ claims: { paid: 1 }, claimExpenses: 1 });
    const lines: string[] = [];
    await runRemoval(db, parseArgs(["--with-expenses"]), (m) => lines.push(m));
    assert.deepEqual(writes(statements), []);
    assert.match(lines.join("\n"), /WARNING/);
  });
});

describe("--apply", () => {
  test("deletes reimbursements in one transaction and leaves expenses alone by default", async () => {
    const state = { claims: { paid: 2, rejected: 1 }, claimExpenses: 2 };
    const { db, statements } = fakeDb(state);
    const r = await runRemoval(db, parseArgs(["--apply"]), quiet);
    assert.equal(r.applied, true);
    assert.equal(r.after?.claimsTotal, 0);
    assert.deepEqual(writes(statements), ["BEGIN", "DELETE FROM reimbursements", "COMMIT"]);
    assert.equal(state.claimExpenses, 2, "claim expenses are untouched without --with-expenses");
  });
  test("--with-expenses also deletes only the expenses with source_type 'reimbursement'", async () => {
    const state = { claims: { paid: 1 }, claimExpenses: 1 };
    const { db, statements } = fakeDb(state);
    const lines: string[] = [];
    await runRemoval(db, parseArgs(["--apply", "--with-expenses"]), (m) => lines.push(m));
    assert.deepEqual(writes(statements), ["BEGIN", "DELETE FROM reimbursements", "DELETE FROM expenses WHERE source_type = 'reimbursement'", "COMMIT"]);
    assert.match(lines.join("\n"), /WARNING/);
    assert.equal(state.claimExpenses, 0);
  });
  test("never issues DROP, ALTER or TRUNCATE", async () => {
    const { db, statements } = fakeDb({ claims: { paid: 1 }, claimExpenses: 1 });
    await runRemoval(db, parseArgs(["--apply", "--with-expenses"]), quiet);
    assert.equal(statements.some((s) => /\b(DROP|ALTER|TRUNCATE)\b/i.test(s)), false);
  });
  test("rolls back and does not commit when reimbursements is not empty afterwards", async () => {
    const state = { claims: { paid: 1 }, claimExpenses: 0 };
    const { db, statements } = fakeDb(state, { keepClaims: true });
    await assert.rejects(runRemoval(db, parseArgs(["--apply"]), quiet), /rolling back/);
    assert.ok(statements.includes("ROLLBACK"));
    assert.equal(statements.includes("COMMIT"), false);
    assert.deepEqual(state.claims, { paid: 1 });
  });
  test("rolls back on any error", async () => {
    const state = { claims: { paid: 1 }, claimExpenses: 0 };
    const { db, statements } = fakeDb(state, { failOn: /^DELETE FROM reimbursements/ });
    await assert.rejects(runRemoval(db, parseArgs(["--apply"]), quiet), /boom/);
    assert.ok(statements.includes("ROLLBACK"));
    assert.equal(statements.includes("COMMIT"), false);
  });
});
