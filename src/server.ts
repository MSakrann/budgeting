import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import postgres from "postgres";
import { createPostgresStore } from "./db/postgres-store.js";
import { createApp } from "./http/app.js";
import { requestBodyFromBuffer } from "./http/request-body.js";
import { createStaticApp } from "./http/static-files.js";
import { readConsumptionWorkbook } from "./import/read-xlsx.js";
import { seed } from "./seed.js";
import { createMemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";

const port = Number(process.env.PORT ?? 3000);
const clientDist = join(process.cwd(), "client", "dist");

function resolveSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required when NODE_ENV is production");
  }
  return "dev-session-secret";
}

const sessionSecret = resolveSessionSecret();

async function openStore(): Promise<Store> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    // createPostgresStore accepts a postgres.js Sql client (or PGlite).
    const sql = postgres(databaseUrl);
    return createPostgresStore(sql);
  }
  console.warn("DATABASE_URL unset; using in-memory store");
  return createMemoryStore();
}

async function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  return requestBodyFromBuffer(Buffer.concat(chunks));
}

function createRequestHandler(
  app: ReturnType<typeof createApp>,
  staticApp: ReturnType<typeof createStaticApp>,
) {
  async function handleFetch(
    req: IncomingMessage,
    res: ServerResponse,
    target: { fetch: (request: Request) => Response | Promise<Response> },
  ): Promise<void> {
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
    const response = await target.fetch(request);
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

  return (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url?.split("?")[0] ?? "/";
    const target = path.startsWith("/api") ? app : staticApp;
    void handleFetch(req, res, target).catch((err) => {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "Server error");
    });
  };
}

async function main(): Promise<void> {
  const store = await openStore();
  const workbookPath =
    process.env.CONSUMPTION_XLSX ?? "references/Data - List of POs 2026.xlsx";
  await seed(store, process.env, () => readConsumptionWorkbook(workbookPath));
  const app = createApp(store, sessionSecret);
  const staticApp = createStaticApp(clientDist);
  createServer(createRequestHandler(app, staticApp)).listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
