/**
 * Catch-all /api/* (except /api/session).
 * Vercel Node passes (IncomingMessage, ServerResponse) — adapt to Web Request for Hono.
 */

export const config = {
  maxDuration: 60,
};

type NodeRes = {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): void;
  end(chunk?: string | Buffer): void;
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
  const path = req.url ?? "/api";
  const url = path.startsWith("http") ? path : `${proto}://${host}${path}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "DELETE") {
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

export default async function handler(req: any, res?: any): Promise<any> {
  const { handleApiRequest } = await import("../src/vercel-entry.js");

  if (isNodeResponse(res)) {
    try {
      const webRes = await handleApiRequest(nodeToWebRequest(req));
      await writeWebResponse(res, webRes);
    } catch (err) {
      console.error("[api/[...route]] failed:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }));
    }
    return;
  }

  try {
    return await handleApiRequest(req as Request);
  } catch (err) {
    console.error("[api/[...route]] web failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
