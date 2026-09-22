import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatEgp, formatPercent } from "./format.js";

type Role = "editor" | "viewer";
type Session = { email: string; role: Role; name: string };

type DashboardInvoice = {
  id: string;
  amountEgp: number;
  submissionDate: string;
  description: string | null;
  cashedOut: boolean;
  receiptNumber: string | null;
  facReference: string | null;
  overRemaining: boolean;
};

type DashboardPo = {
  id: string;
  number: string;
  supplier: string;
  contractEgp: number | null;
  cashedOutEgp: number;
  remainingEgp: number | null;
  percentage: number | null;
  thisYearCapitalizationEgp: number | null;
  otherYearsCapitalizationEgp: number | null;
  incomplete: boolean;
  overContract: boolean;
  invoices: DashboardInvoice[];
  months: { year: number; month: number; amountEgp: number }[];
};

type DashboardData = {
  year: number;
  years: number[];
  submittedInvoicesEgp: number;
  inProgressIecs: { count: number; egp: number };
  inProgressPrs: { count: number; egp: number };
  capitalizationEgp: number;
  capitalizationFromOtherBudgetYearsEgp: number;
  cashedOutEgp: number;
  remainingCashOutEgp: number;
  cashedOutPercentage: number | null;
  approvedEgp: number;
  committedEgp: number;
  uncommittedEgp: number;
  overrunEgp: number;
  purchaseOrders: DashboardPo[];
  pipelineIecs: { id: string; title: string; egp: number; tier: "Mini" | "Full" }[];
  pipelinePrs: { id: string; title: string; egp: number }[];
};

type Page =
  | "dashboard"
  | "rates"
  | "budget-lines"
  | "prs"
  | "iecs"
  | "pos"
  | "invoices";

type FieldType = "text" | "number" | "select" | "nullable-text" | "month";

type FieldConfig = {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  optional?: boolean;
};

type ResourceRecord = Record<string, unknown>;

type ResourceConfig = {
  title: string;
  listPath: string;
  createPath?: string;
  updatePath: (values: Record<string, string>, editingId: string | null) => string;
  fields: FieldConfig[];
  transform: (values: Record<string, string>) => unknown;
  toFormValues: (record: ResourceRecord) => Record<string, string>;
  rowLabel: (record: ResourceRecord) => string;
  recordKey: (record: ResourceRecord) => string;
};

const STATUSES = ["Draft", "In progress", "Approved", "Rejected", "Closed"];
const CURRENCIES = ["EGP", "USD", "EUR"];
const KINDS = ["capex", "opex"];

const RESOURCE_CONFIG: Record<Exclude<Page, "dashboard">, ResourceConfig> = {
  rates: {
    title: "Rates",
    listPath: "/api/rates",
    updatePath: (values, editingId) => `/api/rates/${editingId ?? values.year}`,
    fields: [
      { name: "year", label: "Year", type: "number" },
      { name: "usdToEgp", label: "USD to EGP", type: "number" },
      { name: "eurToEgp", label: "EUR to EGP", type: "number" },
    ],
    transform: (values) => ({
      usdToEgp: Number(values.usdToEgp),
      eurToEgp: Number(values.eurToEgp),
    }),
    toFormValues: (record) => ({
      year: String(record.year ?? ""),
      usdToEgp: String(record.usdToEgp ?? ""),
      eurToEgp: String(record.eurToEgp ?? ""),
    }),
    rowLabel: (record) =>
      `${record.year}: USD ${record.usdToEgp} / EUR ${record.eurToEgp}`,
    recordKey: (record) => String(record.year),
  },
  "budget-lines": {
    title: "Budget lines",
    listPath: "/api/budget-lines",
    createPath: "/api/budget-lines",
    updatePath: (_values, editingId) => `/api/budget-lines/${editingId}`,
    fields: [
      { name: "year", label: "Year", type: "number" },
      { name: "projectTitle", label: "Project title", type: "text" },
      { name: "kind", label: "Kind", type: "select", options: KINDS },
      { name: "currency", label: "Currency", type: "select", options: CURRENCIES },
      { name: "amount", label: "Amount", type: "number" },
    ],
    transform: (values) => ({
      year: Number(values.year),
      projectTitle: values.projectTitle,
      kind: values.kind,
      currency: values.currency,
      amount: Number(values.amount),
    }),
    toFormValues: (record) => ({
      year: String(record.year ?? ""),
      projectTitle: String(record.projectTitle ?? ""),
      kind: String(record.kind ?? "capex"),
      currency: String(record.currency ?? "EGP"),
      amount: String(record.amount ?? ""),
    }),
    rowLabel: (record) => `${record.year} · ${record.projectTitle} · ${record.amount} ${record.currency}`,
    recordKey: (record) => String(record.id),
  },
  prs: {
    title: "Purchase requests",
    listPath: "/api/purchase-requests",
    createPath: "/api/purchase-requests",
    updatePath: (_values, editingId) => `/api/purchase-requests/${editingId}`,
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "year", label: "Year", type: "number" },
      { name: "amount", label: "Amount", type: "number" },
      { name: "currency", label: "Currency", type: "select", options: CURRENCIES },
      { name: "budgetLineId", label: "Budget line ID", type: "nullable-text", optional: true },
      { name: "status", label: "Status", type: "select", options: STATUSES },
    ],
    transform: (values) => ({
      title: values.title,
      year: Number(values.year),
      amount: Number(values.amount),
      currency: values.currency,
      budgetLineId: blankToNull(values.budgetLineId),
      status: values.status,
    }),
    toFormValues: (record) => ({
      title: String(record.title ?? ""),
      year: String(record.year ?? ""),
      amount: String(record.amount ?? ""),
      currency: String(record.currency ?? "EGP"),
      budgetLineId: nullableString(record.budgetLineId),
      status: String(record.status ?? "Draft"),
    }),
    rowLabel: (record) => `${record.year} · ${record.title} · ${record.status}`,
    recordKey: (record) => String(record.id),
  },
  iecs: {
    title: "IECs",
    listPath: "/api/iecs",
    createPath: "/api/iecs",
    updatePath: (_values, editingId) => `/api/iecs/${editingId}`,
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "year", label: "Year", type: "number" },
      { name: "projectCode", label: "Project code", type: "text" },
      { name: "supplier", label: "Supplier", type: "nullable-text", optional: true },
      { name: "kind", label: "Kind", type: "select", options: KINDS },
      { name: "currency", label: "Currency", type: "select", options: CURRENCIES },
      { name: "budgetAmount", label: "Budget amount", type: "number" },
      { name: "requestedAmount", label: "Requested amount", type: "number" },
      { name: "note", label: "Note", type: "nullable-text", optional: true },
      { name: "purchaseRequestId", label: "PR ID", type: "nullable-text", optional: true },
      { name: "status", label: "Status", type: "select", options: STATUSES },
    ],
    transform: (values) => ({
      title: values.title,
      year: Number(values.year),
      projectCode: values.projectCode,
      supplier: blankToNull(values.supplier),
      kind: values.kind,
      currency: values.currency,
      budgetAmount: Number(values.budgetAmount),
      requestedAmount: Number(values.requestedAmount),
      note: blankToNull(values.note),
      purchaseRequestId: blankToNull(values.purchaseRequestId),
      status: values.status,
    }),
    toFormValues: (record) => ({
      title: String(record.title ?? ""),
      year: String(record.year ?? ""),
      projectCode: String(record.projectCode ?? ""),
      supplier: nullableString(record.supplier),
      kind: String(record.kind ?? "capex"),
      currency: String(record.currency ?? "EGP"),
      budgetAmount: String(record.budgetAmount ?? ""),
      requestedAmount: String(record.requestedAmount ?? ""),
      note: nullableString(record.note),
      purchaseRequestId: nullableString(record.purchaseRequestId),
      status: String(record.status ?? "Draft"),
    }),
    rowLabel: (record) => `${record.year} · ${record.title} · ${record.status}`,
    recordKey: (record) => String(record.id),
  },
  pos: {
    title: "Purchase orders",
    listPath: "/api/purchase-orders",
    createPath: "/api/purchase-orders",
    updatePath: (_values, editingId) => `/api/purchase-orders/${editingId}`,
    fields: [
      { name: "number", label: "PO number", type: "text" },
      { name: "budgetYear", label: "Budget year", type: "number" },
      { name: "supplier", label: "Supplier", type: "text" },
      { name: "description", label: "Description", type: "text" },
      { name: "contractAmount", label: "Contract amount", type: "nullable-text", optional: true },
      { name: "currency", label: "Currency", type: "select", options: ["", ...CURRENCIES], optional: true },
      { name: "kind", label: "Kind", type: "select", options: KINDS },
      { name: "budgetLineId", label: "Budget line ID", type: "nullable-text", optional: true },
      { name: "capitalizationStart", label: "Capitalization start (YYYY-MM)", type: "month", optional: true },
      { name: "capitalizationEnd", label: "Capitalization end (YYYY-MM)", type: "month", optional: true },
    ],
    transform: (values) => ({
      number: values.number,
      budgetYear: Number(values.budgetYear),
      supplier: values.supplier,
      description: values.description,
      contractAmount: values.contractAmount.trim() === "" ? null : Number(values.contractAmount),
      currency: values.currency === "" ? null : values.currency,
      kind: values.kind,
      budgetLineId: blankToNull(values.budgetLineId),
      capitalizationStart: parseMonth(values.capitalizationStart),
      capitalizationEnd: parseMonth(values.capitalizationEnd),
    }),
    toFormValues: (record) => ({
      number: String(record.number ?? ""),
      budgetYear: String(record.budgetYear ?? ""),
      supplier: String(record.supplier ?? ""),
      description: String(record.description ?? ""),
      contractAmount: record.contractAmount == null ? "" : String(record.contractAmount),
      currency: record.currency == null ? "" : String(record.currency),
      kind: String(record.kind ?? "capex"),
      budgetLineId: nullableString(record.budgetLineId),
      capitalizationStart: formatMonth(record.capitalizationStart),
      capitalizationEnd: formatMonth(record.capitalizationEnd),
    }),
    rowLabel: (record) => `${record.number} · ${record.supplier} · ${record.budgetYear}`,
    recordKey: (record) => String(record.id),
  },
  invoices: {
    title: "Invoices",
    listPath: "/api/invoices",
    createPath: "/api/invoices",
    updatePath: (_values, editingId) => `/api/invoices/${editingId}`,
    fields: [
      { name: "purchaseOrderId", label: "Purchase order ID", type: "text" },
      { name: "amount", label: "Amount", type: "number" },
      { name: "currency", label: "Currency", type: "select", options: CURRENCIES },
      { name: "submissionDate", label: "Submission date", type: "text" },
      { name: "description", label: "Description", type: "nullable-text", optional: true },
      { name: "receiptNumber", label: "Receipt number", type: "nullable-text", optional: true },
      { name: "facReference", label: "FAC reference", type: "nullable-text", optional: true },
    ],
    transform: (values) => ({
      purchaseOrderId: values.purchaseOrderId,
      amount: Number(values.amount),
      currency: values.currency,
      submissionDate: values.submissionDate,
      description: blankToNull(values.description),
      receiptNumber: blankToNull(values.receiptNumber),
      facReference: blankToNull(values.facReference),
    }),
    toFormValues: (record) => ({
      purchaseOrderId: String(record.purchaseOrderId ?? ""),
      amount: String(record.amount ?? ""),
      currency: String(record.currency ?? "EGP"),
      submissionDate: String(record.submissionDate ?? ""),
      description: nullableString(record.description),
      receiptNumber: nullableString(record.receiptNumber),
      facReference: nullableString(record.facReference),
    }),
    rowLabel: (record) =>
      `${record.submissionDate} · ${record.amount} ${record.currency}` +
      (record.receiptNumber ? " · cashed out" : " · submitted"),
    recordKey: (record) => String(record.id),
  },
};

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function nullableString(value: unknown): string {
  return value == null ? "" : String(value);
}

function parseMonth(value: string): { year: number; month: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function formatMonth(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as { year?: unknown; month?: unknown };
  if (typeof record.year !== "number" || typeof record.month !== "number") return "";
  return `${record.year}-${String(record.month).padStart(2, "0")}`;
}

function emptyValues(fields: FieldConfig[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, ""]));
}

async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!response.ok) {
    const error =
      body && typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${response.status})`;
    return { ok: false, status: response.status, error };
  }
  return { ok: true, data: body as T };
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");

  useEffect(() => {
    void (async () => {
      const result = await api<Session>("/api/session");
      if (result.ok) setSession(result.data);
      setLoading(false);
    })();
  }, []);

  async function logout() {
    await api("/api/session", { method: "DELETE" });
    setSession(null);
    setPage("dashboard");
  }

  if (loading) {
    return <div className="app-shell muted">Loading…</div>;
  }

  if (!session) {
    return (
      <Login
        onLoggedIn={(user) => {
          setSession(user);
          setPage("dashboard");
        }}
      />
    );
  }

  const editorLinks: { page: Exclude<Page, "dashboard">; label: string }[] = [
    { page: "rates", label: "Rates" },
    { page: "budget-lines", label: "Budget lines" },
    { page: "prs", label: "PRs" },
    { page: "iecs", label: "IECs" },
    { page: "pos", label: "POs" },
    { page: "invoices", label: "Invoices" },
  ];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          Data Lake <span>Budget</span>
        </div>
        <nav className="nav">
          <button
            type="button"
            className={`linkish${page === "dashboard" ? " active" : ""}`}
            onClick={() => setPage("dashboard")}
          >
            Dashboard
          </button>
          {session.role === "editor" &&
            editorLinks.map((link) => (
              <button
                key={link.page}
                type="button"
                className={`linkish${page === link.page ? " active" : ""}`}
                onClick={() => setPage(link.page)}
              >
                {link.label}
              </button>
            ))}
          <span className="muted">{session.name}</span>
          <button type="button" className="linkish" onClick={() => void logout()}>
            Log out
          </button>
        </nav>
      </header>

      {page === "dashboard" ? <Dashboard /> : <ResourcePage config={RESOURCE_CONFIG[page]} />}
    </div>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await api<Session>("/api/session", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onLoggedIn(result.data);
  }

  return (
    <div className="login-shell">
      <form className="card login-card stack" onSubmit={(event) => void onSubmit(event)}>
        <div className="brand">
          Data Lake <span>Budget</span>
        </div>
        <h1>Sign in</h1>
        <p className="muted">Editors keep the ledger. The viewer opens the year dashboard.</p>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        <button className="primary" type="submit">
          Sign in
        </button>
        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}

function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [years, setYears] = useState<number[]>([currentYear]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      setError(null);
      const result = await api<DashboardData>(`/api/dashboard?year=${year}`);
      if (ignore) return;
      if (!result.ok) {
        setData(null);
        setError(result.error);
        return;
      }
      setData(result.data);
      setYears(result.data.years);
      setSelectedPoId(null);
    })();
    return () => {
      ignore = true;
    };
  }, [year]);

  const selectedPo = data?.purchaseOrders.find((po) => po.id === selectedPoId) ?? null;

  return (
    <div>
      <div className="card year-row">
        <label>
          Year
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {years.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="card error">{error}</div>}

      {data && (
        <>
          <div className="headline-grid">
            <div className="card">
              <div className="figure-label">Submitted invoices</div>
              <div className="figure">{formatEgp(data.submittedInvoicesEgp)}</div>
            </div>
            <div className="card">
              <div className="figure-label">In progress</div>
              <div className="figure">{formatEgp(data.inProgressIecs.egp)}</div>
              <div className="muted">
                {data.inProgressIecs.count} IEC(s) · {formatEgp(data.inProgressPrs.egp)} /{" "}
                {data.inProgressPrs.count} PR(s)
              </div>
            </div>
            <div className="card">
              <div className="figure-label">Capitalization</div>
              <div className="figure">{formatEgp(data.capitalizationEgp)}</div>
              {data.capitalizationFromOtherBudgetYearsEgp > 0 && (
                <div className="muted">
                  Including {formatEgp(data.capitalizationFromOtherBudgetYearsEgp)} from other budget years
                </div>
              )}
            </div>
            <div className="card">
              <div className="figure-label">Cash-out</div>
              <div className="figure">{formatEgp(data.cashedOutEgp)}</div>
              <div className="muted">
                Remaining {formatEgp(data.remainingCashOutEgp)} · {formatPercent(data.cashedOutPercentage)}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Budget</h2>
            <div className="budget-strip">
              <div>
                <span className="muted">Approved</span>
                <strong>{formatEgp(data.approvedEgp)}</strong>
              </div>
              <div>
                <span className="muted">Committed</span>
                <strong>{formatEgp(data.committedEgp)}</strong>
              </div>
              <div>
                <span className="muted">Cashed out</span>
                <strong>{formatEgp(data.cashedOutEgp)}</strong>
              </div>
              <div>
                <span className="muted">Uncommitted</span>
                <strong>{formatEgp(data.uncommittedEgp)}</strong>
              </div>
              {data.overrunEgp > 0 && (
                <div>
                  <span className="muted">Overrun</span>
                  <strong>{formatEgp(data.overrunEgp)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Purchase orders</h2>
            <table>
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Supplier</th>
                  <th>Contract value</th>
                  <th>Cashed-out %</th>
                  <th>Remaining</th>
                  <th>This year</th>
                  <th>Other years</th>
                </tr>
              </thead>
              <tbody>
                {data.purchaseOrders.map((po) => (
                  <tr
                    key={po.id}
                    className={selectedPoId === po.id ? "selected" : undefined}
                    onClick={() => setSelectedPoId(po.id)}
                  >
                    <td>
                      {po.number}
                      {po.incomplete && <span className="badge">Incomplete</span>}
                      {po.overContract && <span className="badge warn">Over contract</span>}
                    </td>
                    <td>{po.supplier}</td>
                    <td>{po.contractEgp === null ? "—" : formatEgp(po.contractEgp)}</td>
                    <td>{formatPercent(po.percentage)}</td>
                    <td>{po.remainingEgp === null ? "—" : formatEgp(po.remainingEgp)}</td>
                    <td>
                      {po.thisYearCapitalizationEgp === null
                        ? "—"
                        : formatEgp(po.thisYearCapitalizationEgp)}
                    </td>
                    <td>
                      {po.otherYearsCapitalizationEgp === null
                        ? "—"
                        : formatEgp(po.otherYearsCapitalizationEgp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedPo && (
            <div className="card">
              <h2 className="section-title">
                PO {selectedPo.number} · {selectedPo.supplier}
              </h2>
              <div className="stack">
                {selectedPo.invoices.map((invoice) => (
                  <div key={invoice.id}>
                    <strong>{invoice.cashedOut ? "Cashed out" : "Submitted"}</strong>
                    {" · "}
                    {formatEgp(invoice.amountEgp)} · {invoice.submissionDate}
                    {invoice.description ? ` · ${invoice.description}` : ""}
                    {invoice.cashedOut && (
                      <div className="muted">
                        Receipt {invoice.receiptNumber} · FAC {invoice.facReference}
                      </div>
                    )}
                    {invoice.overRemaining && <span className="badge warn">Over remaining</span>}
                  </div>
                ))}
                {selectedPo.months.length > 0 && (
                  <div>
                    <h3 className="section-title">Months</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPo.months.map((month) => (
                          <tr key={`${month.year}-${month.month}`}>
                            <td>
                              {month.year}-{String(month.month).padStart(2, "0")}
                            </td>
                            <td>{formatEgp(month.amountEgp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="section-title">In-progress pipeline</h2>
            <div className="pipeline-list">
              {data.pipelineIecs.map((iec) => (
                <div className="pipeline-item" key={iec.id}>
                  <div>
                    <strong>{iec.title}</strong>
                    <span className="badge">{iec.tier}</span>
                  </div>
                  <div>{formatEgp(iec.egp)}</div>
                </div>
              ))}
              {data.pipelinePrs.map((pr) => (
                <div className="pipeline-item" key={pr.id}>
                  <div>
                    <strong>{pr.title}</strong>
                    <span className="muted"> PR</span>
                  </div>
                  <div>{formatEgp(pr.egp)}</div>
                </div>
              ))}
              {data.pipelineIecs.length === 0 && data.pipelinePrs.length === 0 && (
                <div className="muted">No in-progress IECs or PRs.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResourcePage({ config }: { config: ResourceConfig }) {
  const [records, setRecords] = useState<ResourceRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => emptyValues(config.fields));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const listRequestId = useRef(0);

  async function loadList() {
    const requestId = ++listRequestId.current;
    const result = await api<ResourceRecord[]>(config.listPath);
    if (requestId !== listRequestId.current) return;
    if (!result.ok) {
      setListError(result.error);
      setRecords([]);
      return;
    }
    setListError(null);
    setRecords(result.data);
  }

  useEffect(() => {
    setEditingId(null);
    setValues(emptyValues(config.fields));
    setError(null);
    setSuccess(null);
    setListError(null);
    setRecords([]);
    void loadList();
  }, [config]);

  function startNew() {
    setEditingId(null);
    setValues(emptyValues(config.fields));
    setError(null);
    setSuccess(null);
  }

  function startEdit(record: ResourceRecord) {
    setEditingId(config.recordKey(record));
    setValues(config.toFormValues(record));
    setError(null);
    setSuccess(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const body = config.transform(values);
    const isUpdate = editingId !== null || !config.createPath;
    const path = isUpdate
      ? config.updatePath(values, editingId)
      : (config.createPath as string);
    const method = isUpdate ? "PUT" : "POST";
    const result = await api(path, {
      method,
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(isUpdate ? "Updated." : "Created.");
    await loadList();
    if (!isUpdate && result.data && typeof result.data === "object" && result.data !== null) {
      startEdit(result.data as ResourceRecord);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="year-row" style={{ justifyContent: "space-between" }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            {config.title}
          </h2>
          <button type="button" className="linkish" onClick={startNew}>
            New
          </button>
        </div>
        {listError && <div className="error">{listError}</div>}
        {records.length === 0 && !listError ? (
          <div className="muted">No records yet.</div>
        ) : (
          <ul className="pipeline-list" style={{ listStyle: "none", padding: 0, margin: "0.85rem 0 0" }}>
            {records.map((record) => {
              const key = config.recordKey(record);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`linkish${editingId === key ? " active" : ""}`}
                    onClick={() => startEdit(record)}
                  >
                    {config.rowLabel(record)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form className="card stack" onSubmit={(event) => void onSubmit(event)}>
        <h2 className="section-title">{editingId ? "Edit record" : "New record"}</h2>
        <div className="form-grid">
          {config.fields.map((field) => (
            <label key={field.name}>
              {field.label}
              {field.type === "select" ? (
                <select
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  required={!field.optional}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option || "blank"} value={option}>
                      {option === "" ? "—" : option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  step={field.type === "number" ? "any" : undefined}
                  value={values[field.name] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                  }
                  disabled={config.listPath === "/api/rates" && field.name === "year" && editingId !== null}
                  required={!field.optional && field.type !== "nullable-text" && field.type !== "month"}
                  placeholder={
                    field.type === "month"
                      ? "YYYY-MM"
                      : field.name === "submissionDate"
                        ? "YYYY-MM-DD"
                        : undefined
                  }
                />
              )}
            </label>
          ))}
        </div>
        <button className="primary" type="submit">
          Save
        </button>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </form>
    </div>
  );
}
