import type { Currency, Invoice, PurchaseOrder } from "../domain/types.js";

export type ConsumptionRow = {
  poNumber: string;
  supplier: string;
  description: string;
  invoiceAmount: number;
  currency: Currency;
  submissionDate: string;
};

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function invoiceKey(poNumber: string, amount: number, submissionDate: string): string {
  return `${poNumber}|${roundMoney(amount)}|${submissionDate}`;
}

export function importConsumption(
  rows: ConsumptionRow[],
  existing: { purchaseOrders: PurchaseOrder[]; invoices: Invoice[] },
) {
  const purchaseOrders = [...existing.purchaseOrders];
  const invoices = [...existing.invoices];
  const createdOrders: PurchaseOrder[] = [];
  const createdInvoices: Invoice[] = [];
  const poByNumber = new Map(purchaseOrders.map((po) => [po.number, po]));
  const seen = new Set(
    invoices.map((invoice) => {
      const po = purchaseOrders.find((item) => item.id === invoice.purchaseOrderId);
      return invoiceKey(po?.number ?? "", invoice.amount, invoice.submissionDate);
    }),
  );

  for (const row of rows) {
    const amount = roundMoney(row.invoiceAmount);
    const key = invoiceKey(row.poNumber, amount, row.submissionDate);
    if (seen.has(key)) continue;
    seen.add(key);
    let po = poByNumber.get(row.poNumber);
    if (!po) {
      po = {
        id: `po-${row.poNumber}`,
        number: row.poNumber,
        budgetYear: 2026,
        supplier: row.supplier,
        description: row.description,
        contractAmount: null,
        currency: null,
        kind: "capex",
        budgetLineId: null,
        capitalizationStart: null,
        capitalizationEnd: null,
      };
      poByNumber.set(po.number, po);
      purchaseOrders.push(po);
      createdOrders.push(po);
    }
    const invoice: Invoice = {
      id: `inv-${key}`,
      purchaseOrderId: po.id,
      amount,
      currency: row.currency,
      submissionDate: row.submissionDate,
      description: row.description,
      receiptNumber: null,
      facReference: null,
    };
    invoices.push(invoice);
    createdInvoices.push(invoice);
  }

  return { purchaseOrders: createdOrders, invoices: createdInvoices };
}
