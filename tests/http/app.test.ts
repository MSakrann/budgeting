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

  it("rejects a second login POST when the viewer already has a session cookie", async () => {
    const app = await editorApp();
    const cookie = await login(app, "cto@orange.com");
    const again = await app.request("/api/session", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ email: "cto@orange.com", password: "secret" }),
    });
    expect(again.status).toBe(403);
  });

  it("lets the viewer delete the session to log out", async () => {
    const app = await editorApp();
    const cookie = await login(app, "cto@orange.com");
    const logout = await app.request("/api/session", {
      method: "DELETE",
      headers: { cookie },
    });
    expect(logout.status).toBe(204);
    const setCookie = logout.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toMatch(/budget_session=/);
  });

  it("lists resources for editors, blocks viewers, and returns dashboard years", async () => {
    const app = await editorApp();
    const editor = await login(app, "editor@orange.com");
    const viewer = await login(app, "cto@orange.com");

    const created = await app.request("/api/budget-lines", {
      method: "POST",
      headers: { cookie: editor, "content-type": "application/json" },
      body: JSON.stringify({
        year: 2025, projectTitle: "Lake", kind: "capex", currency: "EGP", amount: 1000,
      }),
    });
    expect(created.status).toBe(200);
    const line = await created.json();

    const pr = await app.request("/api/purchase-requests", {
      method: "POST",
      headers: { cookie: editor, "content-type": "application/json" },
      body: JSON.stringify({
        title: "PR-only year", year: 2024, amount: 10, currency: "EGP",
        budgetLineId: null, status: "Draft",
      }),
    });
    expect(pr.status).toBe(200);

    const iec = await app.request("/api/iecs", {
      method: "POST",
      headers: { cookie: editor, "content-type": "application/json" },
      body: JSON.stringify({
        title: "IEC-only year", year: 2023, projectCode: "DL", supplier: null,
        kind: "capex", currency: "EGP", budgetAmount: 10, requestedAmount: 10,
        note: null, purchaseRequestId: null, status: "Draft",
      }),
    });
    expect(iec.status).toBe(200);

    const rates = await app.request("/api/rates", { headers: { cookie: editor } });
    expect(rates.status).toBe(200);
    expect(await rates.json()).toEqual([{ year: 2026, usdToEgp: 52.6, eurToEgp: 61 }]);

    const lines = await app.request("/api/budget-lines", { headers: { cookie: editor } });
    expect(lines.status).toBe(200);
    expect(await lines.json()).toEqual([expect.objectContaining({ id: line.id, year: 2025 })]);

    for (const path of [
      "/api/rates",
      "/api/budget-lines",
      "/api/purchase-requests",
      "/api/iecs",
      "/api/purchase-orders",
      "/api/invoices",
    ]) {
      const forbidden = await app.request(path, { headers: { cookie: viewer } });
      expect(forbidden.status).toBe(403);
    }

    const updated = await app.request(`/api/budget-lines/${line.id}`, {
      method: "PUT",
      headers: { cookie: editor, "content-type": "application/json" },
      body: JSON.stringify({
        year: 2025, projectTitle: "Lake Updated", kind: "capex", currency: "EGP", amount: 2000,
      }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ projectTitle: "Lake Updated", amount: 2000 });

    const dashboard = await app.request("/api/dashboard?year=2026", { headers: { cookie: viewer } });
    expect(dashboard.status).toBe(200);
    const body = await dashboard.json();
    expect(body.years).toEqual(
      expect.arrayContaining([new Date().getFullYear(), 2023, 2024, 2025, 2026]),
    );

    const forbiddenDelete = await app.request(`/api/budget-lines/${line.id}`, {
      method: "DELETE",
      headers: { cookie: viewer },
    });
    expect(forbiddenDelete.status).toBe(403);

    const deleted = await app.request(`/api/budget-lines/${line.id}`, {
      method: "DELETE",
      headers: { cookie: editor },
    });
    expect(deleted.status).toBe(204);

    const linesAfter = await app.request("/api/budget-lines", { headers: { cookie: editor } });
    expect(linesAfter.status).toBe(200);
    expect(await linesAfter.json()).toEqual([]);
  });

  it("rejects invalid rates year and non-positive rates", async () => {
    const app = await editorApp();
    const cookie = await login(app, "editor@orange.com");

    const nanYear = await app.request("/api/rates/abc", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ usdToEgp: 1, eurToEgp: 1 }),
    });
    expect(nanYear.status).toBe(400);

    const fracYear = await app.request("/api/rates/2026.5", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ usdToEgp: 1, eurToEgp: 1 }),
    });
    expect(fracYear.status).toBe(400);

    const zero = await app.request("/api/rates/2027", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ usdToEgp: 0, eurToEgp: 61 }),
    });
    expect(zero.status).toBe(400);
    expect(await zero.json()).toMatchObject({ error: expect.stringMatching(/USD/i) });

    const nonNumeric = await app.request("/api/rates/2027", {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ usdToEgp: "x", eurToEgp: 61 }),
    });
    expect(nonNumeric.status).toBe(400);
  });

  it("rejects GBP currency and bogus status on create", async () => {
    const app = await editorApp();
    const cookie = await login(app, "editor@orange.com");
    const gbp = await app.request("/api/budget-lines", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        year: 2026, projectTitle: "X", kind: "capex", currency: "GBP", amount: 1,
      }),
    });
    expect(gbp.status).toBe(400);
    expect(await gbp.json()).toMatchObject({ error: expect.stringMatching(/currency/i) });

    const status = await app.request("/api/purchase-requests", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        title: "X", year: 2026, amount: 1, currency: "EGP",
        budgetLineId: null, status: "Nope",
      }),
    });
    expect(status.status).toBe(400);
    expect(await status.json()).toMatchObject({ error: expect.stringMatching(/status/i) });
  });

  it("does not persist a client-supplied id on create", async () => {
    const app = await editorApp();
    const cookie = await login(app, "editor@orange.com");
    const planted = "22222222-2222-2222-2222-222222222222";
    const created = await app.request("/api/budget-lines", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        id: planted,
        year: 2026, projectTitle: "Owned", kind: "capex", currency: "EGP", amount: 10,
      }),
    });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.id).not.toBe(planted);
  });

  it("returns 400 for malformed JSON bodies", async () => {
    const app = await editorApp();
    const cookie = await login(app, "editor@orange.com");
    const bad = await app.request("/api/budget-lines", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: "{not-json",
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: expect.stringMatching(/JSON/i) });
  });
});
