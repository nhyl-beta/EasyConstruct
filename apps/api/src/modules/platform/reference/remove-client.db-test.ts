// Real-database test (npm run test:db): an unused client can be deleted; one on a project is kept.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { clients } from "../../../core/db/schema/reference.js";
import { projects } from "../../../core/db/schema/projects.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as service from "./service.js";

const tag = `ZZ-CLIENT-${Date.now().toString(36)}`;
const created: number[] = [];

after(async () => {
  await db.delete(projects).where(eq(projects.name, tag));
  for (const id of created) await db.delete(clients).where(eq(clients.id, id));
});

test("removeClient deletes an unused client and refuses one that is on a project", async () => {
  assertDemoDatabase();
  const free = await service.create("clients", { name: `${tag} free` }, { name: "t" });
  const used = await service.create("clients", { name: `${tag} used` }, { name: "t" });
  created.push(free.id, used.id);
  await db.insert(projects).values({ name: tag, code: tag, pm: "t", due: "2030-01-01", clientId: used.id });

  await service.removeClient(free.id);
  assert.equal((await service.list("clients", free.name)).length, 0);

  await assert.rejects(service.removeClient(used.id), (e: { code?: string }) => e.code === "CLIENT_IN_USE");
  await assert.rejects(service.removeClient(free.id), (e: { code?: string }) => e.code === "NOT_FOUND");
});
