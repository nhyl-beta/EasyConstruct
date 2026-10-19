import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  PR_STATUSES,
  PR_TRANSITIONS,
  assertDecisionNote,
  assertNotSelf,
  assertPayable,
  assertReceiverNotCreator,
  assertTransition,
  assertValidLineItems,
  budgetImpact,
  budgetRemaining,
  canTransition,
  committedAfter,
  isOverBudget,
  isUnsettledOrder,
  isUnsettledRequest,
  lineItemsTotal,
  orderReduction,
  paymentVariance,
  prStatusAfterRaise,
  unsettledIds,
} from "./rules.js";
import { ConflictError, ForbiddenError, ValidationError } from "../../utils/errors.js";

describe("transitions: every pair is checked against the table", () => {
  for (const [kind, statuses, table] of [
    ["purchase-request", PR_STATUSES, PR_TRANSITIONS],
    ["procurement-order", ORDER_STATUSES, ORDER_TRANSITIONS],
  ] as const) {
    test(kind, () => {
      const t = table as Record<string, readonly string[]>;
      for (const from of statuses) {
        for (const to of statuses) {
          const allowed = t[from]!.includes(to);
          assert.equal(canTransition(kind, from, to), allowed, `${kind}: ${from} -> ${to}`);
          if (!allowed) assert.throws(() => assertTransition(kind, "X-1", from, to), ConflictError);
          else assert.doesNotThrow(() => assertTransition(kind, "X-1", from, to));
        }
      }
    });
  }

  test("terminal statuses go nowhere", () => {
    for (const s of ["rejected", "cancelled"] as const) {
      assert.deepEqual(PR_TRANSITIONS[s], []);
    }
    assert.deepEqual(ORDER_TRANSITIONS.paid, []);
  });

  test("a request cannot be cancelled once ordered; the order's cancel puts it back to approved", () => {
    assert.equal(canTransition("purchase-request", "ordered", "cancelled"), false);
    assert.equal(canTransition("purchase-request", "ordered", "approved"), true);
  });

  test("payment needs delivery: an order cannot jump from ordered or in-transit to paid", () => {
    assert.equal(canTransition("procurement-order", "ordered", "paid"), false);
    assert.equal(canTransition("procurement-order", "in-transit", "paid"), false);
    assert.equal(canTransition("procurement-order", "delivered", "paid"), true);
  });

  test("a delivered order can no longer be cancelled", () => {
    assert.equal(canTransition("procurement-order", "delivered", "cancelled"), false);
  });
});

describe("where a request starts", () => {
  test("an Engineer's request waits for the PM; a PM's or Admin's goes to Finance", () => {
    assert.equal(prStatusAfterRaise("engineer"), "pending-pm");
    assert.equal(prStatusAfterRaise("project-manager"), "pending-finance");
    assert.equal(prStatusAfterRaise("admin"), "pending-finance");
  });
});

describe("segregation of duties", () => {
  test("nobody acts on their own request", () => {
    assert.throws(() => assertNotSelf(5, 5, "approve"), ForbiddenError);
    assert.doesNotThrow(() => assertNotSelf(5, 6, "approve"));
    assert.doesNotThrow(() => assertNotSelf(5, null, "approve"));
  });

  test("the receiver cannot be the order's creator", () => {
    assert.throws(() => assertReceiverNotCreator(9, 9), ForbiddenError);
    assert.doesNotThrow(() => assertReceiverNotCreator(9, 10));
    assert.doesNotThrow(() => assertReceiverNotCreator(9, null));
  });
});

describe("line items and amounts", () => {
  test("the total is computed from the lines and rounded", () => {
    assert.equal(lineItemsTotal([{ qty: 3, unitCost: 10.1 }, { qty: 2, unitCost: 0.333 }]), 30.97);
    assert.equal(lineItemsTotal([]), 0);
  });

  test("invalid lines are refused", () => {
    const ok = { description: "Rebar", qty: 2, unit: "ton", unitCost: 100 };
    assert.doesNotThrow(() => assertValidLineItems([ok]));
    assert.throws(() => assertValidLineItems([]), ValidationError);
    assert.throws(() => assertValidLineItems([{ ...ok, description: " " }]), ValidationError);
    assert.throws(() => assertValidLineItems([{ ...ok, qty: 0 }]), ValidationError);
    assert.throws(() => assertValidLineItems([{ ...ok, unitCost: -1 }]), ValidationError);
    assert.throws(() => assertValidLineItems([{ ...ok, unitCost: 0 }]), ValidationError); // total must be > 0
  });
});

describe("budget math", () => {
  const line = { planned: 1000, committed: 200, actual: 300 };

  test("remaining = planned - committed - actual", () => {
    assert.equal(budgetRemaining(line), 500);
  });

  test("impact shows what is left after committing", () => {
    const i = budgetImpact(line, 150)!;
    assert.equal(i.remaining, 500);
    assert.equal(i.remainingAfter, 350);
    assert.equal(budgetImpact(null, 150), null);
  });

  test("over budget: no line, or more than is free; exactly the remainder is fine", () => {
    assert.equal(isOverBudget(null, 1), true);
    assert.equal(isOverBudget(line, 500), false);
    assert.equal(isOverBudget(line, 500.01), true);
  });

  test("decision notes: reject always, approve only when over budget", () => {
    assert.throws(() => assertDecisionNote("reject", false, ""), ValidationError);
    assert.throws(() => assertDecisionNote("approve", true, "  "), ValidationError);
    assert.doesNotThrow(() => assertDecisionNote("approve", true, "Owner agreed"));
    assert.doesNotThrow(() => assertDecisionNote("approve", false, undefined));
    assert.doesNotThrow(() => assertDecisionNote("reject", false, "Not needed"));
  });

  test("commit, release and floor at zero", () => {
    assert.equal(committedAfter(200, 100), 300);
    assert.equal(committedAfter(200, -50), 150);
    assert.equal(committedAfter(40, -100), 0);
  });

  test("an order may be lower than the request (releasing the difference), never higher", () => {
    assert.deepEqual(orderReduction(1000, 1000), { release: 0 });
    assert.deepEqual(orderReduction(1000, 750.5), { release: 249.5 });
    assert.throws(() => orderReduction(1000, 1000.01), ValidationError);
    assert.throws(() => orderReduction(1000, 0), ValidationError);
  });

  test("the commitment lifecycle: approve, reduce, pay leaves nothing committed", () => {
    let committed = 0;
    committed = committedAfter(committed, 1000); // approve
    committed = committedAfter(committed, -orderReduction(1000, 900).release); // order for 900
    assert.equal(committed, 900);
    committed = committedAfter(committed, -900); // payment releases the order's amount
    assert.equal(committed, 0);
  });
});

describe("payment", () => {
  test("variance is invoice minus order", () => {
    assert.deepEqual(paymentVariance(900, 950), { variance: 50, differs: true });
    assert.deepEqual(paymentVariance(900, 900), { variance: 0, differs: false });
    assert.deepEqual(paymentVariance(900, 850.25), { variance: -49.75, differs: true });
  });

  test("only a delivered order can be paid", () => {
    for (const status of ["ordered", "in-transit", "paid", "cancelled"]) {
      assert.throws(() => assertPayable({ id: "PO-1", status }, 900, null, 900), ConflictError, status);
    }
    assert.doesNotThrow(() => assertPayable({ id: "PO-1", status: "delivered" }, 900, null, 900));
  });

  test("a different invoice needs a variance note", () => {
    const o = { id: "PO-1", status: "delivered" };
    assert.throws(() => assertPayable(o, 950, "", 900), ValidationError);
    assert.doesNotThrow(() => assertPayable(o, 950, "Freight added", 900));
    assert.throws(() => assertPayable(o, 0, "x", 900), ValidationError);
  });
});

describe("unsettled (closing gate)", () => {
  test("requests: waiting or approved-but-not-ordered are unsettled", () => {
    for (const s of ["pending-pm", "pending-finance", "approved"]) assert.equal(isUnsettledRequest(s), true, s);
    for (const s of ["ordered", "rejected", "cancelled"]) assert.equal(isUnsettledRequest(s), false, s);
  });

  test("orders: everything except paid and cancelled", () => {
    for (const s of ["ordered", "in-transit", "delivered"]) assert.equal(isUnsettledOrder(s), true, s);
    for (const s of ["paid", "cancelled"]) assert.equal(isUnsettledOrder(s), false, s);
  });

  test("an ordered request is settled by its order, not counted twice", () => {
    assert.deepEqual(
      unsettledIds({
        requests: [{ id: "PR-1", status: "ordered" }, { id: "PR-2", status: "approved" }],
        orders: [{ id: "PO-1", status: "in-transit" }, { id: "PO-2", status: "paid" }],
      }),
      ["PR-2", "PO-1"],
    );
  });
});
