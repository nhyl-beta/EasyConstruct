import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

import { assertDemoApi, assertDemoDatabase } from "./demo-guard.js";

const KEYS = ["DATABASE_URL", "ALLOW_DEMO_RESET", "DEMO_RESET_ALLOWED_HOSTS"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const set = (env: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
};
const refused = (fn: () => unknown, text: string) =>
  assert.throws(fn, (e: unknown) => e instanceof Error && e.message.startsWith("REFUSED") && e.message.includes(text));

describe("assertDemoDatabase", () => {
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("refuses without ALLOW_DEMO_RESET=true", () => {
    set({ DATABASE_URL: "postgres://u:p@localhost:5432/app", ALLOW_DEMO_RESET: "yes" });
    refused(assertDemoDatabase, "ALLOW_DEMO_RESET");
  });

  test("allows a local host", () => {
    set({ DATABASE_URL: "postgres://u:p@127.0.0.1:5432/app", ALLOW_DEMO_RESET: "true" });
    assert.deepEqual(assertDemoDatabase(), { host: "127.0.0.1", db: "app" });
  });

  test("refuses a remote host that is not allow-listed, and allows one that is", () => {
    set({ DATABASE_URL: "postgres://u:p@ep-parent.neon.tech/neondb", ALLOW_DEMO_RESET: "true", DEMO_RESET_ALLOWED_HOSTS: "ep-staging.neon.tech" });
    refused(assertDemoDatabase, "ep-parent.neon.tech");
    set({ DATABASE_URL: "postgres://u:p@ep-staging.neon.tech/neondb", ALLOW_DEMO_RESET: "true", DEMO_RESET_ALLOWED_HOSTS: " other.host , ep-staging.neon.tech" });
    assert.equal(assertDemoDatabase().host, "ep-staging.neon.tech");
  });

  test("never echoes the credentials", () => {
    set({ DATABASE_URL: "postgres://user:s3cret@ep-parent.neon.tech/neondb", ALLOW_DEMO_RESET: "true" });
    assert.throws(assertDemoDatabase, (e: unknown) => e instanceof Error && !e.message.includes("s3cret"));
  });
});

describe("assertDemoApi", () => {
  test("allows only this machine on the demo port", () => {
    assert.doesNotThrow(() => assertDemoApi("http://localhost:8123/api"));
    assert.doesNotThrow(() => assertDemoApi("http://127.0.0.1:8123/api"));
  });
  test("refuses the default dev port and any remote host", () => {
    refused(() => assertDemoApi("http://localhost:8000/api"), "8123");
    refused(() => assertDemoApi("https://easyconstruct-server.vercel.app/api"), "8123");
  });
});
