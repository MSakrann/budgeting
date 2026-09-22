import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresStore } from "../../src/db/postgres-store.js";
import { createMemoryStore } from "../../src/store/memory.js";
import type { Store } from "../../src/store/types.js";

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

describe.each([
  ["postgres", async () => createPostgresStore(new PGlite())],
  ["memory", async () => createMemoryStore()],
])("%s store validation", (_label, createStore) => {
  async function freshStore(): Promise<Store> {
    return createStore();
  }

  it("rejects a USD budget line when 2026 rates are missing", async () => {
    const store = await freshStore();
    await expect(
      store.createBudgetLine({
        year: 2026,
        projectTitle: "Network",
        kind: "capex",
        currency: "USD",
        amount: 100,
      }),
    ).rejects.toThrow(/Missing USD rate/);
  });

  it("rejects amount 0", async () => {
    const store = await freshStore();
    await expect(
      store.createBudgetLine({
        year: 2026,
        projectTitle: "Zero",
        kind: "opex",
        currency: "EGP",
        amount: 0,
      }),
    ).rejects.toThrow(/greater than zero/);
  });

  it("rejects an invoice with a receipt number and no FAC reference", async () => {
    const store = await freshStore();
    const po = await store.createPurchaseOrder({
      number: "70001",
      budgetYear: 2026,
      supplier: "Acme",
      description: "Gear",
      contractAmount: 500,
      currency: "EGP",
      kind: "capex",
      budgetLineId: null,
      capitalizationStart: null,
      capitalizationEnd: null,
    });
    await expect(
      store.createInvoice({
        purchaseOrderId: po.id,
        amount: 50,
        currency: "EGP",
        submissionDate: "2026-04-01",
        description: null,
        receiptNumber: "R-1",
        facReference: null,
      }),
    ).rejects.toThrow(/both be present/);
  });

  it("deleting a PO that still has an invoice throws in use", async () => {
    const store = await freshStore();
    const po = await store.createPurchaseOrder({
      number: "70002",
      budgetYear: 2026,
      supplier: "Acme",
      description: "Gear",
      contractAmount: 500,
      currency: "EGP",
      kind: "capex",
      budgetLineId: null,
      capitalizationStart: null,
      capitalizationEnd: null,
    });
    await store.createInvoice({
      purchaseOrderId: po.id,
      amount: 50,
      currency: "EGP",
      submissionDate: "2026-04-01",
      description: null,
      receiptNumber: null,
      facReference: null,
    });
    await expect(store.deletePurchaseOrder(po.id)).rejects.toThrow(/in use/);
  });

  it("rejects creating an invoice with an unknown purchase order id", async () => {
    const store = await freshStore();
    await expect(
      store.createInvoice({
        purchaseOrderId: "missing-po-id",
        amount: 50,
        currency: "EGP",
        submissionDate: "2026-04-01",
        description: null,
        receiptNumber: null,
        facReference: null,
      }),
    ).rejects.toThrow(/does not exist/);
  });
});
