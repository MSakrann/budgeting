import { describe, expect, it } from "vitest";
import { buildDashboard } from "../../src/domain/dashboard.js";
import type { Ledger } from "../../src/domain/types.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

function ledger(extra: Partial<Ledger> = {}): Ledger {
  return {
    rates: [rates],
    budgetLines: [
      { id: "b1", year: 2026, projectTitle: "Support", kind: "capex", currency: "EGP", amount: 1_000 },
    ],
    purchaseRequests: [
      { id: "pr1", title: "Open PR", year: 2026, amount: 100, currency: "EGP", budgetLineId: "b1", status: "In progress" },
      { id: "pr2", title: "Draft PR", year: 2026, amount: 50, currency: "EGP", budgetLineId: null, status: "Draft" },
    ],
    iecs: [
      {
        id: "iec1", title: "Small", year: 2026, projectCode: "DG1", supplier: null, kind: "capex",
        currency: "EGP", budgetAmount: 100, requestedAmount: 100, note: null, purchaseRequestId: null,
        status: "In progress",
      },
    ],
    purchaseOrders: [
      {
        id: "po1", number: "64191", budgetYear: 2026, supplier: "Hypercell", description: "Billing",
        contractAmount: 1_300, currency: "EGP", kind: "capex", budgetLineId: "b1",
        capitalizationStart: { year: 2026, month: 6 }, capitalizationEnd: { year: 2027, month: 6 },
      },
      {
        id: "po2", number: "65829", budgetYear: 2026, supplier: "Asset", description: "Plot",
        contractAmount: null, currency: null, kind: "capex", budgetLineId: null,
        capitalizationStart: null, capitalizationEnd: null,
      },
    ],
    invoices: [
      {
        id: "i1", purchaseOrderId: "po1", amount: 400, currency: "EGP", submissionDate: "2026-05-17",
        description: null, receiptNumber: "6892", facReference: "FAC-1",
      },
      {
        id: "i2", purchaseOrderId: "po1", amount: 100, currency: "EGP", submissionDate: "2026-06-01",
        description: null, receiptNumber: null, facReference: null,
      },
      {
        id: "i3", purchaseOrderId: "po2", amount: 50, currency: "EGP", submissionDate: "2027-01-02",
        description: null, receiptNumber: null, facReference: null,
      },
    ],
    ...extra,
  };
}

describe("buildDashboard", () => {
  it("aggregates the selected year and keeps in-progress live", () => {
    const dash = buildDashboard(ledger(), 2026);
    expect(dash.submittedInvoicesEgp).toBe(500);
    expect(dash.inProgressPrs).toEqual({ count: 1, egp: 100 });
    expect(dash.inProgressIecs).toEqual({ count: 1, egp: 100 });
    expect(dash.pipelineIecs[0].tier).toBe("mini");
    expect(dash.capitalizationEgp).toBe(700);
    expect(dash.cashedOutEgp).toBe(400);
    expect(dash.remainingCashOutEgp).toBe(900);
    expect(dash.cashedOutPercentage).toBeCloseTo(400 / 1300);
    expect(dash.approvedEgp).toBe(1_000);
    expect(dash.committedEgp).toBe(1_300);
    expect(dash.uncommittedEgp).toBe(-300);
    expect(dash.overrunEgp).toBe(300);
    const open = dash.purchaseOrders.find((po) => po.number === "65829");
    expect(open?.incomplete).toBe(true);
    expect(open?.percentage).toBeNull();
    expect(buildDashboard(ledger(), 2027).inProgressPrs).toEqual({ count: 1, egp: 100 });
    expect(buildDashboard(ledger(), 2027).submittedInvoicesEgp).toBe(50);
    expect(buildDashboard(ledger(), 2027).capitalizationEgp).toBe(600);
  });

  it("does not require a rates row for EGP in-progress PRs in a year without rates", () => {
    const dash = buildDashboard(
      ledger({
        purchaseRequests: [
          {
            id: "pr1",
            title: "Open PR",
            year: 2026,
            amount: 100,
            currency: "EGP",
            budgetLineId: "b1",
            status: "In progress",
          },
          {
            id: "pr2027",
            title: "2027 EGP PR",
            year: 2027,
            amount: 250,
            currency: "EGP",
            budgetLineId: null,
            status: "In progress",
          },
        ],
      }),
      2026,
    );
    expect(dash.inProgressPrs).toEqual({ count: 2, egp: 350 });
  });
});
