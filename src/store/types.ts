import type {
  BudgetLine,
  Iec,
  Invoice,
  Ledger,
  PurchaseOrder,
  PurchaseRequest,
  YearMonth,
  YearRates,
} from "../domain/types.js";

export type UserRole = "editor" | "viewer";
export type User = { id: string; email: string; name: string; role: UserRole; passwordHash: string };

type New<T extends { id: string }> = Omit<T, "id">;

export interface Store {
  findUserByEmail(email: string): Promise<User | null>;
  ensureUser(user: New<User>): Promise<User>;
  upsertRates(rates: YearRates): Promise<YearRates>;
  loadLedger(): Promise<Ledger>;
  hasImport(key: string): Promise<boolean>;
  markImport(key: string): Promise<void>;
  createBudgetLine(input: New<BudgetLine>): Promise<BudgetLine>;
  updateBudgetLine(id: string, input: New<BudgetLine>): Promise<BudgetLine>;
  deleteBudgetLine(id: string): Promise<void>;
  createPurchaseRequest(input: New<PurchaseRequest>): Promise<PurchaseRequest>;
  updatePurchaseRequest(id: string, input: New<PurchaseRequest>): Promise<PurchaseRequest>;
  deletePurchaseRequest(id: string): Promise<void>;
  createIec(input: New<Iec>): Promise<Iec>;
  updateIec(id: string, input: New<Iec>): Promise<Iec>;
  deleteIec(id: string): Promise<void>;
  createPurchaseOrder(input: New<PurchaseOrder>): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, input: New<PurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: string): Promise<void>;
  createInvoice(input: New<Invoice>): Promise<Invoice>;
  updateInvoice(id: string, input: New<Invoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
}

export type { YearMonth };
