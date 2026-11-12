// Read-only smoke test of a running API: is it up, can someone sign in, do the first pages load.
// Changes no data. Used by CI against the freshly built server and by the "Live smoke test" workflow
// against the deployed one.
//
//   SMOKE_BASE_URL=https://<api host>/api SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/ops/smoke.mjs
//
// Exit code 0 = every check passed, 1 = something failed (the failing check is printed).
const BASE = (process.env.SMOKE_BASE_URL ?? "").replace(/\/$/, "");
const { SMOKE_EMAIL: email, SMOKE_PASSWORD: password } = process.env;
if (!BASE || !email || !password) {
  console.error("Set SMOKE_BASE_URL (ending in /api), SMOKE_EMAIL and SMOKE_PASSWORD.");
  process.exit(1);
}
const SLOW_MS = 10_000;

const call = async (path, init = {}) => {
  const started = Date.now();
  const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(30_000) });
  return { status: res.status, ms: Date.now() - started, body: await res.json().catch(() => null) };
};

const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exit(1);
};

// A free host and database sleep when idle, so the first answer may take a minute: retry before failing.
let ready;
for (let attempt = 1; attempt <= 8; attempt++) {
  ready = await call("/health/ready").catch((err) => ({ status: 0, ms: 0, body: String(err) }));
  if (ready.status === 200) break;
  console.log(`waiting for the API and database (attempt ${attempt}, status ${ready.status})`);
  await new Promise((r) => setTimeout(r, 10_000));
}
if (ready.status !== 200) fail(`/health/ready answered ${ready.status}: the API or its database is down`);
console.log("ok    /health/ready");

const login = await call("/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const token = login.body?.data?.token ?? login.body?.token;
if (login.status !== 200 || !token) fail(`sign-in answered ${login.status} ${JSON.stringify(login.body)?.slice(0, 200)}`);
console.log(`ok    sign-in (${login.ms} ms)`);

// Pages every role opens first. A 5xx here usually means the database is behind the code (a migration not applied).
for (const path of ["/dashboard/summary", "/notifications", "/projects?page=1&pageSize=5"]) {
  const res = await call(path, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) fail(`GET ${path} answered ${res.status} ${JSON.stringify(res.body)?.slice(0, 200)}`);
  if (res.ms > SLOW_MS) fail(`GET ${path} took ${res.ms} ms (limit ${SLOW_MS} ms)`);
  console.log(`ok    GET ${path} (${res.ms} ms)`);
}
console.log("Smoke test passed.");
