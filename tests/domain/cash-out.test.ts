import { describe, expect, it } from "vitest";
import { cashOutSummary, invoiceOverRemaining, isCashedOut } from "../../src/domain/cash-out.js";

describe("cash-out", () => {
  it("counts an invoice only when receipt and FAC are both present", () => {
    expect(isCashedOut("6892", "FAC-64191")).toBe(true);
    expect(isCashedOut("6892", null)).toBe(false);
    expect(isCashedOut(null, "FAC-64191")).toBe(false);
    expect(isCashedOut("  ", "FAC")).toBe(false);
    expect(isCashedOut(null, null)).toBe(false);
  });

  it("computes percentage and remaining from cashed-out invoices only", () => {
    const summary = cashOutSummary(1_000, [
      { amountEgp: 400, cashedOut: true },
      { amountEgp: 100, cashedOut: false },
    ]);
    expect(summary).toEqual({ cashedOutEgp: 400, remainingEgp: 600, percentage: 0.4 });
  });

  it("flags an invoice above remaining cash-out excluding itself", () => {
    expect(invoiceOverRemaining(700, 1_000, 400)).toBe(true);
    expect(invoiceOverRemaining(600, 1_000, 400)).toBe(false);
  });
});
