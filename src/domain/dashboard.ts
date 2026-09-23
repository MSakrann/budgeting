import { capitalizationByYear } from "./capitalization.js";
import { cashOutSummary, invoiceOverRemaining, isCashedOut } from "./cash-out.js";
import { iecTier } from "./iec.js";
import { monthsInclusive } from "./months.js";
import { toEgp } from "./money.js";
import type { Currency, Invoice, Ledger, PurchaseOrder, YearRates } from "./types.js";

export type Dashboard = ReturnType<typeof buildDashboard>;

function ratesFor(ledger: Ledger, year: number): YearRates {
  const rates = ledger.rates.find((item) => item.year === year);
  if (!rates) throw new Error(`Missing rates for ${year}`);
  return rates;
}

/** EGP never needs a rates row; only USD/EUR conversion looks up year rates. */
function money(ledger: Ledger, amount: number, currency: Currency, year: number): number {
  if (currency === "EGP") return amount;
  return toEgp(amount, currency, ratesFor(ledger, year));
}

function poEgp(ledger: Ledger, po: PurchaseOrder): number | null {
  if (po.contractAmount === null || po.currency === null) return null;
  return money(ledger, po.contractAmount, po.currency, po.budgetYear);
}

export function buildDashboard(ledger: Ledger, year: number) {
  const submittedInvoicesEgp = ledger.invoices
    .filter((invoice) => Number(invoice.submissionDate.slice(0, 4)) === year)
    .reduce((sum, invoice) => {
      const po = ledger.purchaseOrders.find((item) => item.id === invoice.purchaseOrderId);
      if (!po) throw new Error(`Invoice ${invoice.id} has no PO`);
      return sum + money(ledger, invoice.amount, invoice.currency, po.budgetYear);
    }, 0);

  const inProgressPrsList = ledger.purchaseRequests.filter((pr) => pr.status === "In progress");
  const inProgressIecsList = ledger.iecs.filter((iec) => iec.status === "In progress");

  let capitalizationEgp = 0;
  let capitalizationFromOtherBudgetYearsEgp = 0;
  for (const po of ledger.purchaseOrders) {
    const value = poEgp(ledger, po);
    if (value === null || !po.capitalizationStart || !po.capitalizationEnd) continue;
    const share = capitalizationByYear(value, po.capitalizationStart, po.capitalizationEnd)
      .find((slice) => slice.year === year)?.amountEgp ?? 0;
    capitalizationEgp += share;
    if (po.budgetYear !== year) capitalizationFromOtherBudgetYearsEgp += share;
  }

  const yearPos = ledger.purchaseOrders.filter((po) => po.budgetYear === year);
  const purchaseOrders = yearPos.map((po) => poRow(ledger, po, year));
  const contracted = purchaseOrders.filter((po) => po.contractEgp !== null);
  const cashedOutEgp = contracted.reduce((sum, po) => sum + po.cashedOutEgp, 0);
  const remainingCashOutEgp = contracted.reduce((sum, po) => sum + (po.remainingEgp ?? 0), 0);
  const committedEgp = contracted.reduce((sum, po) => sum + (po.contractEgp ?? 0), 0);
  const approvedEgp = ledger.budgetLines
    .filter((line) => line.year === year)
    .reduce((sum, line) => sum + money(ledger, line.amount, line.currency, line.year), 0);

  return {
    year,
    submittedInvoicesEgp,
    inProgressIecs: {
      count: inProgressIecsList.length,
      egp: inProgressIecsList.reduce((sum, iec) => sum + money(ledger, iec.requestedAmount, iec.currency, iec.year), 0),
    },
    inProgressPrs: {
      count: inProgressPrsList.length,
      egp: inProgressPrsList.reduce((sum, pr) => sum + money(ledger, pr.amount, pr.currency, pr.year), 0),
    },
    capitalizationEgp,
    capitalizationFromOtherBudgetYearsEgp,
    cashedOutEgp,
    remainingCashOutEgp,
    cashedOutPercentage: committedEgp > 0 ? cashedOutEgp / committedEgp : null,
    approvedEgp,
    committedEgp,
    uncommittedEgp: approvedEgp - committedEgp,
    overrunEgp: Math.max(0, committedEgp - approvedEgp),
    purchaseOrders,
    pipelineIecs: inProgressIecsList.map((iec) => ({
      id: iec.id,
      title: iec.title,
      egp: money(ledger, iec.requestedAmount, iec.currency, iec.year),
      tier: iecTier(money(ledger, iec.requestedAmount, iec.currency, iec.year)),
    })),
    pipelinePrs: inProgressPrsList.map((pr) => ({
      id: pr.id,
      title: pr.title,
      egp: money(ledger, pr.amount, pr.currency, pr.year),
    })),
  };
}

function poRow(ledger: Ledger, po: PurchaseOrder, year: number) {
  const contractEgp = poEgp(ledger, po);
  const invoices = ledger.invoices
    .filter((invoice) => invoice.purchaseOrderId === po.id)
    .map((invoice) => invoiceView(ledger, po, invoice, contractEgp));
  const summary = contractEgp === null
    ? null
    : cashOutSummary(contractEgp, invoices.map((invoice) => ({ amountEgp: invoice.amountEgp, cashedOut: invoice.cashedOut })));
  const shares = contractEgp !== null && po.capitalizationStart && po.capitalizationEnd
    ? capitalizationByYear(contractEgp, po.capitalizationStart, po.capitalizationEnd)
    : null;
  const thisYearCapitalizationEgp = shares?.find((slice) => slice.year === year)?.amountEgp ?? (shares ? 0 : null);
  const otherYearsCapitalizationEgp = shares
    ? shares.filter((slice) => slice.year !== year).reduce((sum, slice) => sum + slice.amountEgp, 0)
    : null;
  return {
    id: po.id,
    number: po.number,
    supplier: po.supplier,
    contractEgp,
    cashedOutEgp: summary?.cashedOutEgp ?? 0,
    remainingEgp: summary?.remainingEgp ?? null,
    percentage: summary?.percentage ?? null,
    thisYearCapitalizationEgp,
    otherYearsCapitalizationEgp,
    incomplete: contractEgp === null || !po.capitalizationStart || !po.capitalizationEnd,
    overContract: contractEgp !== null && invoices.reduce((sum, invoice) => sum + invoice.amountEgp, 0) > contractEgp,
    invoices,
    months: shares === null || !po.capitalizationStart || !po.capitalizationEnd
      ? []
      : monthRows(contractEgp!, po),
  };
}

function monthRows(contractEgp: number, po: PurchaseOrder) {
  const months = monthsInclusive(po.capitalizationStart!, po.capitalizationEnd!);
  const share = contractEgp / months.length;
  return months.map((month) => ({ ...month, amountEgp: share }));
}

function invoiceView(ledger: Ledger, po: PurchaseOrder, invoice: Invoice, contractEgp: number | null) {
  const amountEgp = money(ledger, invoice.amount, invoice.currency, po.budgetYear);
  const cashedOut = isCashedOut(invoice.receiptNumber, invoice.facReference);
  const otherCashedOutEgp = ledger.invoices
    .filter((item) => item.purchaseOrderId === po.id && item.id !== invoice.id && isCashedOut(item.receiptNumber, item.facReference))
    .reduce((sum, item) => sum + money(ledger, item.amount, item.currency, po.budgetYear), 0);
  return {
    id: invoice.id,
    amountEgp,
    submissionDate: invoice.submissionDate,
    description: invoice.description,
    cashedOut,
    receiptNumber: invoice.receiptNumber,
    facReference: invoice.facReference,
    overRemaining: contractEgp !== null && invoiceOverRemaining(amountEgp, contractEgp, otherCashedOutEgp),
  };
}
