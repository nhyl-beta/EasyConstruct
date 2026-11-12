import { createRealtime } from "@neon/realtime/server";
import { drizzleAdapter } from "@neon/realtime-drizzle";
import { env } from "../config/env.js";

// Neon Realtime listens on ONE branch's endpoint. If DATABASE_URL is a different branch, a live
// query would watch a database the app never writes to and stay silent. So compare the endpoint
// ids ("ep-icy-meadow-xxxx") and switch Realtime off on a mismatch instead of failing quietly.
const endpointId = (host: string) => (host.split(".")[0] ?? "").replace(/-pooler$/, "");

function setup() {
  const { NEON_REALTIME_URL: url, NEON_REALTIME_SECRET: secret } = env;
  if (!url || !secret) return { rt: null, reason: "NEON_REALTIME_URL / NEON_REALTIME_SECRET not set" };
  const db = new URL(env.DATABASE_URL);
  const rtHost = new URL(url).host;
  if (endpointId(rtHost) !== endpointId(db.host)) {
    return { rt: null, reason: `DATABASE_URL points at ${endpointId(db.host)} but Realtime is on ${endpointId(rtHost)}` };
  }
  return { rt: createRealtime({ secret, db: db.pathname.slice(1), adapter: drizzleAdapter() }), reason: "" };
}

const { rt, reason } = setup();
if (!rt && env.NEON_REALTIME_URL) console.warn(`[realtime] disabled: ${reason}`);

export const realtime = rt;
