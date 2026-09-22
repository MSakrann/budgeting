import { describe, expect, it } from "vitest";
import { formatEgp, formatPercent } from "../../client/format.js";

describe("format", () => {
  it("formats EGP and percentages for the dashboard", () => {
    expect(formatEgp(15_044_222.58)).toContain("15,044,222.58");
    expect(formatPercent(0.4)).toBe("40.0%");
    expect(formatPercent(null)).toBe("—");
  });
});
