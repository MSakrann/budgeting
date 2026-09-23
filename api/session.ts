/**
 * /api/session — must never crash on cold GET without a cookie.
 *
 * Vercel Node invokes (IncomingMessage, ServerResponse), not Web Request.
 * Calling req.headers.get() on Node req throws → FUNCTION_INVOCATION_FAILED.
 * This file has zero top-level imports so the 401 path cannot pull in Neon/Excel.
 */

export const config = {
  maxDuration: 60,
};

const COOKIE_RE = /(?:^|;\s*)budget_session=/;

function readCookieHeader(headers: unknown): string {
  if (!headers || typeof headers !== "object") return "";
  const h = headers as Record<string, unknown>;
  const raw = h.cookie ?? h.Cookie;
  if (Array.isArray(raw)) return raw.join("; ");
  if (typeof raw === "string") return raw;
  // Web Headers
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get: (name: string) => string | null }).get("cookie") ?? "";
  }
  return "";
}

function sendJson(res: NodeRes, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

type NodeRes = {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): void;
  end(chunk?: string | Buffer): void;
  getHeader?(name: string): number | string | string[] | undefined;
};

function isNodeResponse(res: unknown): res is NodeRes {
  return Boolean(res && typeof (res as NodeRes).end === "function" && typeof (res as NodeRes).setHeader === "function");
}

function nodeToWebRequest(req: {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}): Request {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost");
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const path = req.url ?? "/api/session";
  const url = path.startsWith("http") ? path : `${proto}://${host}${path}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "DELETE") {
    // DELETE may have no body; still fine without body.
    return new Request(url, { method, headers });
  }

  let body: string | undefined;
  if (typeof req.body === "string") {
    body = req.body;
  } else if (req.body != null) {
    body = JSON.stringify(req.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  return new Request(url, { method, headers, body });
}

async function writeWebResponse(res: NodeRes, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  const setCookies =
    typeof webRes.headers.getSetCookie === "function" ? webRes.headers.getSetCookie() : [];
  webRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (setCookies.length === 1) {
    res.setHeader("Set-Cookie", setCookies[0]!);
  } else if (setCookies.length > 1) {
    res.setHeader("Set-Cookie", setCookies);
  }
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
}

async function handleHeavyNode(req: {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}, res: NodeRes): Promise<void> {
  try {
    const { handleApiRequest } = await import("../src/vercel-entry.js");
    const webRes = await handleApiRequest(nodeToWebRequest(req));
    await writeWebResponse(res, webRes);
  } catch (err) {
    console.error("[api/session] heavy handler failed:", err);
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Server error",
    });
  }
}

/**
 * Supports both Vercel Node (req, res) and Web Handler (Request → Response).
 */
export default async function handler(req: any, res?: any): Promise<any> {
  // --- Node.js Serverless Function shape ---
  if (isNodeResponse(res)) {
    const method = String(req?.method ?? "GET").toUpperCase();
    const cookie = readCookieHeader(req?.headers);
    if (method === "GET" && !COOKIE_RE.test(cookie)) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
    await handleHeavyNode(req, res);
    return;
  }

  // --- Web Request shape (Edge / newer runtimes) ---
  const webReq = req as Request;
  const method = webReq.method.toUpperCase();
  const cookie = readCookieHeader(webReq.headers);
  if (method === "GET" && !COOKIE_RE.test(cookie)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const { handleApiRequest } = await import("../src/vercel-entry.js");
    return await handleApiRequest(webReq);
  } catch (err) {
    console.error("[api/session] heavy web handler failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
