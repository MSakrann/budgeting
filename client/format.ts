const egp = new Intl.NumberFormat("en-EG", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEgp(amount: number): string {
  return `EGP ${egp.format(amount)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
