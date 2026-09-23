import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { Hono } from "hono";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type SafeJoinResult =
  | { kind: "ok"; path: string }
  | { kind: "invalid-uri" }
  | { kind: "outside-root" };

function safeJoin(root: string, requestPath: string): SafeJoinResult {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  } catch {
    return { kind: "invalid-uri" };
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root + sep) && candidate !== root) {
    return { kind: "outside-root" };
  }
  return { kind: "ok", path: candidate };
}

function looksLikeFilePath(pathname: string): boolean {
  const lastSegment = pathname.split("/").filter(Boolean).pop() ?? "";
  return lastSegment.includes(".");
}

function acceptsHtml(accept: string | undefined): boolean {
  if (!accept) return false;
  return accept.split(",").some((part) => {
    const type = part.trim().split(";")[0]?.trim().toLowerCase() ?? "";
    return type === "text/html" || type === "application/xhtml+xml";
  });
}

/** Serves `client/dist` (or any root) for production GETs that are not under `/api`. */
export function createStaticApp(clientDist: string): Hono {
  const app = new Hono();
  app.get("*", async (c) => {
    if (!existsSync(clientDist)) {
      return c.text("Client build missing. Run vite build.", 404);
    }
    const joined = safeJoin(clientDist, c.req.path);
    if (joined.kind === "invalid-uri") {
      return c.text("Bad request", 400);
    }
    if (joined.kind === "ok" && existsSync(joined.path)) {
      const data = await readFile(joined.path);
      return new Response(data, {
        status: 200,
        headers: { "content-type": MIME[extname(joined.path)] ?? "application/octet-stream" },
      });
    }
    // Missing file-like paths always 404 — never SPA-fallback even when Accept includes HTML.
    if (looksLikeFilePath(c.req.path)) {
      return c.text("Not found", 404);
    }
    // SPA fallback only for extension-less navigation routes that accept HTML.
    if (acceptsHtml(c.req.header("accept"))) {
      const indexPath = join(clientDist, "index.html");
      if (existsSync(indexPath)) {
        const data = await readFile(indexPath);
        return new Response(data, {
          status: 200,
          headers: { "content-type": MIME[".html"] },
        });
      }
    }
    return c.text("Not found", 404);
  });
  return app;
}
