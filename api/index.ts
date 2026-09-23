import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { handle } from "hono/vercel";
import { bootstrapApp, waitForSeed } from "../src/runtime.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

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

const gateway = new Hono();

// No cookie → not signed in. Do not open Neon (avoids cold-start timeouts on first paint).
gateway.get("/api/session", async (c) => {
  if (!getCookie(c, "budget_session")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const app = await getApp();
  return app.fetch(c.req.raw);
});

// Login needs users seeded; wait for seed after store is open.
gateway.post("/api/session", async (c) => {
  const app = await getApp();
  await waitForSeed();
  return app.fetch(c.req.raw);
});

gateway.all("*", async (c) => {
  const app = await getApp();
  return app.fetch(c.req.raw);
});

export default handle(gateway);
