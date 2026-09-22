import { doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
});

export const yearRates = pgTable("year_rates", {
  year: integer("year").primaryKey(),
  usdToEgp: doublePrecision("usd_to_egp").notNull(),
  eurToEgp: doublePrecision("eur_to_egp").notNull(),
});

export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  projectTitle: text("project_title").notNull(),
  kind: text("kind").notNull(),
  currency: text("currency").notNull(),
  amount: doublePrecision("amount").notNull(),
});

export const purchaseRequests = pgTable("purchase_requests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  budgetLineId: text("budget_line_id").references(() => budgetLines.id),
  status: text("status").notNull(),
});

export const iecs = pgTable("iecs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  projectCode: text("project_code").notNull(),
  supplier: text("supplier"),
  kind: text("kind").notNull(),
  currency: text("currency").notNull(),
  budgetAmount: doublePrecision("budget_amount").notNull(),
  requestedAmount: doublePrecision("requested_amount").notNull(),
  note: text("note"),
  purchaseRequestId: text("purchase_request_id").references(() => purchaseRequests.id),
  status: text("status").notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  budgetYear: integer("budget_year").notNull(),
  supplier: text("supplier").notNull(),
  description: text("description").notNull(),
  contractAmount: doublePrecision("contract_amount"),
  currency: text("currency"),
  kind: text("kind").notNull(),
  budgetLineId: text("budget_line_id").references(() => budgetLines.id),
  capStartYear: integer("cap_start_year"),
  capStartMonth: integer("cap_start_month"),
  capEndYear: integer("cap_end_year"),
  capEndMonth: integer("cap_end_month"),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  amount: doublePrecision("amount").notNull(),
  currency: text("currency").notNull(),
  submissionDate: text("submission_date").notNull(),
  description: text("description"),
  receiptNumber: text("receipt_number"),
  facReference: text("fac_reference"),
});

export const imports = pgTable("imports", {
  key: text("key").primaryKey(),
});

export const schema = {
  users,
  yearRates,
  budgetLines,
  purchaseRequests,
  iecs,
  purchaseOrders,
  invoices,
  imports,
};

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS year_rates (
  year integer PRIMARY KEY,
  usd_to_egp double precision NOT NULL,
  eur_to_egp double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS budget_lines (
  id text PRIMARY KEY,
  year integer NOT NULL,
  project_title text NOT NULL,
  kind text NOT NULL,
  currency text NOT NULL,
  amount double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_requests (
  id text PRIMARY KEY,
  title text NOT NULL,
  year integer NOT NULL,
  amount double precision NOT NULL,
  currency text NOT NULL,
  budget_line_id text REFERENCES budget_lines(id),
  status text NOT NULL
);
CREATE TABLE IF NOT EXISTS iecs (
  id text PRIMARY KEY,
  title text NOT NULL,
  year integer NOT NULL,
  project_code text NOT NULL,
  supplier text,
  kind text NOT NULL,
  currency text NOT NULL,
  budget_amount double precision NOT NULL,
  requested_amount double precision NOT NULL,
  note text,
  purchase_request_id text REFERENCES purchase_requests(id),
  status text NOT NULL
);
CREATE TABLE IF NOT EXISTS purchase_orders (
  id text PRIMARY KEY,
  number text NOT NULL UNIQUE,
  budget_year integer NOT NULL,
  supplier text NOT NULL,
  description text NOT NULL,
  contract_amount double precision,
  currency text,
  kind text NOT NULL,
  budget_line_id text REFERENCES budget_lines(id),
  cap_start_year integer,
  cap_start_month integer,
  cap_end_year integer,
  cap_end_month integer
);
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES purchase_orders(id),
  amount double precision NOT NULL,
  currency text NOT NULL,
  submission_date text NOT NULL,
  description text,
  receipt_number text,
  fac_reference text
);
CREATE TABLE IF NOT EXISTS imports (
  key text PRIMARY KEY
);
`;
