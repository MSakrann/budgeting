import { handle } from "hono/vercel";
import { bootstrapApp } from "../dist/runtime.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

// Cold start: open Postgres, seed users/rates/workbook once per instance, then serve Hono.
const app = await bootstrapApp();

export default handle(app);
