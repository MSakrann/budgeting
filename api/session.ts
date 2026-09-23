/**
 * Lightweight /api/session handler.
 * GET without a cookie returns 401 immediately — no Neon, no ExcelJS, no seed.
 */
export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

function hasSessionCookie(req: Request): boolean {
  const cookie = req.headers.get("cookie") ?? "";
  return /(?:^|;\s*)budget_session=/.test(cookie);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "GET" && !hasSessionCookie(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Heavy app only when logging in or validating an existing cookie.
  const { handleApiRequest } = await import("../src/vercel-entry.js");
  return handleApiRequest(req);
}
