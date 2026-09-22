import { describe, expect, it } from "vitest";
import { capitalizationByYear, capitalizationInYear } from "../../src/domain/capitalization.js";

describe("capitalization", () => {
  it("puts March 2026 through September 2026 entirely in 2026", () => {
    const start = { year: 2026, month: 3 };
    const end = { year: 2026, month: 9 };
    expect(capitalizationInYear(700_000, start, end, 2026)).toBe(700_000);
    expect(capitalizationInYear(700_000, start, end, 2027)).toBe(0);
    expect(capitalizationByYear(700_000, start, end)).toEqual([
      { year: 2026, amountEgp: 700_000 },
    ]);
  });

  it("splits June 2026 through June 2027 into 7/13 and 6/13", () => {
    const start = { year: 2026, month: 6 };
    const end = { year: 2027, month: 6 };
    expect(capitalizationInYear(1_300_000, start, end, 2026)).toBe(700_000);
    expect(capitalizationInYear(1_300_000, start, end, 2027)).toBe(600_000);
  });

  it("rejects a period that ends before it starts", () => {
    expect(() =>
      capitalizationInYear(1, { year: 2026, month: 5 }, { year: 2026, month: 4 }, 2026),
    ).toThrow(/end month/);
  });
});
