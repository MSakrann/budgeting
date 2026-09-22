import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { createApp } from "./http/app.js";
import { createMemoryStore } from "./store/memory.js";

const port = Number(process.env.PORT ?? 3000);
const sessionSecret = process.env.SESSION_SECRET ?? "dev-session-secret";
const clientDist = join(process.cwd(), "client", "dist");

const store = createMemoryStore();
const app = createApp(store, sessionSecret);

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

async function readBody(req: IncomingMessage): Promise<ArrayBuffer | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).buffer;
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? `localhost:${port}`;
  const url = new URL(req.url ?? "/", `http://${host}`);
  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const request = new Request(url, {
    method: req.method,
    headers,
    body: body as BodyInit | undefined,
    duplex: "half",
  } as RequestInit);
  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.appendHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}

function safeJoin(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split("?")[0] ?? "/");
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root + sep) && candidate !== root) return null;
  return candidate;
}

function handleStatic(req: IncomingMessage, res: ServerResponse): void {
  if (!existsSync(clientDist)) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Client build missing. Run vite build.");
    return;
  }
  let filePath = safeJoin(clientDist, req.url ?? "/");
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(clientDist, "index.html");
  }
  if (!existsSync(filePath)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", MIME[extname(filePath)] ?? "application/octet-stream");
  createReadStream(filePath).pipe(res);
}

createServer((req, res) => {
  const path = req.url?.split("?")[0] ?? "/";
  if (path.startsWith("/api")) {
    void handleApi(req, res).catch((err) => {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "Server error");
    });
    return;
  }
  handleStatic(req, res);
}).listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
