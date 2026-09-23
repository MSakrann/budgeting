import { Hono } from "hono";
import { handle } from "hono/vercel";
import { bootstrapApp } from "../dist/runtime.js";

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

// Lazy bootstrap so the function can start; first request opens Neon, seeds users/rates, then serves.
const gateway = new Hono();
gateway.all("*", async (c) => {
  const app = await getApp();
  return app.fetch(c.req.raw);
});

export default handle(gateway);
