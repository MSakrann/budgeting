import { describe, expect, it } from "vitest";
import { toEgp } from "../../src/domain/money.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

describe("toEgp", () => {
  it("leaves EGP unchanged", () => {
    expect(toEgp(2_000_000, "EGP", rates)).toBe(2_000_000);
  });

  it("converts USD and EUR with the year rate", () => {
    expect(toEgp(10_000, "USD", rates)).toBe(526_000);
    expect(toEgp(1_000, "EUR", rates)).toBe(61_000);
  });

  it("refuses a non-positive rate", () => {
    expect(() => toEgp(1, "USD", { year: 2026, usdToEgp: 0, eurToEgp: 61 })).toThrow(
      /USD rate/,
    );
  });
});
