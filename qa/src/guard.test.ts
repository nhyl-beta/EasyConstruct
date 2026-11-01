import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qaEnv, assertQaEnvironment, assertResetAllowed, checkQaEnvironment, collectOtherDatabaseUrls, GuardError } from "./guard.js";

const LOCAL = "postgres://qa:qa@localhost:5432/easyconstruct_qa";
const emptyRoot = () => mkdtempSync(join(tmpdir(), "qa-guard-"));

test("a valid local URL is allowed and defaults are local", () => {
  const r = checkQaEnvironment({ QA_DATABASE_URL: LOCAL });
  assert.deepEqual(r.problems, []);
  assert.equal(r.config!.baseUrl, "http://localhost:5173");
  assert.match(r.config!.apiUrl, /^http:\/\/localhost:\d+\/api$/);
});

test("missing QA_DATABASE_URL is blocked, even when DATABASE_URL is set", () => {
  const r = checkQaEnvironment({ DATABASE_URL: LOCAL });
  assert.match(r.problems.join(), /QA_DATABASE_URL is not set/);
  assert.throws(() => assertQaEnvironment({ DATABASE_URL: LOCAL }, emptyRoot()), GuardError);
});

test("the production Neon host is blocked (plain, pooled, any case)", () => {
  for (const u of [
    "postgres://u:p@ep-fancy-king-aofmiicn.c-2.ap-southeast-1.aws.neon.tech/neondb",
    "postgres://u:p@EP-FANCY-KING-AOFMIICN-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  ]) {
    assert.match(checkQaEnvironment({ QA_DATABASE_URL: u }).problems.join(), /production host/);
  }
});

test("easyconstruct.online is blocked in QA_BASE_URL and QA_API_URL", () => {
  assert.match(checkQaEnvironment({ QA_DATABASE_URL: LOCAL, QA_BASE_URL: "https://www.easyconstruct.online" }).problems.join(), /QA_BASE_URL/);
  assert.match(checkQaEnvironment({ QA_DATABASE_URL: LOCAL, QA_API_URL: "https://api.EasyConstruct.online/api" }).problems.join(), /QA_API_URL/);
});

test("a non-postgres or malformed database URL is blocked", () => {
  assert.ok(checkQaEnvironment({ QA_DATABASE_URL: "mysql://x/y" }).problems.length > 0);
  assert.ok(checkQaEnvironment({ QA_DATABASE_URL: "not a url" }).problems.length > 0);
});

test("the same remote host as a .env DATABASE_URL is blocked", () => {
  const root = emptyRoot();
  writeFileSync(join(root, ".env"), 'DATABASE_URL="postgres://u:p@ep-shared-host.neon.tech/main"\n');
  const r = checkQaEnvironment({ QA_DATABASE_URL: "postgres://u:p@ep-shared-host.neon.tech/other" }, collectOtherDatabaseUrls(root, {}));
  assert.match(r.problems.join(), /same database as DATABASE_URL/);
});

test("same DATABASE_URL in the shell environment is blocked; a different local database is allowed", () => {
  const root = emptyRoot();
  const blocked = checkQaEnvironment({ QA_DATABASE_URL: LOCAL }, collectOtherDatabaseUrls(root, { DATABASE_URL: LOCAL }));
  assert.match(blocked.problems.join(), /environment variable/);
  const ok = checkQaEnvironment({ QA_DATABASE_URL: LOCAL }, collectOtherDatabaseUrls(root, { DATABASE_URL: "postgres://x@localhost:5432/dev_db" }));
  assert.deepEqual(ok.problems, []);
});

test("*.example env files are ignored", () => {
  const root = emptyRoot();
  writeFileSync(join(root, ".env.example"), "DATABASE_URL=postgres://user:password@host:5432/dbname\n");
  assert.deepEqual(collectOtherDatabaseUrls(root, {}), []);
});

test("reset needs a local host or a qa/test database name", () => {
  const cfg = (u: string) => checkQaEnvironment({ QA_DATABASE_URL: u }).config!;
  assert.doesNotThrow(() => assertResetAllowed(cfg(LOCAL), {}));
  assert.doesNotThrow(() => assertResetAllowed(cfg("postgres://u:p@ep-x.neon.tech/ec_qa"), {}));
  assert.throws(() => assertResetAllowed(cfg("postgres://u:p@ep-x.neon.tech/neondb"), {}), GuardError);
});

test("qa/.env.qa supplies QA_* values; the real environment wins; other keys are ignored", () => {
  const root = emptyRoot();
  mkdirSync(join(root, "qa"));
  writeFileSync(join(root, "qa", ".env.qa"), `QA_DATABASE_URL="${LOCAL}"\nQA_BASE_URL=http://localhost:5999\nDATABASE_URL=postgres://prod/should-be-ignored\n`);
  const env = qaEnv(root, { QA_BASE_URL: "http://localhost:5173" });
  assert.equal(env.QA_DATABASE_URL, LOCAL);
  assert.equal(env.QA_BASE_URL, "http://localhost:5173");
  assert.equal(env.DATABASE_URL, undefined);
});
