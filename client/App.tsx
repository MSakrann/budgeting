import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
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

const STATUSES = ["Draft", "In progress", "Approved", "Rejected", "Closed"];
const CURRENCIES = ["EGP", "USD", "EUR"];
const KINDS = ["capex", "opex"];

const RESOURCE_CONFIG: Record<
  Exclude<Page, "dashboard">,
  {
    title: string;
    method: "POST" | "PUT";
    path: (values: Record<string, string>) => string;
    fields: FieldConfig[];
    transform?: (values: Record<string, string>) => unknown;
  }
> = {
  rates: {
    title: "Rates",
    method: "PUT",
    path: (values) => `/api/rates/${values.year}`,
    fields: [
      { name: "year", label: "Year", type: "number" },
      { name: "usdToEgp", label: "USD to EGP", type: "number" },
      { name: "eurToEgp", label: "EUR to EGP", type: "number" },
    ],
    transform: (values) => ({
      usdToEgp: Number(values.usdToEgp),
      eurToEgp: Number(values.eurToEgp),
    }),
  },
  "budget-lines": {
    title: "Budget lines",
    method: "POST",
    path: () => "/api/budget-lines",
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
  },
  prs: {
    title: "Purchase requests",
    method: "POST",
    path: () => "/api/purchase-requests",
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
  },
  iecs: {
    title: "IECs",
    method: "POST",
    path: () => "/api/iecs",
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
  },
  pos: {
    title: "Purchase orders",
    method: "POST",
    path: () => "/api/purchase-orders",
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
  },
  invoices: {
    title: "Invoices",
    method: "POST",
    path: () => "/api/invoices",
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
  },
};

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function parseMonth(value: string): { year: number; month: number } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
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
  const [knownYears, setKnownYears] = useState<number[]>(() => [new Date().getFullYear()]);

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

      {page === "dashboard" ? (
        <Dashboard knownYears={knownYears} setKnownYears={setKnownYears} />
      ) : (
        <ResourcePage
          config={RESOURCE_CONFIG[page]}
          onYearSaved={(year) => {
            setKnownYears((prev) => Array.from(new Set([...prev, year])).sort((a, b) => a - b));
          }}
        />
      )}
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

function Dashboard({
  knownYears,
  setKnownYears,
}: {
  knownYears: number[];
  setKnownYears: Dispatch<SetStateAction<number[]>>;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setError(null);
      const result = await api<DashboardData>(`/api/dashboard?year=${year}`);
      if (!result.ok) {
        setData(null);
        setError(result.error);
        return;
      }
      setData(result.data);
      setSelectedPoId(null);
      const discovered = new Set<number>([currentYear, result.data.year]);
      for (const po of result.data.purchaseOrders) {
        for (const month of po.months) discovered.add(month.year);
      }
      setKnownYears((prev) => Array.from(new Set([...prev, ...discovered])).sort((a, b) => a - b));
    })();
  }, [year, currentYear, setKnownYears]);

  const years = useMemo(
    () => Array.from(new Set([...knownYears, currentYear, year])).sort((a, b) => a - b),
    [knownYears, currentYear, year],
  );

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

function ResourcePage({
  config,
  onYearSaved,
}: {
  config: (typeof RESOURCE_CONFIG)[Exclude<Page, "dashboard">];
  onYearSaved: (year: number) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.fields.map((field) => [field.name, ""])),
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(config.fields.map((field) => [field.name, ""])));
    setError(null);
    setSuccess(null);
  }, [config]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    const body = config.transform ? config.transform(values) : values;
    const result = await api(config.path(values), {
      method: config.method,
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess("Saved.");
    if (values.year) onYearSaved(Number(values.year));
    if (values.budgetYear) onYearSaved(Number(values.budgetYear));
  }

  return (
    <form className="card stack" onSubmit={(event) => void onSubmit(event)}>
      <h2 className="section-title">{config.title}</h2>
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
  );
}
