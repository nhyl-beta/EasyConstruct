import app from "./app.js";
import { env } from "./core/config/env.js";
import { startScheduledJobs } from "./core/jobs/scheduler.js";
import { startOverdueSweeper } from "./modules/design/index.js";

app.listen(env.PORT, () => {
  startOverdueSweeper();
  startScheduledJobs();
  console.log(`✅ Server running → http://localhost:${env.PORT}`);
});
