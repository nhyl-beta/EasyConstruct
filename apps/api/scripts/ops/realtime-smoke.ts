// Proves Neon Realtime end to end: subscribes to a sealed inbox query, inserts a notification, waits for
// the subscriber to see it, then deletes the row. Prints no secrets.  Run: npm run realtime:smoke --workspace=@easyconstruct/api
import { createRealtimeClient } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";
import { eq } from "drizzle-orm";
import { env } from "../../src/core/config/env.js";
import { db, pool } from "../../src/core/db/connection.js";
import { notifications } from "../../src/core/db/schema/index.js";
import { sealInbox } from "../../src/modules/platform/notifications/live.js";

const role = "it-designer";
const sealed = await sealInbox({ userId: -1, role });
if (!sealed || !env.NEON_REALTIME_URL) {
  console.error("Realtime is off or points at a different database than DATABASE_URL (see the [realtime] warning above).");
  process.exit(1);
}
const client = createRealtimeClient({ url: env.NEON_REALTIME_URL, parsers: drizzleParsers });
const sub = client.subscribe(sealed);
let seen = false;
let rowId = -1;
sub.onChange((snap) => { if (snap.data?.some((r: { id: number }) => r.id === rowId)) seen = true; });
await new Promise((r) => setTimeout(r, 3000)); // let the subscription connect
const [row] = await db.insert(notifications).values({ title: "Realtime smoke test", type: "info", role }).returning({ id: notifications.id });
rowId = row!.id;
console.log(`inserted notification ${rowId}`);
for (let i = 0; i < 30 && !seen; i++) await new Promise((r) => setTimeout(r, 500));
console.log(seen ? `PASS: subscriber received row ${rowId}` : "FAIL: subscriber did not see the row in 15s");
await db.delete(notifications).where(eq(notifications.id, rowId));
await pool.end();
client.close?.();
process.exit(seen ? 0 : 1);
