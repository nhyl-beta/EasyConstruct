import app from "../src/app.js";
import { env } from "./config/env.js";
import { startOverdueSweeper } from "./design-requests/scheduler.js";
import { startScheduledJobs } from "./jobs/scheduler.js";

app.listen(env.PORT, () => {
  startOverdueSweeper();
  startScheduledJobs();
  console.log(`✅ Server running → http://localhost:${env.PORT}`);
});