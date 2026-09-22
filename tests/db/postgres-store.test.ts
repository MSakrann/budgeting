import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresStore } from "../../src/db/postgres-store.js";

describe("postgres store", () => {
  it("saves a PO and refuses a second import of the same invoice", async () => {
    const client = new PGlite();
    const store = await createPostgresStore(client);
    await store.upsertRates({ year: 2026, usdToEgp: 52.6, eurToEgp: 61 });
    const po = await store.createPurchaseOrder({
      number: "64191",
      budgetYear: 2026,
      supplier: "Hypercell",
      description: "Billing",
      contractAmount: 1_300_000,
      currency: "EGP",
      kind: "capex",
      budgetLineId: null,
      capitalizationStart: { year: 2026, month: 6 },
      capitalizationEnd: { year: 2027, month: 6 },
    });
    await store.createInvoice({
      purchaseOrderId: po.id,
      amount: 100,
      currency: "EGP",
      submissionDate: "2026-05-17",
      description: null,
      receiptNumber: null,
      facReference: null,
    });
    const ledger = await store.loadLedger();
    expect(ledger.purchaseOrders).toHaveLength(1);
    expect(ledger.invoices).toHaveLength(1);
    await expect(
      store.createPurchaseOrder({
        number: "64191",
        budgetYear: 2026,
        supplier: "Other",
        description: "Duplicate",
        contractAmount: 1,
        currency: "EGP",
        kind: "capex",
        budgetLineId: null,
        capitalizationStart: null,
        capitalizationEnd: null,
      }),
    ).rejects.toThrow(/number/);
  });
});
