import {
  validateAmount,
  validateCurrency,
  validateInvoiceDocuments,
  validatePeriod,
} from "../domain/validate.js";
import type {
  BudgetLine,
  Iec,
  Invoice,
  Ledger,
  PurchaseOrder,
  PurchaseRequest,
  YearRates,
} from "../domain/types.js";
import type { Store, User } from "./types.js";

function assertOk(message: string | null): void {
  if (message) throw new Error(message);
}

function ratesForYear(rates: YearRates[], year: number): YearRates | undefined {
  return rates.find((r) => r.year === year);
}

function submissionYear(date: string): number {
  return Number(date.slice(0, 4));
}

function assertInvoice(input: Omit<Invoice, "id">, rates: YearRates[]): void {
  assertOk(validateInvoiceDocuments(input.receiptNumber, input.facReference));
  assertOk(validateAmount(input.amount));
  assertOk(validateCurrency(input.currency, ratesForYear(rates, submissionYear(input.submissionDate))));
}

function assertPurchaseOrder(input: Omit<PurchaseOrder, "id">): void {
  assertOk(validatePeriod(input.capitalizationStart, input.capitalizationEnd));
  assertOk(validateAmount(input.contractAmount));
}

function inUse(): never {
  throw new Error("in use");
}

export function createMemoryStore(): Store {
  const users: User[] = [];
  const rates: YearRates[] = [];
  const budgetLines: BudgetLine[] = [];
  const purchaseRequests: PurchaseRequest[] = [];
  const iecs: Iec[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const invoices: Invoice[] = [];
  const imports = new Set<string>();

  return {
    async findUserByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },

    async ensureUser(input) {
      const existing = users.find((u) => u.email === input.email);
      if (existing) return existing;
      const user: User = { id: crypto.randomUUID(), ...input };
      users.push(user);
      return user;
    },

    async upsertRates(input) {
      const index = rates.findIndex((r) => r.year === input.year);
      if (index >= 0) rates[index] = input;
      else rates.push(input);
      return input;
    },

    async loadLedger(): Promise<Ledger> {
      return {
        rates: [...rates],
        budgetLines: [...budgetLines],
        purchaseRequests: [...purchaseRequests],
        iecs: [...iecs],
        purchaseOrders: [...purchaseOrders],
        invoices: [...invoices],
      };
    },

    async hasImport(key) {
      return imports.has(key);
    },

    async markImport(key) {
      imports.add(key);
    },

    async createBudgetLine(input) {
      const row: BudgetLine = { id: crypto.randomUUID(), ...input };
      budgetLines.push(row);
      return row;
    },

    async updateBudgetLine(id, input) {
      const index = budgetLines.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("not found");
      const row: BudgetLine = { id, ...input };
      budgetLines[index] = row;
      return row;
    },

    async deleteBudgetLine(id) {
      const referenced =
        purchaseRequests.some((r) => r.budgetLineId === id) ||
        purchaseOrders.some((r) => r.budgetLineId === id);
      if (referenced) inUse();
      const index = budgetLines.findIndex((r) => r.id === id);
      if (index >= 0) budgetLines.splice(index, 1);
    },

    async createPurchaseRequest(input) {
      const row: PurchaseRequest = { id: crypto.randomUUID(), ...input };
      purchaseRequests.push(row);
      return row;
    },

    async updatePurchaseRequest(id, input) {
      const index = purchaseRequests.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("not found");
      const row: PurchaseRequest = { id, ...input };
      purchaseRequests[index] = row;
      return row;
    },

    async deletePurchaseRequest(id) {
      if (iecs.some((r) => r.purchaseRequestId === id)) inUse();
      const index = purchaseRequests.findIndex((r) => r.id === id);
      if (index >= 0) purchaseRequests.splice(index, 1);
    },

    async createIec(input) {
      const row: Iec = { id: crypto.randomUUID(), ...input };
      iecs.push(row);
      return row;
    },

    async updateIec(id, input) {
      const index = iecs.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("not found");
      const row: Iec = { id, ...input };
      iecs[index] = row;
      return row;
    },

    async deleteIec(id) {
      const index = iecs.findIndex((r) => r.id === id);
      if (index >= 0) iecs.splice(index, 1);
    },

    async createPurchaseOrder(input) {
      assertPurchaseOrder(input);
      if (purchaseOrders.some((r) => r.number === input.number)) {
        throw new Error("Purchase order number already exists");
      }
      const row: PurchaseOrder = { id: crypto.randomUUID(), ...input };
      purchaseOrders.push(row);
      return row;
    },

    async updatePurchaseOrder(id, input) {
      assertPurchaseOrder(input);
      if (purchaseOrders.some((r) => r.number === input.number && r.id !== id)) {
        throw new Error("Purchase order number already exists");
      }
      const index = purchaseOrders.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("not found");
      const row: PurchaseOrder = { id, ...input };
      purchaseOrders[index] = row;
      return row;
    },

    async deletePurchaseOrder(id) {
      if (invoices.some((r) => r.purchaseOrderId === id)) inUse();
      const index = purchaseOrders.findIndex((r) => r.id === id);
      if (index >= 0) purchaseOrders.splice(index, 1);
    },

    async createInvoice(input) {
      assertInvoice(input, rates);
      const row: Invoice = { id: crypto.randomUUID(), ...input };
      invoices.push(row);
      return row;
    },

    async updateInvoice(id, input) {
      assertInvoice(input, rates);
      const index = invoices.findIndex((r) => r.id === id);
      if (index < 0) throw new Error("not found");
      const row: Invoice = { id, ...input };
      invoices[index] = row;
      return row;
    },

    async deleteInvoice(id) {
      const index = invoices.findIndex((r) => r.id === id);
      if (index >= 0) invoices.splice(index, 1);
    },
  };
}
