import { eq } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PGlite } from "@electric-sql/pglite";
import type postgres from "postgres";
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
  PurchaseOrder,
  PurchaseRequest,
  RecordStatus,
  SpendKind,
  YearMonth,
  YearRates,
} from "../domain/types.js";
import type { Store, User, UserRole } from "../store/types.js";
import {
  CREATE_TABLES_SQL,
  budgetLines,
  iecs,
  imports,
  invoices,
  purchaseOrders,
  purchaseRequests,
  schema,
  users,
  yearRates,
} from "./schema.js";

type Sql = ReturnType<typeof postgres>;
type DbClient = PGlite | Sql;

type Db =
  | ReturnType<typeof drizzlePglite<typeof schema>>
  | ReturnType<typeof drizzlePostgres<typeof schema>>;

function isPGlite(client: DbClient): client is PGlite {
  return typeof client === "object" && client !== null && typeof (client as PGlite).exec === "function";
}

function assertOk(message: string | null): void {
  if (message) throw new Error(message);
}

function assertMoney(
  amount: number | null,
  currency: Currency | null,
  rates: YearRates | undefined,
): void {
  assertOk(validateAmount(amount));
  if (currency !== null) assertOk(validateCurrency(currency, rates));
}

function assertBudgetLineInput(input: Omit<BudgetLine, "id">, rates: YearRates | undefined): void {
  assertMoney(input.amount, input.currency, rates);
}

function assertPurchaseRequestInput(
  input: Omit<PurchaseRequest, "id">,
  rates: YearRates | undefined,
): void {
  assertMoney(input.amount, input.currency, rates);
}

function assertIecInput(input: Omit<Iec, "id">, rates: YearRates | undefined): void {
  assertOk(validateAmount(input.budgetAmount));
  assertOk(validateAmount(input.requestedAmount));
  assertOk(validateCurrency(input.currency, rates));
}

function assertPurchaseOrderInput(
  input: Omit<PurchaseOrder, "id">,
  rates: YearRates | undefined,
): void {
  assertOk(validatePeriod(input.capitalizationStart, input.capitalizationEnd));
  assertMoney(input.contractAmount, input.currency, rates);
}

function assertInvoiceInput(input: Omit<Invoice, "id">, rates: YearRates | undefined): void {
  assertOk(validateInvoiceDocuments(input.receiptNumber, input.facReference));
  assertMoney(input.amount, input.currency, rates);
}

function capFields(input: Omit<PurchaseOrder, "id">) {
  return {
    capStartYear: input.capitalizationStart?.year ?? null,
    capStartMonth: input.capitalizationStart?.month ?? null,
    capEndYear: input.capitalizationEnd?.year ?? null,
    capEndMonth: input.capitalizationEnd?.month ?? null,
  };
}

function toYearMonth(year: number | null, month: number | null): YearMonth | null {
  if (year == null || month == null) return null;
  return { year, month };
}

function mapUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    passwordHash: row.passwordHash,
  };
}

function mapBudgetLine(row: typeof budgetLines.$inferSelect): BudgetLine {
  return {
    id: row.id,
    year: row.year,
    projectTitle: row.projectTitle,
    kind: row.kind as SpendKind,
    currency: row.currency as Currency,
    amount: row.amount,
  };
}

function mapPurchaseRequest(row: typeof purchaseRequests.$inferSelect): PurchaseRequest {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    amount: row.amount,
    currency: row.currency as Currency,
    budgetLineId: row.budgetLineId,
    status: row.status as RecordStatus,
  };
}

function mapIec(row: typeof iecs.$inferSelect): Iec {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    projectCode: row.projectCode,
    supplier: row.supplier,
    kind: row.kind as SpendKind,
    currency: row.currency as Currency,
    budgetAmount: row.budgetAmount,
    requestedAmount: row.requestedAmount,
    note: row.note,
    purchaseRequestId: row.purchaseRequestId,
    status: row.status as RecordStatus,
  };
}

function mapPurchaseOrder(row: typeof purchaseOrders.$inferSelect): PurchaseOrder {
  return {
    id: row.id,
    number: row.number,
    budgetYear: row.budgetYear,
    supplier: row.supplier,
    description: row.description,
    contractAmount: row.contractAmount,
    currency: row.currency as Currency | null,
    kind: row.kind as SpendKind,
    budgetLineId: row.budgetLineId,
    capitalizationStart: toYearMonth(row.capStartYear, row.capStartMonth),
    capitalizationEnd: toYearMonth(row.capEndYear, row.capEndMonth),
  };
}

function mapInvoice(row: typeof invoices.$inferSelect): Invoice {
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    amount: row.amount,
    currency: row.currency as Currency,
    submissionDate: row.submissionDate,
    description: row.description,
    receiptNumber: row.receiptNumber,
    facReference: row.facReference,
  };
}

function mapRates(row: typeof yearRates.$inferSelect): YearRates {
  return { year: row.year, usdToEgp: row.usdToEgp, eurToEgp: row.eurToEgp };
}

async function ratesForYear(db: Db, year: number): Promise<YearRates | undefined> {
  const rows = await db.select().from(yearRates).where(eq(yearRates.year, year));
  return rows[0] ? mapRates(rows[0]) : undefined;
}

function isForeignKeyViolation(err: unknown): boolean {
  const walk = (value: unknown, depth = 0): boolean => {
    if (!value || depth > 4) return false;
    if (typeof value === "object") {
      const record = value as { code?: string; message?: string; cause?: unknown };
      if (record.code === "23503") return true;
      if (typeof record.message === "string" && /foreign key/i.test(record.message)) return true;
      if (walk(record.cause, depth + 1)) return true;
    }
    return typeof value === "string" && /foreign key/i.test(value);
  };
  return walk(err);
}

async function withFkGuard<T>(kind: "write" | "delete", fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      if (kind === "delete") throw new Error("in use");
      throw new Error("reference does not exist");
    }
    throw err;
  }
}

function buildStore(db: Db): Store {
  async function requireBudgetLine(id: string | null): Promise<void> {
    if (id === null) return;
    const rows = await db.select().from(budgetLines).where(eq(budgetLines.id, id));
    if (!rows[0]) throw new Error("Budget line reference does not exist");
  }

  async function requirePurchaseRequest(id: string | null): Promise<void> {
    if (id === null) return;
    const rows = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id));
    if (!rows[0]) throw new Error("Purchase request reference does not exist");
  }

  async function requirePurchaseOrder(id: string): Promise<PurchaseOrder> {
    const rows = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    if (!rows[0]) throw new Error("Purchase order reference does not exist");
    return mapPurchaseOrder(rows[0]);
  }

  return {
    async findUserByEmail(email) {
      const rows = await db.select().from(users).where(eq(users.email, email));
      return rows[0] ? mapUser(rows[0]) : null;
    },

    async ensureUser(input) {
      const existing = await db.select().from(users).where(eq(users.email, input.email));
      if (existing[0]) return mapUser(existing[0]);
      const row = {
        id: crypto.randomUUID(),
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash: input.passwordHash,
      };
      await db.insert(users).values(row);
      return mapUser(row);
    },

    async upsertRates(input) {
      const existing = await db.select().from(yearRates).where(eq(yearRates.year, input.year));
      if (existing[0]) {
        await db
          .update(yearRates)
          .set({ usdToEgp: input.usdToEgp, eurToEgp: input.eurToEgp })
          .where(eq(yearRates.year, input.year));
      } else {
        await db.insert(yearRates).values({
          year: input.year,
          usdToEgp: input.usdToEgp,
          eurToEgp: input.eurToEgp,
        });
      }
      return input;
    },

    async loadLedger() {
      const [rateRows, lineRows, prRows, iecRows, poRows, invoiceRows] = await Promise.all([
        db.select().from(yearRates),
        db.select().from(budgetLines),
        db.select().from(purchaseRequests),
        db.select().from(iecs),
        db.select().from(purchaseOrders),
        db.select().from(invoices),
      ]);
      return {
        rates: rateRows.map(mapRates),
        budgetLines: lineRows.map(mapBudgetLine),
        purchaseRequests: prRows.map(mapPurchaseRequest),
        iecs: iecRows.map(mapIec),
        purchaseOrders: poRows.map(mapPurchaseOrder),
        invoices: invoiceRows.map(mapInvoice),
      };
    },

    async hasImport(key) {
      const rows = await db.select().from(imports).where(eq(imports.key, key));
      return rows.length > 0;
    },

    async markImport(key) {
      const existing = await db.select().from(imports).where(eq(imports.key, key));
      if (existing.length === 0) await db.insert(imports).values({ key });
    },

    async createBudgetLine(input) {
      assertBudgetLineInput(input, await ratesForYear(db, input.year));
      const row = { id: crypto.randomUUID(), ...input };
      await db.insert(budgetLines).values(row);
      return row;
    },

    async updateBudgetLine(id, input) {
      assertBudgetLineInput(input, await ratesForYear(db, input.year));
      const result = await db.update(budgetLines).set(input).where(eq(budgetLines.id, id)).returning();
      if (!result[0]) throw new Error("not found");
      return mapBudgetLine(result[0]);
    },

    async deleteBudgetLine(id) {
      const [prRefs, poRefs] = await Promise.all([
        db.select().from(purchaseRequests).where(eq(purchaseRequests.budgetLineId, id)),
        db.select().from(purchaseOrders).where(eq(purchaseOrders.budgetLineId, id)),
      ]);
      if (prRefs.length > 0 || poRefs.length > 0) throw new Error("in use");
      await withFkGuard("delete", async () => {
        await db.delete(budgetLines).where(eq(budgetLines.id, id));
      });
    },

    async createPurchaseRequest(input) {
      assertPurchaseRequestInput(input, await ratesForYear(db, input.year));
      await requireBudgetLine(input.budgetLineId);
      const row = { id: crypto.randomUUID(), ...input };
      await withFkGuard("write", async () => {
        await db.insert(purchaseRequests).values(row);
      });
      return row;
    },

    async updatePurchaseRequest(id, input) {
      assertPurchaseRequestInput(input, await ratesForYear(db, input.year));
      await requireBudgetLine(input.budgetLineId);
      const result = await withFkGuard("write", async () =>
        await db.update(purchaseRequests).set(input).where(eq(purchaseRequests.id, id)).returning(),
      );
      if (!result[0]) throw new Error("not found");
      return mapPurchaseRequest(result[0]);
    },

    async deletePurchaseRequest(id) {
      const refs = await db.select().from(iecs).where(eq(iecs.purchaseRequestId, id));
      if (refs.length > 0) throw new Error("in use");
      await withFkGuard("delete", async () => {
        await db.delete(purchaseRequests).where(eq(purchaseRequests.id, id));
      });
    },

    async createIec(input) {
      assertIecInput(input, await ratesForYear(db, input.year));
      await requirePurchaseRequest(input.purchaseRequestId);
      const row = { id: crypto.randomUUID(), ...input };
      await withFkGuard("write", async () => {
        await db.insert(iecs).values(row);
      });
      return row;
    },

    async updateIec(id, input) {
      assertIecInput(input, await ratesForYear(db, input.year));
      await requirePurchaseRequest(input.purchaseRequestId);
      const result = await withFkGuard("write", async () =>
        await db.update(iecs).set(input).where(eq(iecs.id, id)).returning(),
      );
      if (!result[0]) throw new Error("not found");
      return mapIec(result[0]);
    },

    async deleteIec(id) {
      await db.delete(iecs).where(eq(iecs.id, id));
    },

    async createPurchaseOrder(input) {
      assertPurchaseOrderInput(input, await ratesForYear(db, input.budgetYear));
      await requireBudgetLine(input.budgetLineId);
      const existing = await db.select().from(purchaseOrders).where(eq(purchaseOrders.number, input.number));
      if (existing.length > 0) throw new Error("Purchase order number already exists");
      const id = crypto.randomUUID();
      await withFkGuard("write", async () => {
        await db.insert(purchaseOrders).values({
          id,
          number: input.number,
          budgetYear: input.budgetYear,
          supplier: input.supplier,
          description: input.description,
          contractAmount: input.contractAmount,
          currency: input.currency,
          kind: input.kind,
          budgetLineId: input.budgetLineId,
          ...capFields(input),
        });
      });
      return { id, ...input };
    },

    async updatePurchaseOrder(id, input) {
      assertPurchaseOrderInput(input, await ratesForYear(db, input.budgetYear));
      await requireBudgetLine(input.budgetLineId);
      const duplicates = await db.select().from(purchaseOrders).where(eq(purchaseOrders.number, input.number));
      if (duplicates.some((row) => row.id !== id)) {
        throw new Error("Purchase order number already exists");
      }
      const result = await withFkGuard("write", async () =>
        await db
          .update(purchaseOrders)
          .set({
            number: input.number,
            budgetYear: input.budgetYear,
            supplier: input.supplier,
            description: input.description,
            contractAmount: input.contractAmount,
            currency: input.currency,
            kind: input.kind,
            budgetLineId: input.budgetLineId,
            ...capFields(input),
          })
          .where(eq(purchaseOrders.id, id))
          .returning(),
      );
      if (!result[0]) throw new Error("not found");
      return mapPurchaseOrder(result[0]);
    },

    async deletePurchaseOrder(id) {
      const refs = await db.select().from(invoices).where(eq(invoices.purchaseOrderId, id));
      if (refs.length > 0) throw new Error("in use");
      await withFkGuard("delete", async () => {
        await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
      });
    },

    async createInvoice(input) {
      const po = await requirePurchaseOrder(input.purchaseOrderId);
      assertInvoiceInput(input, await ratesForYear(db, po.budgetYear));
      const row = { id: crypto.randomUUID(), ...input };
      await withFkGuard("write", async () => {
        await db.insert(invoices).values(row);
      });
      return row;
    },

    async updateInvoice(id, input) {
      const po = await requirePurchaseOrder(input.purchaseOrderId);
      assertInvoiceInput(input, await ratesForYear(db, po.budgetYear));
      const result = await withFkGuard("write", async () =>
        await db.update(invoices).set(input).where(eq(invoices.id, id)).returning(),
      );
      if (!result[0]) throw new Error("not found");
      return mapInvoice(result[0]);
    },

    async deleteInvoice(id) {
      await db.delete(invoices).where(eq(invoices.id, id));
    },
  };
}

async function ensureTables(client: DbClient): Promise<void> {
  if (isPGlite(client)) {
    await client.exec(CREATE_TABLES_SQL);
    return;
  }
  const statements = CREATE_TABLES_SQL.split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await client.unsafe(`${statement};`);
  }
}

export async function createPostgresStore(client: DbClient): Promise<Store> {
  await ensureTables(client);
  if (isPGlite(client)) {
    return buildStore(drizzlePglite(client, { schema }));
  }
  return buildStore(drizzlePostgres(client, { schema }));
}
