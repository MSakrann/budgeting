import { handleApiRequest } from "../src/vercel-entry.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

/** Catch-all for /api/* except /api/session (handled by api/session.ts). */
export default async function handler(req: Request): Promise<Response> {
  return handleApiRequest(req);
}
