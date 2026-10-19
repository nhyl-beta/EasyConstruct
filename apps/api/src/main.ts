import app from "./app.js";
import { env } from "./core/config/env.js";
import { startScheduledJobs } from "./core/jobs/scheduler.js";
import { startOverdueSweeper } from "./modules/design/index.js";
import { runSignalScan } from "./modules/insights/index.js";
import { runAttendanceCheck } from "./modules/workforce/index.js";
import { runOverdueJob } from "./modules/platform/index.js";

app.listen(env.PORT, () => {
  startOverdueSweeper();
  startScheduledJobs({ runSignalScan, runAttendanceCheck, runOverdueJob });
  console.log(`✅ Server running → http://localhost:${env.PORT}`);
});
