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

const env = {
  EDITOR_ONE_EMAIL: "a@orange.com", EDITOR_ONE_PASSWORD: "one", EDITOR_ONE_NAME: "A",
  EDITOR_TWO_EMAIL: "b@orange.com", EDITOR_TWO_PASSWORD: "two", EDITOR_TWO_NAME: "B",
  VIEWER_EMAIL: "cto@orange.com", VIEWER_PASSWORD: "view", VIEWER_NAME: "CTO",
};

describe("seed", () => {
  it("creates three users, 2026 rates, and imports consumption once", async () => {
    const store = createMemoryStore();
    await seed(store, env, async () => rows);
    await seed(store, env, async () => rows);
    const ledger = await store.loadLedger();
    expect(ledger.rates).toEqual([{ year: 2026, usdToEgp: 52.6, eurToEgp: 61 }]);
    expect(ledger.invoices).toHaveLength(1);
    expect(buildDashboard(ledger, 2026).submittedInvoicesEgp).toBe(15_044_222.58);
    expect(await store.findUserByEmail("cto@orange.com")).toMatchObject({ role: "viewer" });
  });

  it("skips import when the workbook file is missing (ENOENT)", async () => {
    const store = createMemoryStore();
    const missing = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    await seed(store, env, async () => {
      throw missing;
    });
    const ledger = await store.loadLedger();
    expect(ledger.rates).toEqual([{ year: 2026, usdToEgp: 52.6, eurToEgp: 61 }]);
    expect(ledger.invoices).toHaveLength(0);
    expect(await store.hasImport("consumption-2026")).toBe(false);
  });

  it("skips import when ExcelJS reports File not found", async () => {
    const store = createMemoryStore();
    await seed(store, env, async () => {
      throw new Error("File not found: references/missing.xlsx");
    });
    expect(await store.hasImport("consumption-2026")).toBe(false);
    expect((await store.loadLedger()).invoices).toHaveLength(0);
  });

  it("propagates corrupt workbook and parse errors", async () => {
    const store = createMemoryStore();
    await expect(
      seed(store, env, async () => {
        throw new Error("Consumption per PO sheet is missing");
      }),
    ).rejects.toThrow("Consumption per PO sheet is missing");
    expect(await store.hasImport("consumption-2026")).toBe(false);
  });

  it("fails loudly when required user env vars are missing", async () => {
    const store = createMemoryStore();
    await expect(seed(store, {}, async () => rows)).rejects.toThrow(/Missing required seed env/);
  });
});
