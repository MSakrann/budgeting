# Data Lake Budget Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private shared web app where two editors track Data Lake budget lines, PRs, IECs, POs, and invoices, and the CTO sees a presentable year dashboard.

**Architecture:** Pure TypeScript domain functions compute every headline from a ledger. A Hono server persists that ledger in Postgres, enforces editor versus viewer access, and serves a Vite React client. Docker Compose is the private deployment both work laptops open.

**Tech Stack:** Node 22, TypeScript, Vitest, Hono, Drizzle ORM, PostgreSQL 16, PGlite for repository tests, React 19, Vite, ExcelJS.

## Global Constraints

- Dashboard figures are EGP. Stored amounts keep their currency (`EGP`, `USD`, or `EUR`).
- 2026 rates start at USD `52.6` and EUR `61`. EGP rate is always `1`.
- EGP value = amount × that year’s rate. USD or EUR cannot be saved until that year’s rate exists.
- Invoice EGP uses the PO’s budget-year rate. Budget line, PR, and IEC use the year on that record.
- Mini IEC means requested amount below `2,000,000` EGP. `2,000,000` EGP and above is a full IEC.
- PR and IEC statuses are exactly `Draft`, `In progress`, `Approved`, `Rejected`, `Closed`. Only `In progress` is in the in-progress totals. Those totals ignore the year switcher.
- Capitalization counts every calendar month from start through end, including both. Each month gets `PO EGP / number of months`.
- March 2026–September 2026 is 7 months, all in 2026. June 2026–June 2027 is 13 months: `7/13` in 2026 and `6/13` in 2027.
- An invoice is cashed out only when both the Oracle receipt number and the FAC reference are non-empty. One without the other is rejected. Both empty means submitted only.
- Cashed-out percentage = cashed-out EGP / PO EGP. Remaining = PO EGP − cashed-out EGP. Submitted-only invoices do not count as cashed out.
- Cash-out totals include POs whose budget year is the selected year and whose contract amount is filled in.
- Capitalization for a year includes every PO whose period overlaps that year, including a different budget year.
- A PO missing a contract amount or a capitalization month is excluded from capitalization and from committed value, and shown as incomplete.
- An invoice EGP greater than remaining cash-out (computed without that invoice) is saved and flagged. A PO is marked over the contract when the sum of its invoice EGP exceeds its contract EGP.
- Uncommitted = approved − committed. When committed is greater than approved, show that difference as an overrun.
- Three accounts: two editors and one viewer. The viewer can open the dashboard and cannot create, update, or delete.
- Headlines are computed on read. There is no stored total.
- Import `references/Data - List of POs 2026.xlsx` sheet `Consumption per PO` once. A second run does not duplicate the same PO number, amount, and submission date. Imported invoices are not cashed out. Imported PO contract amounts and capitalization periods stay blank. The 2026 submitted total is `15,044,222.58` EGP.
- Do not generate Oracle PDFs, FAC documents, IEC decks, or the official capex and opex workbooks.
- Do not read Oracle.

## File structure

- `src/domain/types.ts` — shared record types
- `src/domain/money.ts` — currency conversion
- `src/domain/months.ts` — inclusive month ranges
- `src/domain/capitalization.ts` — yearly shares of a PO
- `src/domain/iec.ts` — mini versus full
- `src/domain/cash-out.ts` — cashed out, remaining, percentage, over-remaining flag
- `src/domain/validate.ts` — save rules
- `src/domain/dashboard.ts` — year dashboard from a ledger
- `src/import/consumption.ts` — idempotent row import
- `src/import/read-xlsx.ts` — Excel sheet to rows
- `src/store/types.ts` — `Store` interface
- `src/store/memory.ts` — in-memory store for HTTP tests
- `src/db/schema.ts` — Postgres tables
- `src/db/postgres-store.ts` — `Store` on Drizzle
- `src/auth/password.ts` — scrypt hashes
- `src/auth/session.ts` — signed cookie
- `src/http/app.ts` — Hono routes
- `src/server.ts` — listen, migrate, seed
- `src/seed.ts` — three users, 2026 rates, consumption import
- `client/` — login, dashboard, editor pages
- `tests/domain/` — calculation tests
- `tests/import/` — import tests
- `tests/http/app.test.ts` — auth and validation over HTTP
- `tests/db/postgres-store.test.ts` — schema and idempotent import
- `docker-compose.yml`, `Dockerfile` — private deployment

---

### Task 1: Project scaffold and money conversion

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/domain/types.ts`
- Create: `src/domain/money.ts`
- Test: `tests/domain/money.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Currency`, `YearRates`, `toEgp(amount: number, currency: Currency, rates: YearRates): number`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { toEgp } from "../../src/domain/money.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

describe("toEgp", () => {
  it("leaves EGP unchanged", () => {
    expect(toEgp(2_000_000, "EGP", rates)).toBe(2_000_000);
  });

  it("converts USD and EUR with the year rate", () => {
    expect(toEgp(10_000, "USD", rates)).toBe(526_000);
    expect(toEgp(1_000, "EUR", rates)).toBe(61_000);
  });

  it("refuses a non-positive rate", () => {
    expect(() => toEgp(1, "USD", { year: 2026, usdToEgp: 0, eurToEgp: 61 })).toThrow(
      /USD rate/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/money.test.ts`

Expected: FAIL with cannot find module `../../src/domain/money.js`

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "budget-tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "vite",
    "build": "vite build && tsc -p tsconfig.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "drizzle-orm": "^0.44.2",
    "exceljs": "^4.4.0",
    "hono": "^4.8.3",
    "postgres": "^3.4.7",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.3.3",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.6.0",
    "typescript": "^5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.2.4"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": ".",
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "client", "vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
```

`.gitignore`:

```
node_modules
dist
client/dist
.env
```

`src/domain/types.ts`:

```ts
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
```

`src/domain/money.ts`:

```ts
import type { Currency, YearRates } from "./types.js";

export function toEgp(amount: number, currency: Currency, rates: YearRates): number {
  if (currency === "EGP") return amount;
  const rate = currency === "USD" ? rates.usdToEgp : rates.eurToEgp;
  if (!(rate > 0)) throw new Error(`${currency} rate for ${rates.year} must be greater than 0`);
  return amount * rate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npx vitest run tests/domain/money.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/domain/types.ts src/domain/money.ts tests/domain/money.test.ts
git commit -m "feat: add EGP conversion for budget currencies"
```

---

### Task 2: Inclusive capitalization months

**Files:**
- Create: `src/domain/months.ts`
- Create: `src/domain/capitalization.ts`
- Test: `tests/domain/capitalization.test.ts`

**Interfaces:**
- Consumes: `YearMonth` from `src/domain/types.ts`
- Produces:
  - `monthsInclusive(start: YearMonth, end: YearMonth): YearMonth[]`
  - `periodIsOrdered(start: YearMonth, end: YearMonth): boolean`
  - `capitalizationInYear(poEgp: number, start: YearMonth, end: YearMonth, year: number): number`
  - `capitalizationByYear(poEgp: number, start: YearMonth, end: YearMonth): { year: number; amountEgp: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { capitalizationByYear, capitalizationInYear } from "../../src/domain/capitalization.js";

describe("capitalization", () => {
  it("puts March 2026 through September 2026 entirely in 2026", () => {
    const start = { year: 2026, month: 3 };
    const end = { year: 2026, month: 9 };
    expect(capitalizationInYear(700_000, start, end, 2026)).toBe(700_000);
    expect(capitalizationInYear(700_000, start, end, 2027)).toBe(0);
    expect(capitalizationByYear(700_000, start, end)).toEqual([
      { year: 2026, amountEgp: 700_000 },
    ]);
  });

  it("splits June 2026 through June 2027 into 7/13 and 6/13", () => {
    const start = { year: 2026, month: 6 };
    const end = { year: 2027, month: 6 };
    expect(capitalizationInYear(1_300_000, start, end, 2026)).toBe(700_000);
    expect(capitalizationInYear(1_300_000, start, end, 2027)).toBe(600_000);
  });

  it("rejects a period that ends before it starts", () => {
    expect(() =>
      capitalizationInYear(1, { year: 2026, month: 5 }, { year: 2026, month: 4 }, 2026),
    ).toThrow(/end month/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/capitalization.test.ts`

Expected: FAIL with cannot find module `../../src/domain/capitalization.js`

- [ ] **Step 3: Write minimal implementation**

`src/domain/months.ts`:

```ts
import type { YearMonth } from "./types.js";

export function periodIsOrdered(start: YearMonth, end: YearMonth): boolean {
  return end.year * 12 + end.month >= start.year * 12 + start.month;
}

export function monthsInclusive(start: YearMonth, end: YearMonth): YearMonth[] {
  if (!periodIsOrdered(start, end)) {
    throw new Error("Capitalization end month is before the start month");
  }
  const months: YearMonth[] = [];
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({ year, month });
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
```

`src/domain/capitalization.ts`:

```ts
import { monthsInclusive } from "./months.js";
import type { YearMonth } from "./types.js";

export function capitalizationByYear(poEgp: number, start: YearMonth, end: YearMonth) {
  const months = monthsInclusive(start, end);
  const share = poEgp / months.length;
  const byYear = new Map<number, number>();
  for (const month of months) byYear.set(month.year, (byYear.get(month.year) ?? 0) + share);
  return [...byYear.entries()].map(([year, amountEgp]) => ({ year, amountEgp }));
}

export function capitalizationInYear(
  poEgp: number,
  start: YearMonth,
  end: YearMonth,
  year: number,
): number {
  return capitalizationByYear(poEgp, start, end).find((slice) => slice.year === year)?.amountEgp ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/capitalization.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/months.ts src/domain/capitalization.ts tests/domain/capitalization.test.ts
git commit -m "feat: split PO capitalization evenly across inclusive months"
```

---

### Task 3: IEC tier and cash-out

**Files:**
- Create: `src/domain/iec.ts`
- Create: `src/domain/cash-out.ts`
- Test: `tests/domain/iec.test.ts`
- Test: `tests/domain/cash-out.test.ts`

**Interfaces:**
- Consumes: `toEgp`, `YearRates`, `Currency`
- Produces:
  - `MINI_IEC_BELOW_EGP = 2_000_000`
  - `iecTier(requestedEgp: number): "mini" | "full"`
  - `isCashedOut(receiptNumber: string | null, facReference: string | null): boolean`
  - `cashOutSummary(poEgp: number, invoices: { amountEgp: number; cashedOut: boolean }[]): { cashedOutEgp: number; remainingEgp: number; percentage: number }`
  - `invoiceOverRemaining(amountEgp: number, poEgp: number, otherCashedOutEgp: number): boolean`

- [ ] **Step 1: Write the failing tests**

`tests/domain/iec.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { iecTier } from "../../src/domain/iec.js";
import { toEgp } from "../../src/domain/money.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

describe("iecTier", () => {
  it("is mini below 2,000,000 EGP and full at 2,000,000", () => {
    expect(iecTier(1_999_999.99)).toBe("mini");
    expect(iecTier(2_000_000)).toBe("full");
  });

  it("converts USD before the test", () => {
    expect(iecTier(toEgp(10_000, "USD", rates))).toBe("mini");
    expect(iecTier(toEgp(40_000, "USD", rates))).toBe("full");
  });
});
```

`tests/domain/cash-out.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cashOutSummary, invoiceOverRemaining, isCashedOut } from "../../src/domain/cash-out.js";

describe("cash-out", () => {
  it("counts an invoice only when receipt and FAC are both present", () => {
    expect(isCashedOut("6892", "FAC-64191")).toBe(true);
    expect(isCashedOut("6892", null)).toBe(false);
    expect(isCashedOut(null, "FAC-64191")).toBe(false);
    expect(isCashedOut("  ", "FAC")).toBe(false);
    expect(isCashedOut(null, null)).toBe(false);
  });

  it("computes percentage and remaining from cashed-out invoices only", () => {
    const summary = cashOutSummary(1_000, [
      { amountEgp: 400, cashedOut: true },
      { amountEgp: 100, cashedOut: false },
    ]);
    expect(summary).toEqual({ cashedOutEgp: 400, remainingEgp: 600, percentage: 0.4 });
  });

  it("flags an invoice above remaining cash-out excluding itself", () => {
    expect(invoiceOverRemaining(700, 1_000, 400)).toBe(true);
    expect(invoiceOverRemaining(600, 1_000, 400)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/iec.test.ts tests/domain/cash-out.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`src/domain/iec.ts`:

```ts
export const MINI_IEC_BELOW_EGP = 2_000_000;

export function iecTier(requestedEgp: number): "mini" | "full" {
  return requestedEgp < MINI_IEC_BELOW_EGP ? "mini" : "full";
}
```

`src/domain/cash-out.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/domain/iec.test.ts tests/domain/cash-out.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/iec.ts src/domain/cash-out.ts tests/domain/iec.test.ts tests/domain/cash-out.test.ts
git commit -m "feat: classify IECs and compute PO cash-out"
```

---

### Task 4: Save validation

**Files:**
- Create: `src/domain/validate.ts`
- Test: `tests/domain/validate.test.ts`

**Interfaces:**
- Consumes: `periodIsOrdered`, `Currency`, `YearMonth`, `YearRates`
- Produces: `validateInvoiceDocuments(receiptNumber: string | null, facReference: string | null): string | null`, `validateAmount(amount: number | null): string | null`, `validatePeriod(start: YearMonth | null, end: YearMonth | null): string | null`, `validateCurrency(currency: Currency, rates: YearRates | undefined): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  validateAmount,
  validateCurrency,
  validateInvoiceDocuments,
  validatePeriod,
} from "../../src/domain/validate.js";

describe("validate", () => {
  it("rejects one cash-out document without the other", () => {
    expect(validateInvoiceDocuments("6892", null)).toMatch(/both/);
    expect(validateInvoiceDocuments(null, "FAC-1")).toMatch(/both/);
    expect(validateInvoiceDocuments(null, null)).toBeNull();
    expect(validateInvoiceDocuments("6892", "FAC-1")).toBeNull();
  });

  it("requires a present amount to be greater than zero", () => {
    expect(validateAmount(null)).toBeNull();
    expect(validateAmount(0)).toMatch(/greater than zero/);
    expect(validateAmount(10)).toBeNull();
  });

  it("allows a blank period and rejects a backwards period", () => {
    expect(validatePeriod(null, null)).toBeNull();
    expect(validatePeriod({ year: 2026, month: 6 }, null)).toBeNull();
    expect(validatePeriod({ year: 2026, month: 6 }, { year: 2026, month: 5 })).toMatch(/end month/);
    expect(validatePeriod({ year: 2026, month: 3 }, { year: 2026, month: 9 })).toBeNull();
  });

  it("requires a year rate before saving USD or EUR", () => {
    expect(validateCurrency("USD", undefined)).toMatch(/rate/);
    expect(validateCurrency("EGP", undefined)).toBeNull();
    expect(validateCurrency("EUR", { year: 2026, usdToEgp: 52.6, eurToEgp: 61 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/validate.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`src/domain/validate.ts`:

```ts
import { periodIsOrdered } from "./months.js";
import type { Currency, YearMonth, YearRates } from "./types.js";

function filled(value: string | null): boolean {
  return value !== null && value.trim() !== "";
}

export function validateInvoiceDocuments(receiptNumber: string | null, facReference: string | null): string | null {
  const receipt = filled(receiptNumber);
  const fac = filled(facReference);
  if (receipt === fac) return null;
  return "Oracle receipt number and FAC reference must both be present";
}

export function validateAmount(amount: number | null): string | null {
  if (amount === null) return null;
  if (!(amount > 0)) return "Amount must be greater than zero";
  return null;
}

export function validatePeriod(start: YearMonth | null, end: YearMonth | null): string | null {
  if (!start || !end) return null;
  if (!periodIsOrdered(start, end)) return "Capitalization end month is before the start month";
  return null;
}

export function validateCurrency(currency: Currency, rates: YearRates | undefined): string | null {
  if (currency === "EGP") return null;
  if (!rates) return `Missing ${currency} rate for this year`;
  const rate = currency === "USD" ? rates.usdToEgp : rates.eurToEgp;
  if (!(rate > 0)) return `Missing ${currency} rate for this year`;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/validate.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/validate.ts tests/domain/validate.test.ts
git commit -m "feat: validate cash-out documents, amounts, periods, and rates"
```

---

### Task 5: Dashboard aggregation

**Files:**
- Create: `src/domain/dashboard.ts`
- Test: `tests/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `Ledger`, `toEgp`, `capitalizationByYear`, `iecTier`, `isCashedOut`, `cashOutSummary`, `invoiceOverRemaining`
- Produces: `buildDashboard(ledger: Ledger, year: number): Dashboard` with fields `year`, `submittedInvoicesEgp`, `inProgressIecs`, `inProgressPrs`, `capitalizationEgp`, `capitalizationFromOtherBudgetYearsEgp`, `cashedOutEgp`, `remainingCashOutEgp`, `cashedOutPercentage`, `approvedEgp`, `committedEgp`, `uncommittedEgp`, `overrunEgp`, `purchaseOrders`, `pipelineIecs`, `pipelinePrs`

`purchaseOrders` items: `id`, `number`, `supplier`, `contractEgp`, `cashedOutEgp`, `remainingEgp`, `percentage`, `thisYearCapitalizationEgp`, `otherYearsCapitalizationEgp`, `incomplete`, `overContract`, `invoices`, `months`. Invoice items include `overRemaining`, `cashedOut`, `receiptNumber`, `facReference`, `amountEgp`, `submissionDate`, `description`, `id`. `percentage`, `remainingEgp`, and capitalization fields are `null` when the contract amount is missing. `cashedOutPercentage` on the dashboard is `null` when no selected-year PO has a contract amount.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildDashboard } from "../../src/domain/dashboard.js";
import type { Ledger } from "../../src/domain/types.js";

const rates = { year: 2026, usdToEgp: 52.6, eurToEgp: 61 };

function ledger(extra: Partial<Ledger> = {}): Ledger {
  return {
    rates: [rates],
    budgetLines: [
      { id: "b1", year: 2026, projectTitle: "Support", kind: "capex", currency: "EGP", amount: 1_000 },
    ],
    purchaseRequests: [
      { id: "pr1", title: "Open PR", year: 2026, amount: 100, currency: "EGP", budgetLineId: "b1", status: "In progress" },
      { id: "pr2", title: "Draft PR", year: 2026, amount: 50, currency: "EGP", budgetLineId: null, status: "Draft" },
    ],
    iecs: [
      {
        id: "iec1", title: "Small", year: 2026, projectCode: "DG1", supplier: null, kind: "capex",
        currency: "EGP", budgetAmount: 100, requestedAmount: 100, note: null, purchaseRequestId: null,
        status: "In progress",
      },
    ],
    purchaseOrders: [
      {
        id: "po1", number: "64191", budgetYear: 2026, supplier: "Hypercell", description: "Billing",
        contractAmount: 1_300, currency: "EGP", kind: "capex", budgetLineId: "b1",
        capitalizationStart: { year: 2026, month: 6 }, capitalizationEnd: { year: 2027, month: 6 },
      },
      {
        id: "po2", number: "65829", budgetYear: 2026, supplier: "Asset", description: "Plot",
        contractAmount: null, currency: null, kind: "capex", budgetLineId: null,
        capitalizationStart: null, capitalizationEnd: null,
      },
    ],
    invoices: [
      {
        id: "i1", purchaseOrderId: "po1", amount: 400, currency: "EGP", submissionDate: "2026-05-17",
        description: null, receiptNumber: "6892", facReference: "FAC-1",
      },
      {
        id: "i2", purchaseOrderId: "po1", amount: 100, currency: "EGP", submissionDate: "2026-06-01",
        description: null, receiptNumber: null, facReference: null,
      },
      {
        id: "i3", purchaseOrderId: "po2", amount: 50, currency: "EGP", submissionDate: "2027-01-02",
        description: null, receiptNumber: null, facReference: null,
      },
    ],
    ...extra,
  };
}

describe("buildDashboard", () => {
  it("aggregates the selected year and keeps in-progress live", () => {
    const dash = buildDashboard(ledger(), 2026);
    expect(dash.submittedInvoicesEgp).toBe(500);
    expect(dash.inProgressPrs).toEqual({ count: 1, egp: 100 });
    expect(dash.inProgressIecs).toEqual({ count: 1, egp: 100 });
    expect(dash.pipelineIecs[0].tier).toBe("mini");
    expect(dash.capitalizationEgp).toBe(700);
    expect(dash.cashedOutEgp).toBe(400);
    expect(dash.remainingCashOutEgp).toBe(900);
    expect(dash.cashedOutPercentage).toBeCloseTo(400 / 1300);
    expect(dash.approvedEgp).toBe(1_000);
    expect(dash.committedEgp).toBe(1_300);
    expect(dash.uncommittedEgp).toBe(-300);
    expect(dash.overrunEgp).toBe(300);
    const open = dash.purchaseOrders.find((po) => po.number === "65829");
    expect(open?.incomplete).toBe(true);
    expect(open?.percentage).toBeNull();
    expect(buildDashboard(ledger(), 2027).inProgressPrs).toEqual({ count: 1, egp: 100 });
    expect(buildDashboard(ledger(), 2027).submittedInvoicesEgp).toBe(50);
    expect(buildDashboard(ledger(), 2027).capitalizationEgp).toBe(600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/dashboard.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`src/domain/dashboard.ts`:

```ts
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

function money(ledger: Ledger, amount: number, currency: Currency, year: number): number {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/dashboard.test.ts`

Expected: PASS. `capitalizationEgp` for 2026 is `700` because `1_300 / 13 * 7 = 700`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dashboard.ts tests/domain/dashboard.test.ts
git commit -m "feat: compute the year dashboard from the ledger"
```

---

### Task 6: Consumption import

**Files:**
- Create: `src/import/consumption.ts`
- Create: `src/import/read-xlsx.ts`
- Test: `tests/import/consumption.test.ts`
- Test: `tests/import/read-xlsx.test.ts`

**Interfaces:**
- Consumes: `PurchaseOrder`, `Invoice`, `Currency`
- Produces:
  - `ConsumptionRow = { poNumber: string; supplier: string; description: string; invoiceAmount: number; currency: Currency; submissionDate: string }`
  - `importConsumption(rows: ConsumptionRow[], existing: { purchaseOrders: PurchaseOrder[]; invoices: Invoice[] }): { purchaseOrders: PurchaseOrder[]; invoices: Invoice[] }` returning only the new records
  - `readConsumptionWorkbook(path: string): Promise<ConsumptionRow[]>`
  - `roundMoney(amount: number): number` rounds half up to 2 decimal places

- [ ] **Step 1: Write the failing tests**

`tests/import/consumption.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importConsumption, type ConsumptionRow } from "../../src/import/consumption.js";

const row = (amount: number, date: string, po = "64298"): ConsumptionRow => ({
  poNumber: po,
  supplier: "Summit Technology Solutions",
  description: "Red Hat Linux Services",
  invoiceAmount: amount,
  currency: "EGP",
  submissionDate: date,
});

describe("importConsumption", () => {
  it("creates a blank-contract PO and a submitted invoice", () => {
    const imported = importConsumption([row(201530.72, "2026-03-01")], { purchaseOrders: [], invoices: [] });
    expect(imported.purchaseOrders).toHaveLength(1);
    expect(imported.purchaseOrders[0].budgetYear).toBe(2026);
    expect(imported.purchaseOrders[0].contractAmount).toBeNull();
    expect(imported.purchaseOrders[0].capitalizationStart).toBeNull();
    expect(imported.invoices[0].receiptNumber).toBeNull();
    expect(imported.invoices[0].facReference).toBeNull();
  });

  it("does not duplicate the same PO number, amount, and submission date", () => {
    const first = importConsumption([row(10, "2026-03-01")], { purchaseOrders: [], invoices: [] });
    const second = importConsumption([row(10, "2026-03-01")], {
      purchaseOrders: first.purchaseOrders,
      invoices: first.invoices,
    });
    expect(second.purchaseOrders).toHaveLength(0);
    expect(second.invoices).toHaveLength(0);
  });
});
```

`tests/import/read-xlsx.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readConsumptionWorkbook } from "../../src/import/read-xlsx.js";
import { importConsumption } from "../../src/import/consumption.js";

describe("readConsumptionWorkbook", () => {
  it("loads the 2026 consumption sheet as submitted invoices", async () => {
    const rows = await readConsumptionWorkbook("references/Data - List of POs 2026.xlsx");
    const imported = importConsumption(rows, { purchaseOrders: [], invoices: [] });
    const total = imported.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    expect(imported.invoices).toHaveLength(13);
    expect(imported.purchaseOrders).toHaveLength(8);
    expect(Math.round(total * 100) / 100).toBe(15_044_222.58);
    expect(imported.invoices.every((invoice) => invoice.receiptNumber === null)).toBe(true);
    expect(imported.invoices.every((invoice) => invoice.submissionDate.startsWith("2026-"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/import/consumption.test.ts tests/import/read-xlsx.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`src/import/consumption.ts`:

```ts
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
```

`src/import/read-xlsx.ts`:

```ts
import ExcelJS from "exceljs";
import type { Currency } from "../domain/types.js";
import { roundMoney, type ConsumptionRow } from "./consumption.js";

function asDate(value: ExcelJS.CellValue): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value ?? "").trim();
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  throw new Error(`Unreadable submission date: ${text}`);
}

export async function readConsumptionWorkbook(path: string): Promise<ConsumptionRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet("Consumption per PO");
  if (!sheet) throw new Error("Consumption per PO sheet is missing");
  const rows: ConsumptionRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const poNumber = String(row.getCell(1).value ?? "").trim();
    if (!poNumber) return;
    const currency = String(row.getCell(5).value ?? "").trim() as Currency;
    rows.push({
      poNumber,
      supplier: String(row.getCell(2).value ?? "").trim(),
      description: String(row.getCell(3).value ?? "").trim(),
      invoiceAmount: roundMoney(Number(row.getCell(4).value)),
      currency,
      submissionDate: asDate(row.getCell(7).value),
    });
  });
  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/import/consumption.test.ts tests/import/read-xlsx.test.ts`

Expected: PASS, including total `15044222.58`, 13 invoices, 8 POs

- [ ] **Step 5: Commit**

```bash
git add src/import/consumption.ts src/import/read-xlsx.ts tests/import/consumption.test.ts tests/import/read-xlsx.test.ts
git commit -m "feat: import 2026 consumption rows without duplicating invoices"
```

---

### Task 7: Store and Postgres

**Files:**
- Create: `src/store/types.ts`
- Create: `src/store/memory.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/postgres-store.ts`
- Test: `tests/db/postgres-store.test.ts`

**Interfaces:**
- Consumes: domain types, `importConsumption`
- Produces: `Store` with `loadLedger()`, `findUserByEmail(email)`, `ensureUser(user)`, `upsertRates(rates)`, `createBudgetLine`, `updateBudgetLine`, `deleteBudgetLine`, and the same create/update/delete trio for `PurchaseRequest`, `Iec`, `PurchaseOrder`, and `Invoice`. Deletes of a still-referenced parent throw `Error` whose message includes `in use`. `createPurchaseOrder` throws if `number` already exists.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createPostgresStore } from "../../src/db/postgres-store.js";

describe("postgres store", () => {
  it("saves a PO and refuses a second import of the same invoice", async () => {
    const client = new PGlite();
    const store = await createPostgresStore(client);
    await store.upsertRates({ year: 2026, usdToEgp: 52.6, eurToEgp: 61 });
    const po = await store.createPurchaseOrder({
      number: "64191",
      budgetYear: 2026,
      supplier: "Hypercell",
      description: "Billing",
      contractAmount: 1_300_000,
      currency: "EGP",
      kind: "capex",
      budgetLineId: null,
      capitalizationStart: { year: 2026, month: 6 },
      capitalizationEnd: { year: 2027, month: 6 },
    });
    await store.createInvoice({
      purchaseOrderId: po.id,
      amount: 100,
      currency: "EGP",
      submissionDate: "2026-05-17",
      description: null,
      receiptNumber: null,
      facReference: null,
    });
    const ledger = await store.loadLedger();
    expect(ledger.purchaseOrders).toHaveLength(1);
    expect(ledger.invoices).toHaveLength(1);
    await expect(
      store.createPurchaseOrder({
        number: "64191",
        budgetYear: 2026,
        supplier: "Other",
        description: "Duplicate",
        contractAmount: 1,
        currency: "EGP",
        kind: "capex",
        budgetLineId: null,
        capitalizationStart: null,
        capitalizationEnd: null,
      }),
    ).rejects.toThrow(/number/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/postgres-store.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

Use Drizzle table definitions for `users`, `year_rates`, `budget_lines`, `purchase_requests`, `iecs`, `purchase_orders`, `invoices`. Store months as nullable integers `cap_start_year`, `cap_start_month`, `cap_end_year`, `cap_end_month`. Store money as `double precision`. Primary keys are `text` UUIDs from `crypto.randomUUID()` except `year_rates.year`.

`createPostgresStore` accepts a PGlite or postgres.js client that Drizzle can wrap. On create, run `CREATE TABLE IF NOT EXISTS` for every table from the Drizzle schema SQL, then return a `Store`.

`src/store/memory.ts` implements the same `Store` with arrays so HTTP tests do not need Postgres. Unique PO numbers and `in use` deletes behave the same as Postgres.

`createInvoice` and `updateInvoice` call `validateInvoiceDocuments`, `validateAmount`, and `validateCurrency` before writing. `createPurchaseOrder` calls `validatePeriod` and `validateAmount` on the contract amount. Every `Store` method listed in this task's Interfaces block is implemented in both `memory.ts` and `postgres-store.ts`.

`src/store/types.ts` exports this interface, and both stores implement it:

```ts
import type {
  BudgetLine, Iec, Invoice, Ledger, PurchaseOrder, PurchaseRequest, YearMonth, YearRates,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/postgres-store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/types.ts src/store/memory.ts src/db/schema.ts src/db/postgres-store.ts tests/db/postgres-store.test.ts
git commit -m "feat: persist the ledger in Postgres"
```

---

### Task 8: HTTP auth and API

**Files:**
- Create: `src/auth/password.ts`
- Create: `src/auth/session.ts`
- Create: `src/http/app.ts`
- Test: `tests/http/app.test.ts`
- Test: `tests/auth/password.test.ts`

**Interfaces:**
- Consumes: `Store`, `buildDashboard`
- Produces: `createApp(store: Store, sessionSecret: string): Hono`, cookie name `budget_session`

Routes:

- `POST /api/session` with `{ email, password }` sets the cookie. Unknown user is `401`.
- `DELETE /api/session` clears it.
- `GET /api/session` returns `{ email, role, name }` or `401`.
- `GET /api/dashboard?year=2026` returns `buildDashboard`. Missing `year` uses the current calendar year.
- Editor-only create/update/delete for `/api/budget-lines`, `/api/purchase-requests`, `/api/iecs`, `/api/purchase-orders`, `/api/invoices`, and `PUT /api/rates/:year`.
- Viewer `GET /api/dashboard` and `GET /api/session` succeed. Any other route for the viewer is `403`. Unauthenticated requests are `401`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/http/app.js";
import { createMemoryStore } from "../../src/store/memory.js";
import { hashPassword } from "../../src/auth/password.js";

async function editorApp() {
  const store = createMemoryStore();
  await store.ensureUser({
    email: "editor@orange.com",
    name: "Editor",
    role: "editor",
    passwordHash: await hashPassword("secret"),
  });
  await store.ensureUser({
    email: "cto@orange.com",
    name: "CTO",
    role: "viewer",
    passwordHash: await hashPassword("secret"),
  });
  await store.upsertRates({ year: 2026, usdToEgp: 52.6, eurToEgp: 61 });
  return createApp(store, "test-secret");
}

async function login(app: ReturnType<typeof createApp>, email: string) {
  const response = await app.request("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "secret" }),
  });
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("http", () => {
  it("lets an editor save a cashed-out invoice and blocks a single document", async () => {
    const app = await editorApp();
    const cookie = await login(app, "editor@orange.com");
    const po = await app.request("/api/purchase-orders", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        number: "65829", budgetYear: 2026, supplier: "Asset", description: "Plot",
        contractAmount: 4_000_000, currency: "EGP", kind: "capex", budgetLineId: null,
        capitalizationStart: { year: 2026, month: 3 }, capitalizationEnd: { year: 2026, month: 9 },
      }),
    });
    const created = await po.json();
    const rejected = await app.request("/api/invoices", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderId: created.id, amount: 2_000_000, currency: "EGP",
        submissionDate: "2026-05-18", description: null, receiptNumber: "6892", facReference: null,
      }),
    });
    expect(rejected.status).toBe(400);
  });

  it("lets the viewer read the dashboard and rejects edits", async () => {
    const app = await editorApp();
    const cookie = await login(app, "cto@orange.com");
    const dashboard = await app.request("/api/dashboard?year=2026", { headers: { cookie } });
    expect(dashboard.status).toBe(200);
    const edit = await app.request("/api/budget-lines", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ year: 2026, projectTitle: "X", kind: "capex", currency: "EGP", amount: 1 }),
    });
    expect(edit.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/http/app.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`hashPassword` / `verifyPassword` use `scrypt` from `node:crypto` with a random 16-byte salt, stored as `scrypt:<salt hex>:<hash hex>`.

`signSession` / `readSession` use HMAC-SHA256 over a JSON payload `{ email, role, name, exp }` with `sessionSecret`. Cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`.

`createApp` reads the cookie, loads the user, and calls `buildDashboard(await store.loadLedger(), year)` for the dashboard route. Write handlers call the matching `Store` method. A thrown validation `Error` becomes HTTP `400` with `{ error: message }`. Duplicate PO number is `400`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/http/app.test.ts tests/auth/password.test.ts`

Add `tests/auth/password.test.ts` that hashes `secret`, verifies it, and rejects `wrong`.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/password.ts src/auth/session.ts src/http/app.ts tests/http/app.test.ts tests/auth/password.test.ts
git commit -m "feat: require login and keep viewer access read-only"
```

---

### Task 9: Presentable client

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `client/main.tsx`
- Create: `client/styles.css`
- Create: `client/App.tsx`
- Create: `src/server.ts`

**Interfaces:**
- Consumes: `GET /api/session`, `GET /api/dashboard`, editor routes from Task 8
- Produces: a page at `/` that shows login, the CTO dashboard, or the editor pages

- [ ] **Step 1: Write the failing test**

Extend `tests/http/app.test.ts` with a static-file check only after `src/server.ts` exists. For this task, the behavioral test is the dashboard response already covered. Add a client unit-free check by rendering numbers with a pure helper:

Create `client/format.ts` and `tests/client/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEgp, formatPercent } from "../../client/format.js";

describe("format", () => {
  it("formats EGP and percentages for the dashboard", () => {
    expect(formatEgp(15_044_222.58)).toContain("15,044,222.58");
    expect(formatPercent(0.4)).toBe("40.0%");
    expect(formatPercent(null)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/client/format.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`client/format.ts` uses `Intl.NumberFormat("en-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })` and prefixes `EGP `. `formatPercent` multiplies by 100, one decimal, or returns `—` for null.

`client/styles.css`: page background `#f6f4f1`, text `#1a1a1a`, accent `#ff7900`, white cards, large headline figures. No edit controls in the viewer layout.

`client/App.tsx`:

- If `GET /api/session` is 401, show email and password form posting to `POST /api/session`.
- If `role` is `viewer`, render only `Dashboard`.
- If `role` is `editor`, render `Dashboard` plus links: Rates, Budget lines, PRs, IECs, POs, Invoices.

`Dashboard` reads `GET /api/dashboard?year=`. The year `<select>` lists years present on the ledger plus the current calendar year; the first load uses the current calendar year. Show, in order: year switcher; four headlines (submitted invoices, in-progress IECs with EGP and count, in-progress PRs with EGP and count, capitalization, cash-out / remaining / percentage); budget strip (approved, committed, cashed out, uncommitted, and overrun when `overrunEgp > 0`); PO table; PO detail when a row is clicked; pipeline of in-progress IECs (Mini or Full) and PRs.

PO table columns: number, supplier, contract value, cashed-out percentage, remaining, this year, other years. Incomplete rows show `Incomplete`. Over-contract rows show `Over contract`.

PO detail lists each invoice as `Submitted` or `Cashed out`, and when cashed out shows the receipt number and FAC reference. Show `Over remaining` when `overRemaining` is true. Show the month rows.

Editor pages are one `ResourcePage` driven by field config for each record in the spec. Saving an invoice includes receipt number and FAC reference on the same form. Blank document fields are sent as `null`.

`vite.config.ts` proxies `/api` to `http://localhost:3000` during `npm run dev`. `src/server.ts` serves `client/dist` when present and the API on port `3000` (env `PORT`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/client/format.test.ts && npm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html vite.config.ts client src/server.ts tests/client/format.test.ts
git commit -m "feat: add the CTO dashboard and editor pages"
```

---

### Task 10: Seed, Docker, and the workbook check

**Files:**
- Create: `src/seed.ts`
- Modify: `src/server.ts`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Test: `tests/seed/seed.test.ts`

**Interfaces:**
- Consumes: `Store`, `readConsumptionWorkbook`, `importConsumption`
- Produces: `seed(store: Store, env: NodeJS.ProcessEnv, readRows: () => Promise<ConsumptionRow[]>): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { seed } from "../../src/seed.js";
import { createMemoryStore } from "../../src/store/memory.js";
import { buildDashboard } from "../../src/domain/dashboard.js";
import type { ConsumptionRow } from "../../src/import/consumption.js";

const rows: ConsumptionRow[] = [
  {
    poNumber: "64298", supplier: "Summit", description: "Red Hat",
    invoiceAmount: 15_044_222.58, currency: "EGP", submissionDate: "2026-03-01",
  },
];

describe("seed", () => {
  it("creates three users, 2026 rates, and imports consumption once", async () => {
    const store = createMemoryStore();
    const env = {
      EDITOR_ONE_EMAIL: "a@orange.com", EDITOR_ONE_PASSWORD: "one", EDITOR_ONE_NAME: "A",
      EDITOR_TWO_EMAIL: "b@orange.com", EDITOR_TWO_PASSWORD: "two", EDITOR_TWO_NAME: "B",
      VIEWER_EMAIL: "cto@orange.com", VIEWER_PASSWORD: "view", VIEWER_NAME: "CTO",
    };
    await seed(store, env, async () => rows);
    await seed(store, env, async () => rows);
    const ledger = await store.loadLedger();
    expect(ledger.rates).toEqual([{ year: 2026, usdToEgp: 52.6, eurToEgp: 61 }]);
    expect(ledger.invoices).toHaveLength(1);
    expect(buildDashboard(ledger, 2026).submittedInvoicesEgp).toBe(15_044_222.58);
    expect(await store.findUserByEmail("cto@orange.com")).toMatchObject({ role: "viewer" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/seed/seed.test.ts`

Expected: FAIL with cannot find module

- [ ] **Step 3: Write minimal implementation**

`seed` inserts each user only when `findUserByEmail` is null. It upserts 2026 rates only when that year is absent. It uses `hasImport` and `markImport` from `Store` with the key `consumption-2026`. The Postgres `imports` table has `key` as its primary key. When the marker exists, skip the workbook. New invoices still go through `importConsumption` so the PO number, amount, and submission date stay unique.

`src/server.ts` calls `seed` on startup with `readConsumptionWorkbook(process.env.CONSUMPTION_XLSX ?? "references/Data - List of POs 2026.xlsx")`. If the file is missing, log and continue with users and rates only.

`.env.example`:

```
DATABASE_URL=postgres://budget:budget@postgres:5432/budget
SESSION_SECRET=replace-me
EDITOR_ONE_EMAIL=editor.one@orange.com
EDITOR_ONE_PASSWORD=replace-me
EDITOR_ONE_NAME=Editor One
EDITOR_TWO_EMAIL=editor.two@orange.com
EDITOR_TWO_PASSWORD=replace-me
EDITOR_TWO_NAME=Editor Two
VIEWER_EMAIL=cto@orange.com
VIEWER_PASSWORD=replace-me
VIEWER_NAME=CTO
CONSUMPTION_XLSX=references/Data - List of POs 2026.xlsx
```

`docker-compose.yml` runs Postgres 16 and the app. The app publishes port `3000`. Postgres is not published to the host. The compose file mounts `./references` at `/app/references` read-only. `Dockerfile` builds the Vite client and the TypeScript server, then runs `node dist/server.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`

Expected: PASS, including the workbook test total `15,044,222.58`

- [ ] **Step 5: Commit**

```bash
git add src/seed.ts src/server.ts src/store/types.ts src/store/memory.ts src/db/schema.ts src/db/postgres-store.ts Dockerfile docker-compose.yml .env.example tests/seed/seed.test.ts
git commit -m "feat: seed editors, rates, and the 2026 consumption workbook"
```

---

## Self-review

Spec coverage:

- Access, three roles, viewer cannot edit: Task 8 and Task 9
- Rates, EGP conversion, mini IEC: Tasks 1 and 3
- Records and optional links: Task 7 store
- Capitalization examples: Task 2 and Task 5
- Cash-out pair, remaining, percentage, over-invoice: Tasks 3, 4, 5, 8
- In-progress ignores year: Task 5
- Screens: Task 9
- Import once, total `15,044,222.58`, not cashed out: Tasks 6 and 10
- Out of scope items are not tasks
