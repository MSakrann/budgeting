import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";

describe("password", () => {
  it("hashes secret, verifies it, and rejects wrong", async () => {
    const hash = await hashPassword("secret");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("secret", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
