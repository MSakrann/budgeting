import { describe, expect, it } from "vitest";
import {
  assertCurrencyEnum,
  assertStatusEnum,
  validateAmount,
  validateCurrency,
  validateInvoiceDocuments,
  validatePeriod,
  validateRates,
  validateSubmissionDate,
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

  it("rejects GBP and bogus status at the enum boundary", () => {
    expect(() => assertCurrencyEnum("GBP")).toThrow(/Invalid currency/);
    expect(() => assertStatusEnum("Bogus")).toThrow(/Invalid status/);
    expect(assertCurrencyEnum("EGP")).toBe("EGP");
    expect(assertStatusEnum("Draft")).toBe("Draft");
  });

  it("rejects invalid rates payloads", () => {
    expect(validateRates({ year: Number.NaN, usdToEgp: 1, eurToEgp: 1 })).toMatch(/Year/);
    expect(validateRates({ year: 2026.5, usdToEgp: 1, eurToEgp: 1 })).toMatch(/Year/);
    expect(validateRates({ year: 2026, usdToEgp: 0, eurToEgp: 1 })).toMatch(/USD/);
    expect(validateRates({ year: 2026, usdToEgp: -1, eurToEgp: 1 })).toMatch(/USD/);
    expect(validateRates({ year: 2026, usdToEgp: Number.NaN, eurToEgp: 1 })).toMatch(/USD/);
    expect(validateRates({ year: 2026, usdToEgp: 1, eurToEgp: Number.NaN })).toMatch(/EUR/);
    expect(validateRates({ year: 2026, usdToEgp: 52.6, eurToEgp: 61 })).toBeNull();
  });

  it("requires submission dates to be ISO YYYY-MM-DD", () => {
    expect(validateSubmissionDate("2026-05-17")).toBeNull();
    expect(validateSubmissionDate("2026/05/17")).toMatch(/YYYY-MM-DD/);
    expect(validateSubmissionDate("not-a-date")).toMatch(/YYYY-MM-DD/);
    expect(validateSubmissionDate("2026-02-30")).toMatch(/YYYY-MM-DD/);
  });
});
