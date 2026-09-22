import { monthsInclusive } from "./months.js";
import type { YearMonth } from "./types.js";

export function capitalizationByYear(poEgp: number, start: YearMonth, end: YearMonth) {
  const months = monthsInclusive(start, end);
  const share = poEgp / months.length;
  const byYear = new Map<number, number>();
  for (const month of months) byYear.set(month.year, (byYear.get(month.year) ?? 0) + share);
  return [...byYear.entries()].map(([year, amountEgp]) => ({ year, amountEgp }));
}

export function capitalizationInYear(
  poEgp: number,
  start: YearMonth,
  end: YearMonth,
  year: number,
): number {
  return capitalizationByYear(poEgp, start, end).find((slice) => slice.year === year)?.amountEgp ?? 0;
}
