// Starts the API against the QA database (and nothing else). Use this for UI/API runs: `npm run serve` in qa/.
import { spawn } from "node:child_process";
import { guardOrExit } from "../guard.js";
import { API_DIR, qaChildEnv } from "./env.js";

const cfg = guardOrExit();
console.log(`Starting API for QA on ${cfg.apiUrl} -> database ${cfg.dbHost}/${cfg.dbName}`);
const child = spawn("npx", ["tsx", "src/main.ts"], { cwd: API_DIR, env: qaChildEnv(cfg), stdio: "inherit", detached: true });
const stop = () => { try { process.kill(-child.pid!, "SIGTERM"); } catch { /* gone */ } };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (c) => process.exit(c ?? 0));
