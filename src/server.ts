import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createStaticApp } from "./http/static-files.js";
import { requestBodyFromBuffer } from "./http/request-body.js";
import { bootstrapApp } from "./runtime.js";

const port = Number(process.env.PORT ?? 3000);
const clientDist = join(process.cwd(), "client", "dist");

async function readBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  return requestBodyFromBuffer(Buffer.concat(chunks));
}

function createRequestHandler(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  staticApp: { fetch: (request: Request) => Response | Promise<Response> },
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
  const app = await bootstrapApp();
  const staticApp = createStaticApp(clientDist);
  createServer(createRequestHandler(app, staticApp)).listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
  });
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
