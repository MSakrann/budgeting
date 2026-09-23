import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../client/api.js";

describe("api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok false when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await api("/api/session");
    expect(result).toEqual({ ok: false, status: 0, error: "offline" });
  });
});
