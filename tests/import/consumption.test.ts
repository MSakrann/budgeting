import { describe, expect, it } from "vitest";
import { importConsumption, roundMoney, type ConsumptionRow } from "../../src/import/consumption.js";

describe("roundMoney", () => {
  it.each([
    [10.075, 10.08],
    [1.005, 1.01],
    [-1.005, -1.01],
    [1.004, 1.0],
    [-1.004, -1.0],
    [201530.72000000003, 201530.72],
  ])("rounds %f to %f", (amount, expected) => {
    expect(roundMoney(amount)).toBe(expected);
  });
});

const row = (amount: number, date: string, po = "64298"): ConsumptionRow => ({
  poNumber: po,
  supplier: "Summit Technology Solutions",
  description: "Red Hat Linux Services",
  invoiceAmount: amount,
  currency: "EGP",
  submissionDate: date,
});

describe("importConsumption", () => {
  it("creates a blank-contract PO and a submitted invoice", () => {
    const imported = importConsumption([row(201530.72, "2026-03-01")], { purchaseOrders: [], invoices: [] });
    expect(imported.purchaseOrders).toHaveLength(1);
    expect(imported.purchaseOrders[0].budgetYear).toBe(2026);
    expect(imported.purchaseOrders[0].contractAmount).toBeNull();
    expect(imported.purchaseOrders[0].capitalizationStart).toBeNull();
    expect(imported.invoices[0].receiptNumber).toBeNull();
    expect(imported.invoices[0].facReference).toBeNull();
  });

  it("does not duplicate the same PO number, amount, and submission date", () => {
    const first = importConsumption([row(10, "2026-03-01")], { purchaseOrders: [], invoices: [] });
    const second = importConsumption([row(10, "2026-03-01")], {
      purchaseOrders: first.purchaseOrders,
      invoices: first.invoices,
    });
    expect(second.purchaseOrders).toHaveLength(0);
    expect(second.invoices).toHaveLength(0);
  });
});
