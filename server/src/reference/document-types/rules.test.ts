import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOCUMENT_TYPE_SEEDS,
  SYSTEM_TYPE_NAMES,
  assertEditAllowed,
  checkSubmittedType,
  findDuplicate,
  normalizeTypeName,
  prepareTypeName,
  type TypeLike,
} from "./rules.js";

const row = (id: number, name: string, over: Partial<TypeLike> = {}): TypeLike => ({
  id,
  name,
  nameKey: normalizeTypeName(name),
  isSystem: false,
  active: true,
  ...over,
});

describe("normalizing names", () => {
  test("case, spacing, hyphens and accents do not make a different type", () => {
    assert.equal(normalizeTypeName("As-Built  Drawing"), "as built drawing");
    assert.equal(normalizeTypeName(" as built drawing "), "as built drawing");
    assert.equal(normalizeTypeName("Permís"), "permis");
  });
  test("an empty or punctuation-only name is refused", () => {
    assert.throws(() => prepareTypeName("   "), /Enter a document type name/);
    assert.throws(() => prepareTypeName("---"), /Enter a document type name/);
  });
  test("a name over 50 characters is refused (documents.type is varchar(50))", () => {
    assert.throws(() => prepareTypeName("x".repeat(51)), /at most 50/);
    assert.equal(prepareTypeName("  Building   Permit ").name, "Building Permit");
  });
});

describe("duplicates", () => {
  const existing = [row(1, "Permit"), row(2, "As-Built Drawing")];
  test("the same normalized name is a duplicate", () => {
    assert.equal(findDuplicate(normalizeTypeName("PERMIT"), existing)?.id, 1);
    assert.equal(findDuplicate(normalizeTypeName("as built drawing"), existing)?.id, 2);
  });
  test("renaming a type to its own name is not a duplicate of itself", () => {
    assert.equal(findDuplicate(normalizeTypeName("permit"), existing, 1), undefined);
  });
  test("a new name is not a duplicate", () => {
    assert.equal(findDuplicate(normalizeTypeName("Lease"), existing), undefined);
  });
});

describe("system types", () => {
  const contract = row(1, "Contract", { isSystem: true });
  test("cannot be renamed or deactivated", () => {
    assert.throws(() => assertEditAllowed(contract, { name: "Agreement" }), /cannot be renamed/);
    assert.throws(() => assertEditAllowed(contract, { active: false }), /cannot be deactivated/);
  });
  test("a respelling of the same name and staying active are allowed", () => {
    assert.doesNotThrow(() => assertEditAllowed(contract, { name: "contract" }));
    assert.doesNotThrow(() => assertEditAllowed(contract, { active: true }));
    assert.doesNotThrow(() => assertEditAllowed(contract, {}));
  });
  test("a normal type can be renamed and deactivated", () => {
    const permit = row(2, "Permit");
    assert.doesNotThrow(() => assertEditAllowed(permit, { name: "Building Permit", active: false }));
  });
  test("the gate types are exactly the system seeds", () => {
    assert.deepEqual(
      [...SYSTEM_TYPE_NAMES].sort(),
      ["As-Built Drawing", "Certificate of Completion", "Client Acceptance", "Contract", "Notice of Award", "Notice to Proceed", "Turnover Document"],
    );
  });
});

describe("checking a submitted type", () => {
  const types = [row(1, "Permit"), row(2, "Old Form", { active: false })];
  test("accepts a new active type and returns its stored spelling", () => {
    assert.deepEqual(checkSubmittedType("permit", types), { ok: true, name: "Permit" });
  });
  test("rejects an inactive type", () => {
    const r = checkSubmittedType("Old Form", types);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "inactive");
  });
  test("rejects an unknown type", () => {
    const r = checkSubmittedType("Napkin Sketch", types);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "unknown");
  });
});

describe("seeds", () => {
  test("the original 11 types plus the Legal category are seeded, with unique keys", () => {
    assert.equal(DOCUMENT_TYPE_SEEDS.length, 16);
    assert.equal(new Set(DOCUMENT_TYPE_SEEDS.map((s) => normalizeTypeName(s.name))).size, DOCUMENT_TYPE_SEEDS.length);
    assert.deepEqual(
      DOCUMENT_TYPE_SEEDS.filter((s) => s.category === "Legal").map((s) => s.name),
      ["Permit", "NDA", "Clearance", "Bond", "Insurance"],
    );
  });
  test("the migration seeds every type in the list", () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "drizzle", "0034_document_types.sql"), "utf8");
    for (const s of DOCUMENT_TYPE_SEEDS) assert.ok(sql.includes(`'${s.name}'`), `0034 does not seed ${s.name}`);
  });
});
