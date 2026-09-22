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

function safeJoin(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
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
    const filePath = safeJoin(clientDist, c.req.path);
    if (filePath && existsSync(filePath)) {
      const data = await readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" },
      });
    }
    // SPA fallback only for navigation requests that accept HTML — not missing assets.
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
