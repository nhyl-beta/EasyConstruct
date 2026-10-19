import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import {
  ALL_DOMAIN,
  MemoryCacheStore,
  bumpVersions,
  buildKey,
  cached,
  createStoreFromEnv,
  setCacheStore,
  stableStringify,
  versionKey,
  type CacheStore,
} from "./index.js";
import { cacheInvalidation, domainsForWrite, CACHE_DOMAINS } from "./invalidate.js";
import { visibilityScope } from "./scope.js";
import { logger } from "../middleware/logger.js";

let store: MemoryCacheStore;
beforeEach(() => {
  store = new MemoryCacheStore();
  setCacheStore(store);
});
afterEach(() => setCacheStore(undefined));

const counter = <T>(value: T) => {
  let calls = 0;
  return { load: async () => (calls++, value), calls: () => calls };
};

describe("cached()", () => {
  test("a miss calls the loader once and a hit does not call it again", async () => {
    const loader = counter({ rows: [1, 2, 3] });
    assert.deepEqual(await cached("projects", "all", 60, loader.load), { rows: [1, 2, 3] });
    assert.deepEqual(await cached("projects", "all", 60, loader.load), { rows: [1, 2, 3] });
    assert.deepEqual(await cached("projects", "all", 60, loader.load), { rows: [1, 2, 3] });
    assert.equal(loader.calls(), 1);
  });

  test("a different query or scope is a different entry", async () => {
    const a = counter("a");
    const b = counter("b");
    await cached("projects", "all", 60, a.load, { query: { page: 1 } });
    await cached("projects", "all", 60, b.load, { query: { page: 2 } });
    await cached("projects", "role:admin", 60, b.load, { query: { page: 1 } });
    assert.equal(a.calls() + b.calls(), 3);
  });

  test("the same query in a different key order hits the same entry", async () => {
    const l = counter(1);
    await cached("projects", "all", 60, l.load, { query: { a: "1", b: ["x", "y"] } });
    await cached("projects", "all", 60, l.load, { query: { b: ["x", "y"], a: "1" } });
    assert.equal(l.calls(), 1);
  });

  test("keys follow ec:v1:<domain>:<scope>:<hash> and the version is read from ec:v1:<domain>:ver", async () => {
    const key = buildKey("projects", "user:5", { q: 1 }, ["0"]);
    assert.match(key, /^ec:v1:projects:user:5:[0-9a-f]{20}$/);
    assert.equal(versionKey("projects"), "ec:v1:projects:ver");
    assert.notEqual(key, buildKey("projects", "user:5", { q: 1 }, ["1"]), "a new version changes every key");
  });

  test("a write bumps the version, so the next read reloads", async () => {
    const l = counter("v");
    await cached("employees", "all", 60, l.load);
    await cached("employees", "all", 60, l.load);
    assert.equal(l.calls(), 1);
    await bumpVersions("employees");
    await cached("employees", "all", 60, l.load);
    assert.equal(l.calls(), 2);
    await cached("employees", "all", 60, l.load);
    assert.equal(l.calls(), 2);
  });

  test("a bump of another domain leaves this one alone; deps and the all-domain invalidate", async () => {
    const own = counter("own");
    const withDeps = counter("deps");
    const dashboard = counter("dash");
    const warm = async () => {
      await cached("employees", "all", 60, own.load);
      await cached("reports", "all", 60, withDeps.load, { deps: ["employees", "attendance"] });
      await cached("dashboard", "role:admin", 60, dashboard.load, { deps: [ALL_DOMAIN] });
    };
    await warm();
    // bumpVersions always bumps the all-domain, so use the store directly to test one domain
    await store.incr(versionKey("attendance"));
    await warm();
    assert.equal(own.calls(), 1, "employees entry untouched by an attendance bump");
    assert.equal(withDeps.calls(), 2, "reports depends on attendance");
    assert.equal(dashboard.calls(), 1, "dashboard depends on the all-domain only");
    await bumpVersions("attendance");
    await warm();
    assert.equal(dashboard.calls(), 2, "any write bumps the all-domain");
  });

  test("entries expire after their TTL", async () => {
    let now = 1_000_000;
    setCacheStore(new MemoryCacheStore(100, () => now));
    const l = counter("x");
    await cached("projects", "all", 30, l.load);
    now += 29_000;
    await cached("projects", "all", 30, l.load);
    assert.equal(l.calls(), 1);
    now += 2_000;
    await cached("projects", "all", 30, l.load);
    assert.equal(l.calls(), 2);
  });

  test("a loader error is rethrown and nothing is cached for it", async () => {
    let attempts = 0;
    const flaky = async () => {
      attempts++;
      if (attempts === 1) throw new Error("db down");
      return "ok";
    };
    await assert.rejects(() => cached("projects", "all", 60, flaky), /db down/);
    assert.equal(await cached("projects", "all", 60, flaky), "ok");
    assert.equal(await cached("projects", "all", 60, flaky), "ok");
    assert.equal(attempts, 2);
  });

  test("a value of undefined is not stored", async () => {
    const l = counter(undefined);
    await cached("projects", "all", 60, l.load);
    await cached("projects", "all", 60, l.load);
    assert.equal(l.calls(), 2);
  });
});

describe("a failing store never fails the request", () => {
  const broken = (what: "get" | "set" | "incr" | "all"): CacheStore => ({
    kind: "redis",
    get: async () => {
      if (what === "get" || what === "all") throw new Error("redis timeout");
      return null;
    },
    set: async () => {
      if (what === "set" || what === "all") throw new Error("redis timeout");
    },
    incr: async () => {
      if (what === "incr" || what === "all") throw new Error("redis timeout");
      return 1;
    },
  });

  test("read failure falls through to the loader", async () => {
    setCacheStore(broken("get"));
    const l = counter("fresh");
    assert.equal(await cached("projects", "all", 60, l.load), "fresh");
    assert.equal(l.calls(), 1);
  });

  test("write failure still returns the loaded value", async () => {
    setCacheStore(broken("set"));
    assert.equal(await cached("projects", "all", 60, async () => "fresh"), "fresh");
  });

  test("invalidation failure does not throw", async () => {
    setCacheStore(broken("incr"));
    await assert.doesNotReject(() => bumpVersions("projects"));
  });

  test("garbage in the store is treated as a miss", async () => {
    const l = counter("fresh");
    await cached("projects", "all", 60, l.load);
    // corrupt every stored value
    const entries = (store as unknown as { entries: Map<string, { value: string }> }).entries;
    for (const entry of entries.values()) entry.value = "{not json";
    assert.equal(await cached("projects", "all", 60, l.load), "fresh");
    assert.equal(l.calls(), 2);
  });
});

describe("scopes: one role's data is never served to another", () => {
  const admin = { id: 1, role: "admin" };
  const admin2 = { id: 2, role: "admin" };
  const owner = { id: 3, role: "owner" };
  const pmA = { id: 10, role: "project-manager" };
  const pmB = { id: 11, role: "project-manager" };
  const engineer = { id: 20, role: "engineer" };

  test("org-wide roles share a key within the role only", () => {
    assert.equal(visibilityScope(admin), visibilityScope(admin2));
    assert.notEqual(visibilityScope(admin), visibilityScope(owner));
  });

  test("a PM and every staffed role get a key of their own", () => {
    assert.notEqual(visibilityScope(pmA), visibilityScope(pmB));
    assert.notEqual(visibilityScope(pmA), visibilityScope(admin));
    for (const role of ["engineer", "architect", "consultant", "site-personnel"]) {
      assert.equal(visibilityScope({ id: 7, role }), "user:7");
      assert.notEqual(visibilityScope({ id: 7, role }), visibilityScope({ id: 8, role }));
    }
    assert.notEqual(visibilityScope(engineer), visibilityScope({ id: 21, role: "engineer" }));
  });

  test("no caller means no shared scope", () => {
    assert.equal(visibilityScope(undefined), null);
  });

  test("two scopes holding different data never see each other's", async () => {
    const pm = await cached("projects", visibilityScope(pmA)!, 60, async () => ["PM A project"]);
    const other = await cached("projects", visibilityScope(pmB)!, 60, async () => ["PM B project"]);
    const adm = await cached("projects", visibilityScope(admin)!, 60, async () => ["every project"]);
    assert.deepEqual(pm, ["PM A project"]);
    assert.deepEqual(other, ["PM B project"]);
    assert.deepEqual(adm, ["every project"]);
    // and a second read of each still returns its own
    assert.deepEqual(await cached("projects", visibilityScope(pmA)!, 60, async () => ["WRONG"]), ["PM A project"]);
    assert.deepEqual(await cached("projects", visibilityScope(admin2)!, 60, async () => ["WRONG"]), ["every project"]);
  });
});

describe("environment selection", () => {
  test("no Redis variables: the in-memory fallback", () => {
    assert.equal(createStoreFromEnv({}).kind, "memory");
    assert.equal(createStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" }).kind, "memory");
    assert.equal(createStoreFromEnv({ UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "memory");
  });
  test("both variables: Redis", () => {
    assert.equal(
      createStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }).kind,
      "redis",
    );
  });
  test("the memory store is bounded", async () => {
    const small = new MemoryCacheStore(3);
    for (let i = 0; i < 10; i++) await small.set(`k${i}`, "v", 60);
    assert.equal(small.size, 3);
  });
});

describe("write invalidation middleware", () => {
  const app = () => {
    const a = express();
    a.use(logger);
    a.use(cacheInvalidation);
    let rows = ["one"];
    let loads = 0;
    a.get("/api/employees", async (_req, res) => {
      res.json(await cached("employees", "all", 60, async () => (loads++, [...rows])));
    });
    a.get("/api/projects", async (_req, res) => {
      res.json(await cached("projects", "all", 60, async () => (loads++, [...rows])));
    });
    a.post("/api/employees", (_req, res) => {
      rows = [...rows, "two"];
      res.status(201).json({ ok: true });
    });
    a.post("/api/tasks", (_req, res) => {
      rows = [...rows, "task"];
      res.status(201).json({ ok: true });
    });
    a.post("/api/rejected", (_req, res) => {
      res.status(422).json({ ok: false });
    });
    return { a, loads: () => loads };
  };
  const serve = async <T>(fn: (base: string, probe: ReturnType<typeof app>) => Promise<T>) => {
    const probe = app();
    const server = probe.a.listen(0);
    try {
      return await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, probe);
    } finally {
      server.close();
    }
  };

  test("MISS then HIT on reads; the next read after a write is a MISS with the new data", async () => {
    await serve(async (base) => {
      const first = await fetch(`${base}/api/employees`);
      assert.equal(first.headers.get("x-cache"), "MISS");
      assert.deepEqual(await first.json(), ["one"]);
      const second = await fetch(`${base}/api/employees`);
      assert.equal(second.headers.get("x-cache"), "HIT");

      await fetch(`${base}/api/employees`, { method: "POST" });
      const after = await fetch(`${base}/api/employees`);
      assert.equal(after.headers.get("x-cache"), "MISS", "the response to the write was only sent after the bump");
      assert.deepEqual(await after.json(), ["one", "two"]);
    });
  });

  test("an unlisted write (a task) invalidates every cached domain", async () => {
    await serve(async (base) => {
      await fetch(`${base}/api/projects`);
      assert.equal((await fetch(`${base}/api/projects`)).headers.get("x-cache"), "HIT");
      await fetch(`${base}/api/tasks`, { method: "POST" });
      assert.equal((await fetch(`${base}/api/projects`)).headers.get("x-cache"), "MISS");
    });
  });

  test("an employees write does not invalidate the projects domain", async () => {
    await serve(async (base) => {
      await fetch(`${base}/api/projects`);
      await fetch(`${base}/api/employees`, { method: "POST" });
      assert.equal((await fetch(`${base}/api/projects`)).headers.get("x-cache"), "HIT");
    });
  });

  test("a write the server refused (4xx) changes nothing", async () => {
    await serve(async (base) => {
      await fetch(`${base}/api/projects`);
      await fetch(`${base}/api/rejected`, { method: "POST" });
      assert.equal((await fetch(`${base}/api/projects`)).headers.get("x-cache"), "HIT");
    });
  });

  test("path rules", () => {
    assert.deepEqual(domainsForWrite("/api/attendance"), ["attendance"]);
    assert.deepEqual(domainsForWrite("/api/attendance/12"), ["attendance"]);
    assert.deepEqual(domainsForWrite("/api/hr/employees/3"), ["employees"]);
    assert.deepEqual(domainsForWrite("/api/roles/1"), ["config"]);
    assert.deepEqual(domainsForWrite("/api/tasks/5/status"), [...CACHE_DOMAINS]);
    assert.deepEqual(domainsForWrite("/api/attendance-extra"), [...CACHE_DOMAINS], "prefix match is whole-segment");
    assert.deepEqual(domainsForWrite("/api/projects/1/lifecycle/advance"), [...CACHE_DOMAINS]);
  });
});

test("stableStringify sorts keys and skips undefined", () => {
  assert.equal(stableStringify({ b: 1, a: undefined, c: [2, { z: 1, y: 2 }] }), '{"b":1,"c":[2,{"y":2,"z":1}]}');
});
