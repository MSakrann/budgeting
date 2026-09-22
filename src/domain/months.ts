import type { YearMonth } from "./types.js";

export function periodIsOrdered(start: YearMonth, end: YearMonth): boolean {
  return end.year * 12 + end.month >= start.year * 12 + start.month;
}

export function monthsInclusive(start: YearMonth, end: YearMonth): YearMonth[] {
  if (!periodIsOrdered(start, end)) {
    throw new Error("Capitalization end month is before the start month");
  }
  const months: YearMonth[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({ year, month });
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
