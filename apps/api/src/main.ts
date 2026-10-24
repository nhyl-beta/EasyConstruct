import app from "./app.js";
import { env } from "./core/config/env.js";
import { pool } from "./core/db/connection.js";
import { startScheduledJobs } from "./core/jobs/scheduler.js";
import { startOverdueSweeper } from "./modules/design/index.js";
import { runSignalScan } from "./modules/insights/index.js";
import { runAttendanceCheck } from "./modules/workforce/index.js";
import { runOverdueJob } from "./modules/platform/index.js";
import { closeAll as closeNotificationStreams } from "./modules/platform/notifications/stream.js";

const FORCE_EXIT_MS = 10_000;

const server = app.listen(env.PORT, () => {
  startOverdueSweeper();
  startScheduledJobs({ runSignalScan, runAttendanceCheck, runOverdueJob });
  console.log(`✅ Server running → http://localhost:${env.PORT}`);
});

// Longer than the proxy's idle timeout (Render / Cloudflare ~60s) so the proxy never reuses a socket we just closed.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received: closing`);
  const force = setTimeout(() => {
    console.error("[shutdown] did not finish in time; forcing exit");
    process.exit(1);
  }, FORCE_EXIT_MS);
  force.unref();

  // Stop accepting connections, end the long-lived notification streams (they would hold close() open
  // forever), then release the database pool and exit.
  server.close(() => {
    pool
      .end()
      .catch((err) => console.error("[shutdown] pool close failed", err))
      .finally(() => process.exit(0));
  });
  closeNotificationStreams();
  server.closeIdleConnections();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
