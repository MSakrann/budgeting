import type { Currency, YearRates } from "./types.js";

export function toEgp(amount: number, currency: Currency, rates: YearRates): number {
  if (currency === "EGP") return amount;
  const rate = currency === "USD" ? rates.usdToEgp : rates.eurToEgp;
  if (!(rate > 0)) throw new Error(`${currency} rate for ${rates.year} must be greater than 0`);
  return amount * rate;
}
