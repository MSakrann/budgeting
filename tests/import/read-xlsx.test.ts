import { describe, expect, it } from "vitest";
import { readConsumptionWorkbook } from "../../src/import/read-xlsx.js";
import { importConsumption } from "../../src/import/consumption.js";

describe("readConsumptionWorkbook", () => {
  it("loads the 2026 consumption sheet as submitted invoices", async () => {
    const rows = await readConsumptionWorkbook("references/Data - List of POs 2026.xlsx");
    const imported = importConsumption(rows, { purchaseOrders: [], invoices: [] });
    const total = imported.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    expect(imported.invoices).toHaveLength(13);
    expect(imported.purchaseOrders).toHaveLength(8);
    expect(Math.round(total * 100) / 100).toBe(15_044_222.58);
    expect(imported.invoices.every((invoice) => invoice.receiptNumber === null)).toBe(true);
    expect(imported.invoices.every((invoice) => invoice.submissionDate.startsWith("2026-"))).toBe(true);
  });
});
