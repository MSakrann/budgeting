import { describe, expect, it } from "vitest";
import { iecTier } from "../../src/domain/iec.js";
import { toEgp } from "../../src/domain/money.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

describe("iecTier", () => {
  it("is mini below 2,000,000 EGP and full at 2,000,000", () => {
    expect(iecTier(1_999_999.99)).toBe("mini");
    expect(iecTier(2_000_000)).toBe("full");
  });

  it("converts USD before the test", () => {
    expect(iecTier(toEgp(10_000, "USD", rates))).toBe("mini");
    expect(iecTier(toEgp(40_000, "USD", rates))).toBe("full");
  });
});
