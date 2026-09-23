import { describe, expect, it } from "vitest";
import { seed } from "../../src/seed.js";
import { createMemoryStore } from "../../src/store/memory.js";
import { buildDashboard } from "../../src/domain/dashboard.js";
import type { ConsumptionRow } from "../../src/import/consumption.js";

const rows: ConsumptionRow[] = [
  {
    poNumber: "64298", supplier: "Summit", description: "Red Hat",
    invoiceAmount: 15_044_222.58, currency: "EGP", submissionDate: "2026-03-01",
  },
];

describe("seed", () => {
  it("creates three users, 2026 rates, and imports consumption once", async () => {
    const store = createMemoryStore();
    const env = {
      EDITOR_ONE_EMAIL: "a@orange.com", EDITOR_ONE_PASSWORD: "one", EDITOR_ONE_NAME: "A",
      EDITOR_TWO_EMAIL: "b@orange.com", EDITOR_TWO_PASSWORD: "two", EDITOR_TWO_NAME: "B",
      VIEWER_EMAIL: "cto@orange.com", VIEWER_PASSWORD: "view", VIEWER_NAME: "CTO",
    };
    await seed(store, env, async () => rows);
    await seed(store, env, async () => rows);
    const ledger = await store.loadLedger();
    expect(ledger.rates).toEqual([{ year: 2026, usdToEgp: 52.6, eurToEgp: 61 }]);
    expect(ledger.invoices).toHaveLength(1);
    expect(buildDashboard(ledger, 2026).submittedInvoicesEgp).toBe(15_044_222.58);
    expect(await store.findUserByEmail("cto@orange.com")).toMatchObject({ role: "viewer" });
  });
});
