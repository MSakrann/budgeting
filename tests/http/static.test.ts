import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../../src/auth/password.js";
import { createApp } from "../../src/http/app.js";
import { requestBodyFromBuffer } from "../../src/http/request-body.js";
import { createStaticApp } from "../../src/http/static-files.js";
import { createMemoryStore } from "../../src/store/memory.js";

describe("request body", () => {
  it("keeps only the Buffer bytes so JSON login bodies parse", async () => {
    const payload = { email: "a@orange.com", password: "secret" };
    const json = Buffer.from(JSON.stringify(payload));
    const pooled = Buffer.allocUnsafe(json.length + 64);
    json.copy(pooled);
    const sliced = pooled.subarray(0, json.length);
    expect(sliced.buffer.byteLength).toBeGreaterThan(sliced.byteLength);

    const body = requestBodyFromBuffer(sliced);
    expect(body.byteLength).toBe(json.length);
    expect(JSON.parse(new TextDecoder().decode(body))).toEqual(payload);

    const store = createMemoryStore();
    await store.ensureUser({
      email: "a@orange.com",
      name: "A",
      role: "editor",
      passwordHash: await hashPassword("secret"),
    });
    const app = createApp(store, "test-secret");
    const response = await app.request("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: "a@orange.com", role: "editor" });
  });
});

describe("static files", () => {
  it("serves client/dist/index.html for GET /", async () => {
    const root = mkdtempSync(join(tmpdir(), "budget-static-"));
    const html = "<!DOCTYPE html><html><head><title>Data Lake Budget</title></head><body></body></html>";
    writeFileSync(join(root, "index.html"), html);
    const app = createStaticApp(root);
    const response = await app.request("/", {
      headers: { accept: "text/html" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toBe(html);
  });

  it("returns 404 for missing assets instead of SPA index.html", async () => {
    const root = mkdtempSync(join(tmpdir(), "budget-static-"));
    writeFileSync(join(root, "index.html"), "<!DOCTYPE html><html></html>");
    const app = createStaticApp(root);
    const response = await app.request("/assets/missing.js", {
      headers: { accept: "*/*" },
    });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toMatch(/DOCTYPE/i);
  });

  it("falls back to index.html for HTML navigation to unknown routes", async () => {
    const root = mkdtempSync(join(tmpdir(), "budget-static-"));
    const html = "<!DOCTYPE html><html><body>app</body></html>";
    writeFileSync(join(root, "index.html"), html);
    const app = createStaticApp(root);
    const response = await app.request("/invoices", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
  });
});
