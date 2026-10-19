import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMIT, MAX_LIMIT, paginate, parsePageRequest, resolveMeta } from "./pagination.js";

describe("parsePageRequest", () => {
  test("nothing sent: not paged, defaults page 1 / limit 20", () => {
    const r = parsePageRequest({});
    assert.equal(r.requested, false);
    assert.equal(r.page, 1);
    assert.equal(r.limit, DEFAULT_LIMIT);
  });
  test("page or limit (or the older pageSize / perPage) asks for paging", () => {
    assert.equal(parsePageRequest({ page: "2" }).requested, true);
    assert.equal(parsePageRequest({ limit: "5" }).limit, 5);
    assert.equal(parsePageRequest({ pageSize: "7" }).limit, 7);
    assert.equal(parsePageRequest({ perPage: "9" }).limit, 9);
  });
  test("limit is capped at 100 and junk falls back to the defaults", () => {
    assert.equal(parsePageRequest({ limit: "100000" }).limit, MAX_LIMIT);
    assert.equal(parsePageRequest({ limit: "0" }).limit, DEFAULT_LIMIT);
    assert.equal(parsePageRequest({ limit: "abc", page: "-4" }).page, 1);
  });
  test("enforce pages even when the caller sent nothing", () => {
    assert.equal(parsePageRequest({}, { enforce: true }).requested, true);
  });
  test("sort must be on the whitelist; order defaults to the resource default", () => {
    const opts = { sortable: ["name", "createdAt"] as const, defaultOrder: "asc" as const };
    assert.equal(parsePageRequest({ page: "1", sort: "name" }, opts).sort, "name");
    assert.equal(parsePageRequest({ page: "1", sort: "name" }, opts).order, "asc");
    assert.equal(parsePageRequest({ page: "1", sort: "name", order: "DESC" }, opts).order, "desc");
    assert.throws(() => parsePageRequest({ page: "1", sort: "password; drop table" }, opts), /Cannot sort by/);
  });
  test("a sort on an unpaged request is ignored, not rejected (legacy callers)", () => {
    assert.equal(parsePageRequest({ sort: "anything" }, { sortable: ["name"] }).sort, undefined);
  });
});

describe("resolveMeta / paginate", () => {
  test("meta carries page, limit, total and the legacy pageSize / pages", () => {
    const { meta, offset } = resolveMeta({ page: 3, limit: 10 }, 25);
    assert.deepEqual(meta, { total: 25, page: 3, limit: 10, pageSize: 10, pages: 3 });
    assert.equal(offset, 20);
  });
  test("a page past the end snaps to the last page", () => {
    assert.equal(resolveMeta({ page: 99, limit: 10 }, 25).meta.page, 3);
    assert.deepEqual(resolveMeta({ page: 5, limit: 10 }, 0).meta, { total: 0, page: 1, limit: 10, pageSize: 10, pages: 1 });
  });
  test("paginate counts first, then fetches only the clamped window; empty skips the fetch", async () => {
    const calls: Array<{ limit: number; offset: number }> = [];
    const req = parsePageRequest({ page: "9", limit: "10" });
    const out = await paginate(req, async () => 25, async (w) => (calls.push(w), [1, 2]));
    assert.deepEqual(calls, [{ limit: 10, offset: 20 }]);
    assert.equal(out.meta.page, 3);
    const empty = await paginate(req, async () => 0, async () => { throw new Error("must not fetch"); });
    assert.deepEqual(empty.items, []);
  });
});
