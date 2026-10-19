import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool }    from 'pg';
import * as schema from "./schema/index.js";
import { env }     from "../config/env.js";

// One pool per process, created when this module is first imported. On Vercel
// each warm function instance reuses it across invocations; a cold start opens
// connections lazily, so nothing is paid until the first query.
//
// The pool is deliberately small: on a serverless platform every instance has
// its own pool, so `instances × max` is what the database actually sees. The
// defaults here suit one Neon pooled endpoint; raise DB_POOL_MAX for a
// long-lived host. Idle clients are released quickly so a quiet instance does
// not hold database connections open.
const poolMax = Math.max(1, parseInt(process.env.DB_POOL_MAX ?? "5", 10) || 5);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  // Lets a finished script (seeds, tests) exit without waiting on idle clients.
  allowExitOnIdle: true,
});

// An idle client erroring (Neon closing a suspended connection) must not crash
// the process; the pool discards the client and opens a new one on demand.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
