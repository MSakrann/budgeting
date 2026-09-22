import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "../store/types.js";

export type SessionPayload = {
  email: string;
  role: UserRole;
  name: string;
  exp: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signSession(
  payload: { email: string; role: UserRole; name: string; exp?: number },
  sessionSecret: string,
): string {
  const body: SessionPayload = {
    email: payload.email,
    role: payload.role,
    name: payload.name,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + DEFAULT_TTL_SECONDS,
  };
  const json = JSON.stringify(body);
  const data = Buffer.from(json, "utf8").toString("base64url");
  const sig = createHmac("sha256", sessionSecret).update(json).digest("base64url");
  return `${data}.${sig}`;
}

export function readSession(token: string, sessionSecret: string): SessionPayload | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  let json: string;
  try {
    json = Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", sessionSecret).update(json).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(json) as SessionPayload;
    if (
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
