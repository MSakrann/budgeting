import { hashPassword } from "./auth/password.js";
import { importConsumption, type ConsumptionRow } from "./import/consumption.js";
import type { Store } from "./store/types.js";

const CONSUMPTION_IMPORT_KEY = "consumption-2026";

type SeedUser = {
  email: string | undefined;
  password: string | undefined;
  name: string | undefined;
  role: "editor" | "viewer";
};

function isMissingFileError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "ENOENT") return true;
  // ExcelJS throws a plain Error with this message (no ENOENT code).
  if (err instanceof Error && /^File not found:/i.test(err.message)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isMissingFileError(cause);
  return false;
}

async function ensureSeedUser(store: Store, user: SeedUser, label: string): Promise<void> {
  if (!user.email || !user.password || !user.name) {
    throw new Error(`Missing required seed env vars for ${label}`);
  }
  if ((await store.findUserByEmail(user.email)) !== null) return;
  await store.ensureUser({
    email: user.email,
    name: user.name,
    role: user.role,
    passwordHash: await hashPassword(user.password),
  });
}

export async function seed(
  store: Store,
  env: NodeJS.ProcessEnv,
  readRows: () => Promise<ConsumptionRow[]>,
): Promise<void> {
  await ensureSeedUser(store, {
    email: env.EDITOR_ONE_EMAIL,
    password: env.EDITOR_ONE_PASSWORD,
    name: env.EDITOR_ONE_NAME,
    role: "editor",
  }, "EDITOR_ONE");
  await ensureSeedUser(store, {
    email: env.EDITOR_TWO_EMAIL,
    password: env.EDITOR_TWO_PASSWORD,
    name: env.EDITOR_TWO_NAME,
    role: "editor",
  }, "EDITOR_TWO");
  await ensureSeedUser(store, {
    email: env.VIEWER_EMAIL,
    password: env.VIEWER_PASSWORD,
    name: env.VIEWER_NAME,
    role: "viewer",
  }, "VIEWER");

  const ledger = await store.loadLedger();
  if (!ledger.rates.some((rates) => rates.year === 2026)) {
    await store.upsertRates({ year: 2026, usdToEgp: 52.6, eurToEgp: 61 });
  }

  if (await store.hasImport(CONSUMPTION_IMPORT_KEY)) return;

  let rows: ConsumptionRow[];
  try {
    rows = await readRows();
  } catch (err) {
    if (isMissingFileError(err)) {
      console.warn("Consumption workbook missing; skipping import");
      return;
    }
    throw err;
  }

  const existing = await store.loadLedger();
  const created = importConsumption(rows, {
    purchaseOrders: existing.purchaseOrders,
    invoices: existing.invoices,
  });

  const poIdByImportId = new Map<string, string>();
  for (const po of existing.purchaseOrders) {
    poIdByImportId.set(po.id, po.id);
  }

  for (const po of created.purchaseOrders) {
    const { id: _importId, ...input } = po;
    const saved = await store.createPurchaseOrder(input);
    poIdByImportId.set(po.id, saved.id);
  }

  for (const invoice of created.invoices) {
    const purchaseOrderId = poIdByImportId.get(invoice.purchaseOrderId);
    if (!purchaseOrderId) {
      throw new Error(`Missing purchase order for invoice ${invoice.id}`);
    }
    const { id: _importId, purchaseOrderId: _po, ...input } = invoice;
    await store.createInvoice({ ...input, purchaseOrderId });
  }

  await store.markImport(CONSUMPTION_IMPORT_KEY);
}
