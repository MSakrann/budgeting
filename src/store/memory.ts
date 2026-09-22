import {
  validateAmount,
  validateCurrency,
  validateInvoiceDocuments,
  validatePeriod,
} from "../domain/validate.js";
import type {
  BudgetLine,
  Currency,
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

function assertMoney(
  amount: number | null,
  currency: Currency | null,
  rates: YearRates | undefined,
): void {
  assertOk(validateAmount(amount));
  if (currency !== null) assertOk(validateCurrency(currency, rates));
}

function assertBudgetLine(input: Omit<BudgetLine, "id">, rates: YearRates | undefined): void {
  assertMoney(input.amount, input.currency, rates);
}

function assertPurchaseRequest(input: Omit<PurchaseRequest, "id">, rates: YearRates | undefined): void {
  assertMoney(input.amount, input.currency, rates);
}

function assertIec(input: Omit<Iec, "id">, rates: YearRates | undefined): void {
  assertOk(validateAmount(input.budgetAmount));
  assertOk(validateAmount(input.requestedAmount));
  assertOk(validateCurrency(input.currency, rates));
}

function assertPurchaseOrder(input: Omit<PurchaseOrder, "id">, rates: YearRates | undefined): void {
  assertOk(validatePeriod(input.capitalizationStart, input.capitalizationEnd));
  assertMoney(input.contractAmount, input.currency, rates);
}

function assertInvoice(input: Omit<Invoice, "id">, rates: YearRates | undefined): void {
  assertOk(validateInvoiceDocuments(input.receiptNumber, input.facReference));
  assertMoney(input.amount, input.currency, rates);
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

  function requireBudgetLine(id: string | null): void {
    if (id === null) return;
    if (!budgetLines.some((r) => r.id === id)) {
      throw new Error("Budget line reference does not exist");
    }
  }

  function requirePurchaseRequest(id: string | null): void {
    if (id === null) return;
    if (!purchaseRequests.some((r) => r.id === id)) {
      throw new Error("Purchase request reference does not exist");
    }
  }

  function requirePurchaseOrder(id: string): PurchaseOrder {
    const po = purchaseOrders.find((r) => r.id === id);
    if (!po) throw new Error("Purchase order reference does not exist");
    return po;
  }

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
      assertBudgetLine(input, ratesForYear(rates, input.year));
      const row: BudgetLine = { id: crypto.randomUUID(), ...input };
      budgetLines.push(row);
      return row;
    },

    async updateBudgetLine(id, input) {
      assertBudgetLine(input, ratesForYear(rates, input.year));
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
      assertPurchaseRequest(input, ratesForYear(rates, input.year));
      requireBudgetLine(input.budgetLineId);
      const row: PurchaseRequest = { id: crypto.randomUUID(), ...input };
      purchaseRequests.push(row);
      return row;
    },

    async updatePurchaseRequest(id, input) {
      assertPurchaseRequest(input, ratesForYear(rates, input.year));
      requireBudgetLine(input.budgetLineId);
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
      assertIec(input, ratesForYear(rates, input.year));
      requirePurchaseRequest(input.purchaseRequestId);
      const row: Iec = { id: crypto.randomUUID(), ...input };
      iecs.push(row);
      return row;
    },

    async updateIec(id, input) {
      assertIec(input, ratesForYear(rates, input.year));
      requirePurchaseRequest(input.purchaseRequestId);
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
      assertPurchaseOrder(input, ratesForYear(rates, input.budgetYear));
      requireBudgetLine(input.budgetLineId);
      if (purchaseOrders.some((r) => r.number === input.number)) {
        throw new Error("Purchase order number already exists");
      }
      const row: PurchaseOrder = { id: crypto.randomUUID(), ...input };
      purchaseOrders.push(row);
      return row;
    },

    async updatePurchaseOrder(id, input) {
      assertPurchaseOrder(input, ratesForYear(rates, input.budgetYear));
      requireBudgetLine(input.budgetLineId);
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
      const po = requirePurchaseOrder(input.purchaseOrderId);
      assertInvoice(input, ratesForYear(rates, po.budgetYear));
      const row: Invoice = { id: crypto.randomUUID(), ...input };
      invoices.push(row);
      return row;
    },

    async updateInvoice(id, input) {
      const po = requirePurchaseOrder(input.purchaseOrderId);
      assertInvoice(input, ratesForYear(rates, po.budgetYear));
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
