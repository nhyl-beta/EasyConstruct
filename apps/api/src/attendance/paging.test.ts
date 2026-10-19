import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_PAGE_SIZE, resolvePage } from "./paging.js";

describe("resolvePage", () => {
  test("first page by default with the standard size", () => {
    assert.deepEqual(resolvePage({}, 25), { total: 25, page: 1, pageSize: 10, pages: 3, offset: 0 });
  });
  test("offset follows the page", () => {
    assert.equal(resolvePage({ page: 3, pageSize: 10 }, 25).offset, 20);
  });
  test("a page past the end snaps to the last page; an empty list is one empty page", () => {
    assert.equal(resolvePage({ page: 99, pageSize: 10 }, 25).page, 3);
    assert.deepEqual(resolvePage({ page: 5 }, 0), { total: 0, page: 1, pageSize: 10, pages: 1, offset: 0 });
  });
  test("page size is bounded and junk falls back to defaults", () => {
    assert.equal(resolvePage({ pageSize: 100000 }, 500).pageSize, MAX_PAGE_SIZE);
    assert.equal(resolvePage({ pageSize: 0 }, 5).pageSize, 10);
    assert.equal(resolvePage({ page: Number.NaN, pageSize: Number.NaN }, 5).page, 1);
  });
});
