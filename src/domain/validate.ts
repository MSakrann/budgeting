import { periodIsOrdered } from "./months.js";
import type { Currency, YearMonth, YearRates } from "./types.js";

function filled(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

export function validateInvoiceDocuments(receiptNumber: string | null, facReference: string | null): string | null {
  const receipt = filled(receiptNumber);
  const fac = filled(facReference);
  if (receipt === fac) return null;
  return "Oracle receipt number and FAC reference must both be present";
}

export function validateAmount(amount: number | null): string | null {
  if (amount === null) return null;
  if (!(amount > 0)) return "Amount must be greater than zero";
  return null;
}

export function validatePeriod(start: YearMonth | null, end: YearMonth | null): string | null {
  if (!start || !end) return null;
  if (!periodIsOrdered(start, end)) return "Capitalization end month is before the start month";
  return null;
}

export function validateCurrency(currency: Currency, rates: YearRates | undefined): string | null {
  if (currency === "EGP") return null;
  if (!rates) return `Missing ${currency} rate for this year`;
  const rate = currency === "USD" ? rates.usdToEgp : rates.eurToEgp;
  if (!(rate > 0)) return `Missing ${currency} rate for this year`;
  return null;
}
