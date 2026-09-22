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
    expect([200, 201]).toContain(po.status);
    const created = await po.json();
    expect(typeof created.id).toBe("string");
    expect(created.id.length).toBeGreaterThan(0);
    const rejected = await app.request("/api/invoices", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderId: created.id, amount: 2_000_000, currency: "EGP",
        submissionDate: "2026-05-18", description: null, receiptNumber: "6892", facReference: null,
      }),
    });
    expect(rejected.status).toBe(400);
    const body = await rejected.json();
    expect(body.error).toMatch(/receipt/i);
    expect(body.error).toMatch(/FAC/i);
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
