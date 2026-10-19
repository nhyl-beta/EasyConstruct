import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_RECEIPT_READERS, FINANCE_COMPANY_READERS, FINANCE_PROJECT_READERS, canReadFinanceFile } from "./access.js";

const ALL = ["admin", "owner", "it-designer", "project-manager", "human-resources", "finance-manager", "architect", "engineer", "site-personnel", "consultant"];

describe("finance read roles", () => {
  test("Site Personnel, Consultant, Architect, Engineer and HR have no finance list access", () => {
    for (const role of ["site-personnel", "consultant", "architect", "engineer", "human-resources"]) {
      assert.equal((FINANCE_PROJECT_READERS as readonly string[]).includes(role), false, role);
    }
  });
  test("Finance Manager, Owner, Admin and IT Designer read everything", () => {
    for (const role of ["finance-manager", "owner", "admin", "it-designer"]) {
      assert.ok((FINANCE_COMPANY_READERS as readonly string[]).includes(role), role);
    }
  });
  test("the PM reads budgets and expenses (their own projects) but not the company-wide views", () => {
    assert.ok((FINANCE_PROJECT_READERS as readonly string[]).includes("project-manager"));
    assert.equal((FINANCE_COMPANY_READERS as readonly string[]).includes("project-manager"), false);
  });
});

describe("canReadFinanceFile", () => {
  test("expense receipts: finance readers only", () => {
    const allowed = ALL.filter((r) => canReadFinanceFile(r, "expense-receipt")).sort();
    assert.deepEqual(allowed, ["admin", "finance-manager", "it-designer", "owner", "project-manager"]);
  });
  test("delivery receipts: also the roles that confirm deliveries", () => {
    for (const role of DELIVERY_RECEIPT_READERS) assert.equal(canReadFinanceFile(role, "delivery-receipt"), true, role);
    assert.equal(canReadFinanceFile("consultant", "delivery-receipt"), false);
    assert.equal(canReadFinanceFile("architect", "delivery-receipt"), false);
  });
  test("delivery-receipt readers still cannot open expense receipts", () => {
    for (const role of DELIVERY_RECEIPT_READERS) assert.equal(canReadFinanceFile(role, "expense-receipt"), false, role);
  });
});
