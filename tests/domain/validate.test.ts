import { describe, expect, it } from "vitest";
import {
  validateAmount,
  validateCurrency,
  validateInvoiceDocuments,
  validatePeriod,
} from "../../src/domain/validate.js";

describe("validate", () => {
  it("rejects one cash-out document without the other", () => {
    expect(validateInvoiceDocuments("6892", null)).toMatch(/both/);
    expect(validateInvoiceDocuments(null, "FAC-1")).toMatch(/both/);
    expect(validateInvoiceDocuments(null, null)).toBeNull();
    expect(validateInvoiceDocuments("6892", "FAC-1")).toBeNull();
  });

  it("requires a present amount to be greater than zero", () => {
    expect(validateAmount(null)).toBeNull();
    expect(validateAmount(0)).toMatch(/greater than zero/);
    expect(validateAmount(10)).toBeNull();
  });

  it("allows a blank period and rejects a backwards period", () => {
    expect(validatePeriod(null, null)).toBeNull();
    expect(validatePeriod({ year: 2026, month: 6 }, null)).toBeNull();
    expect(validatePeriod({ year: 2026, month: 6 }, { year: 2026, month: 5 })).toMatch(/end month/);
    expect(validatePeriod({ year: 2026, month: 3 }, { year: 2026, month: 9 })).toBeNull();
  });

  it("requires a year rate before saving USD or EUR", () => {
    expect(validateCurrency("USD", undefined)).toMatch(/rate/);
    expect(validateCurrency("EGP", undefined)).toBeNull();
    expect(validateCurrency("EUR", { year: 2026, usdToEgp: 52.6, eurToEgp: 61 })).toBeNull();
  });
});
