function filled(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

export function isCashedOut(receiptNumber: string | null, facReference: string | null): boolean {
  return filled(receiptNumber) && filled(facReference);
}

export function cashOutSummary(
  poEgp: number,
  invoices: { amountEgp: number; cashedOut: boolean }[],
) {
  const cashedOutEgp = invoices.filter((invoice) => invoice.cashedOut).reduce((sum, invoice) => sum + invoice.amountEgp, 0);
  return { cashedOutEgp, remainingEgp: poEgp - cashedOutEgp, percentage: cashedOutEgp / poEgp };
}

export function invoiceOverRemaining(amountEgp: number, poEgp: number, otherCashedOutEgp: number): boolean {
  return amountEgp > poEgp - otherCashedOutEgp;
}
