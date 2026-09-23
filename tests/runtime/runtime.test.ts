import { describe, expect, it } from "vitest";
import { bootstrapApp, resolveSessionSecret } from "../../src/runtime.js";

describe("runtime", () => {
  it("requires SESSION_SECRET in production", () => {
    expect(() => resolveSessionSecret({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
    expect(resolveSessionSecret({ SESSION_SECRET: "x", NODE_ENV: "production" })).toBe("x");
  });

  it("bootstraps an API app on the memory store", async () => {
    const app = await bootstrapApp({
      SESSION_SECRET: "test-secret",
      EDITOR_ONE_EMAIL: "a@orange.com",
      EDITOR_ONE_PASSWORD: "one",
      EDITOR_ONE_NAME: "A",
      EDITOR_TWO_EMAIL: "b@orange.com",
      EDITOR_TWO_PASSWORD: "two",
      EDITOR_TWO_NAME: "B",
      VIEWER_EMAIL: "cto@orange.com",
      VIEWER_PASSWORD: "view",
      VIEWER_NAME: "CTO",
      // Missing workbook is fine — seed skips ENOENT.
      CONSUMPTION_XLSX: "references/does-not-exist.xlsx",
    });
    const response = await app.request("/api/session");
    expect(response.status).toBe(401);
  });
});
