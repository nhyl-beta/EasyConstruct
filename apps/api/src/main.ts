import app from "./app.js";
import { env } from "./core/config/env.js";
import { startScheduledJobs } from "./core/jobs/scheduler.js";
import { startOverdueSweeper } from "./design-requests/scheduler.js";

app.listen(env.PORT, () => {
  startOverdueSweeper();
  startScheduledJobs();
  console.log(`✅ Server running → http://localhost:${env.PORT}`);
});
