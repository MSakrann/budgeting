export const CURRENCIES = ["EGP", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const STATUSES = ["Draft", "In progress", "Approved", "Rejected", "Closed"] as const;
export type RecordStatus = (typeof STATUSES)[number];

export type SpendKind = "capex" | "opex";

export type YearRates = { year: number; usdToEgp: number; eurToEgp: number };

export type YearMonth = { year: number; month: number };

export type BudgetLine = {
  id: string;
  year: number;
  projectTitle: string;
  kind: SpendKind;
  currency: Currency;
  amount: number;
};

export type PurchaseRequest = {
  id: string;
  title: string;
  year: number;
  amount: number;
  currency: Currency;
  budgetLineId: string | null;
  status: RecordStatus;
};

export type Iec = {
  id: string;
  title: string;
  year: number;
  projectCode: string;
  supplier: string | null;
  kind: SpendKind;
  currency: Currency;
  budgetAmount: number;
  requestedAmount: number;
  note: string | null;
  purchaseRequestId: string | null;
  status: RecordStatus;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  budgetYear: number;
  supplier: string;
  description: string;
  contractAmount: number | null;
  currency: Currency | null;
  kind: SpendKind;
  budgetLineId: string | null;
  capitalizationStart: YearMonth | null;
  capitalizationEnd: YearMonth | null;
};

export type Invoice = {
  id: string;
  purchaseOrderId: string;
  amount: number;
  currency: Currency;
  submissionDate: string;
  description: string | null;
  receiptNumber: string | null;
  facReference: string | null;
};

export type Ledger = {
  rates: YearRates[];
  budgetLines: BudgetLine[];
  purchaseRequests: PurchaseRequest[];
  iecs: Iec[];
  purchaseOrders: PurchaseOrder[];
  invoices: Invoice[];
};
