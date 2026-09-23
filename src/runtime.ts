import { join } from "node:path";
import postgres from "postgres";
import { createPostgresStore } from "./db/postgres-store.js";
import { createApp } from "./http/app.js";
import { readConsumptionWorkbook } from "./import/read-xlsx.js";
import { seed } from "./seed.js";
import { createMemoryStore } from "./store/memory.js";
import type { Store } from "./store/types.js";

export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret) return secret;
  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required when NODE_ENV is production");
  }
  return "dev-session-secret";
}

export async function openStore(env: NodeJS.ProcessEnv = process.env): Promise<Store> {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.warn("DATABASE_URL unset; using in-memory store");
    return createMemoryStore();
  }

  // Serverless / pooled Postgres (Neon, Vercel Postgres, PgBouncer) needs prepare:false and a small pool.
  const serverless = Boolean(env.VERCEL) || env.POSTGRES_POOL === "true";
  const sql = postgres(databaseUrl, {
    max: serverless ? 1 : 10,
    idle_timeout: serverless ? 20 : 0,
    connect_timeout: 10,
    prepare: serverless ? false : true,
  });
  return createPostgresStore(sql);
}

export async function seedStore(
  store: Store,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const workbookPath =
    env.CONSUMPTION_XLSX ?? join(process.cwd(), "references", "Data - List of POs 2026.xlsx");
  await seed(store, env, () => readConsumptionWorkbook(workbookPath));
}

/** Ready Hono app: store opened, seed applied, routes mounted. */
export async function bootstrapApp(env: NodeJS.ProcessEnv = process.env) {
  const store = await openStore(env);
  await seedStore(store, env);
  return createApp(store, resolveSessionSecret(env));
}
