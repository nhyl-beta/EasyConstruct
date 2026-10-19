import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const root = path.dirname(fileURLToPath(import.meta.url));
const children = [
  spawn(npm, ["run", "dev"], {
    cwd: path.join(root, "..", "apps", "web"),
    stdio: "inherit",
    shell: true,
  }),
  spawn(npm, ["run", "dev"], {
    cwd: path.join(root, "..", "apps", "api"),
    stdio: "inherit",
    shell: true,
  }),
];

function stop() {
  for (const child of children) child.kill();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}
