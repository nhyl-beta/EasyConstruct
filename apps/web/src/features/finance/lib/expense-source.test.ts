import { describe, expect, it } from "vitest";

import { expenseSource } from "./expense-source";

describe("expenseSource", () => {
  it("an expense booked from an old paid claim still renders, as a plain retired label", () => {
    expect(expenseSource({ sourceType: "reimbursement", sourceId: "RMB-0007" })).toEqual({ kind: "retired-claim", label: "Reimbursement (retired)" });
    expect(expenseSource({ sourceType: "reimbursement" })).toEqual({ kind: "retired-claim", label: "Reimbursement (retired)" });
  });
  it("purchase-order expenses link to the order, everything else is manual", () => {
    expect(expenseSource({ sourceType: "purchase-order", sourceId: "PO-0001" })).toEqual({ kind: "purchase-order", label: "PO-0001" });
    expect(expenseSource({ sourceType: "manual" }).kind).toBe("manual");
    expect(expenseSource({}).label).toBe("Manual");
  });
});
