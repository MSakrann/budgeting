import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { verifyPassword } from "../auth/password.js";
import { readSession, signSession } from "../auth/session.js";
import { buildDashboard } from "../domain/dashboard.js";
import type { Store, User } from "../store/types.js";

const COOKIE_NAME = "budget_session";
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "Lax" as const, path: "/" };

type Variables = { user: User };
type AppEnv = { Variables: Variables };
type AppContext = Context<AppEnv>;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

export function createApp(store: Store, sessionSecret: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  async function userFromCookie(c: AppContext): Promise<User | null> {
    const token = getCookie(c, COOKIE_NAME);
    if (!token) return null;
    const session = readSession(token, sessionSecret);
    if (!session) return null;
    return store.findUserByEmail(session.email);
  }

  app.post("/api/session", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    if (!body.email || !body.password) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const user = await store.findUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const token = signSession(
      { email: user.email, role: user.role, name: user.name },
      sessionSecret,
    );
    setCookie(c, COOKIE_NAME, token, COOKIE_OPTIONS);
    return c.json({ email: user.email, role: user.role, name: user.name });
  });

  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (c.req.method === "POST" && path === "/api/session") {
      return next();
    }
    const user = await userFromCookie(c);
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (user.role === "viewer") {
      const allowed =
        (c.req.method === "GET" && path === "/api/session") ||
        (c.req.method === "GET" && path === "/api/dashboard");
      if (!allowed) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
    c.set("user", user);
    await next();
  });

  app.get("/api/session", (c) => {
    const user = c.get("user");
    return c.json({ email: user.email, role: user.role, name: user.name });
  });

  app.delete("/api/session", (c) => {
    deleteCookie(c, COOKIE_NAME, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/api/dashboard", async (c) => {
    const yearParam = c.req.query("year");
    const year = yearParam !== undefined && yearParam !== "" ? Number(yearParam) : new Date().getFullYear();
    if (!Number.isFinite(year)) {
      return c.json({ error: "Invalid year" }, 400);
    }
    try {
      const dashboard = buildDashboard(await store.loadLedger(), year);
      return c.json(dashboard);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/rates/:year", async (c) => {
    const year = Number(c.req.param("year"));
    const body = await c.req.json<{ usdToEgp: number; eurToEgp: number }>();
    try {
      const rates = await store.upsertRates({ year, usdToEgp: body.usdToEgp, eurToEgp: body.eurToEgp });
      return c.json(rates);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.post("/api/budget-lines", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.createBudgetLine(body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/budget-lines/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.updateBudgetLine(c.req.param("id"), body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.delete("/api/budget-lines/:id", async (c) => {
    try {
      await store.deleteBudgetLine(c.req.param("id"));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.post("/api/purchase-requests", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.createPurchaseRequest(body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/purchase-requests/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.updatePurchaseRequest(c.req.param("id"), body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.delete("/api/purchase-requests/:id", async (c) => {
    try {
      await store.deletePurchaseRequest(c.req.param("id"));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.post("/api/iecs", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.createIec(body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/iecs/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.updateIec(c.req.param("id"), body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.delete("/api/iecs/:id", async (c) => {
    try {
      await store.deleteIec(c.req.param("id"));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.post("/api/purchase-orders", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.createPurchaseOrder(body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/purchase-orders/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.updatePurchaseOrder(c.req.param("id"), body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.delete("/api/purchase-orders/:id", async (c) => {
    try {
      await store.deletePurchaseOrder(c.req.param("id"));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.post("/api/invoices", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.createInvoice(body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.put("/api/invoices/:id", async (c) => {
    const body = await c.req.json();
    try {
      return c.json(await store.updateInvoice(c.req.param("id"), body));
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  app.delete("/api/invoices/:id", async (c) => {
    try {
      await store.deleteInvoice(c.req.param("id"));
      return c.body(null, 204);
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 400);
    }
  });

  return app;
}
