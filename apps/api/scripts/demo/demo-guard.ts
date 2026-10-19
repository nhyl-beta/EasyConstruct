// apps/api/scripts/demo/demo-guard.ts
//
// The one guard every script that writes demo data calls before its first
// write (and the real-database tests, *.db-test.ts):
//   * assertDemoDatabase — prints the target host, then refuses unless
//     ALLOW_DEMO_RESET=true and the DATABASE_URL host is local or listed in
//     DEMO_RESET_ALLOWED_HOSTS;
//   * assertDemoApi — for seeds that write through the HTTP API: refuses any
//     base other than this machine on the dedicated demo port, so a dev server
//     started elsewhere (reading apps/api/.env's database) cannot receive the
//     writes. Start the API from the same shell with PORT=8123.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const DEMO_API_PORT = process.env.DEMO_API_PORT ?? "8123";

export function assertDemoEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("REFUSED: demo scripts cannot run when NODE_ENV=production.");
  }
}

assertDemoEnvironment();

export function assertDemoDatabase(): { host: string; db: string } {
  assertDemoEnvironment();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const u = new URL(url);
  const host = u.hostname;
  const db = u.pathname.replace(/^\//, "");
  console.log(`Target database: host=${host} db=${db}`);

  const allowed = (process.env.DEMO_RESET_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (process.env.ALLOW_DEMO_RESET !== "true") throw new Error("REFUSED: set ALLOW_DEMO_RESET=true to run this script.");
  if (!LOCAL_HOSTS.has(host) && !allowed.includes(host)) {
    throw new Error(`REFUSED: host ${host} is neither local nor listed in DEMO_RESET_ALLOWED_HOSTS.`);
  }
  return { host, db };
}

export function assertDemoApi(base: string): void {
  assertDemoEnvironment();
  const u = new URL(base);
  console.log(`Target API: ${u.origin}${u.pathname}`);
  if (!LOCAL_HOSTS.has(u.hostname) || u.port !== DEMO_API_PORT) {
    throw new Error(
      `REFUSED: SMOKE_BASE_URL must be http://localhost:${DEMO_API_PORT}/api, a server started from this shell with PORT=${DEMO_API_PORT}; got ${u.origin}.`,
    );
  }
}

/**
 * The checks upload files. If the API behind them has a Vercel Blob token (it loaded apps/api/.env),
 * those files go to the REAL Blob store, not the throwaway database's disk. Refuse unless the person
 * says it is intended (ALLOW_BLOB=true). Start the check API with DOTENV_CONFIG_PATH=.env.check.
 */
export async function assertNoRealBlobStore(base: string, token: string): Promise<void> {
  const res = await fetch(`${base}/uploads/config`, { headers: { Authorization: `Bearer ${token}` } });
  const mode = ((await res.json().catch(() => null)) as { data?: { mode?: string } } | null)?.data?.mode;
  if (mode === "blob" && process.env.ALLOW_BLOB !== "true") {
    throw new Error(
      "REFUSED: the API is configured for Vercel Blob (upload mode 'blob'), so these checks would write files to the real Blob store. " +
        "Restart the API without the token: set DOTENV_CONFIG_PATH=.env.check (see system-check/README.md), or set ALLOW_BLOB=true if that is intended.",
    );
  }
}

/** Stops a check that could not sign in as every role: its other results cannot be trusted. */
export function failIfLoginsFailed(failed: string[]): void {
  if (failed.length === 0) return;
  console.error(
    `\n✘ Cannot sign in as: ${failed.join(", ")}.\n` +
      "  Do not trust any result from this run. Usual cause: the sign-in limiter (40 per 15 minutes per address)\n" +
      "  or a role missing from the seed. Restart the API (system-check/start-api.ps1) and run again.",
  );
  process.exit(2);
}
