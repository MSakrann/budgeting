import { periodIsOrdered } from "./months.js";
import {
  CURRENCIES,
  SPEND_KINDS,
  STATUSES,
  type Currency,
  type RecordStatus,
  type SpendKind,
  type YearMonth,
  type YearRates,
} from "./types.js";

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

export function validateCurrencyEnum(currency: unknown): currency is Currency {
  return typeof currency === "string" && (CURRENCIES as readonly string[]).includes(currency);
}

export function validateSpendKindEnum(kind: unknown): kind is SpendKind {
  return typeof kind === "string" && (SPEND_KINDS as readonly string[]).includes(kind);
}

export function validateStatusEnum(status: unknown): status is RecordStatus {
  return typeof status === "string" && (STATUSES as readonly string[]).includes(status);
}

export function assertCurrencyEnum(currency: unknown): Currency {
  if (!validateCurrencyEnum(currency)) throw new Error("Invalid currency");
  return currency;
}

export function assertSpendKindEnum(kind: unknown): SpendKind {
  if (!validateSpendKindEnum(kind)) throw new Error("Invalid kind");
  return kind;
}

export function assertStatusEnum(status: unknown): RecordStatus {
  if (!validateStatusEnum(status)) throw new Error("Invalid status");
  return status;
}

export function assertNullableCurrencyEnum(currency: unknown): Currency | null {
  if (currency === null || currency === undefined) return null;
  return assertCurrencyEnum(currency);
}

export function validateRates(input: { year: number; usdToEgp: number; eurToEgp: number }): string | null {
  if (!Number.isInteger(input.year) || !Number.isFinite(input.year)) {
    return "Year must be an integer";
  }
  if (typeof input.usdToEgp !== "number" || !Number.isFinite(input.usdToEgp) || !(input.usdToEgp > 0)) {
    return "USD rate must be a positive number";
  }
  if (typeof input.eurToEgp !== "number" || !Number.isFinite(input.eurToEgp) || !(input.eurToEgp > 0)) {
    return "EUR rate must be a positive number";
  }
  return null;
}

export function validateSubmissionDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return "Submission date must be YYYY-MM-DD";
  }
  const [y, m, d] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(y!, m! - 1, d!));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m! - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return "Submission date must be YYYY-MM-DD";
  }
  return null;
}
