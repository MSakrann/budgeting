import { handle } from "hono/vercel";
import { bootstrapApp, waitForSeed } from "./runtime.js";

type App = Awaited<ReturnType<typeof bootstrapApp>>;

let appPromise: Promise<App> | null = null;

function getApp(): Promise<App> {
  if (!appPromise) {
    appPromise = bootstrapApp().catch((err) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

/** Full Hono API for routes that need the database. */
export async function handleApiRequest(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  const app = await getApp();

  if (req.method === "POST" && path.endsWith("/session")) {
    await waitForSeed();
  }

  return handle(app)(req);
}
