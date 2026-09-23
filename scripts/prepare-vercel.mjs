import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const clientDist = join(root, "client", "dist");
const publicDir = join(root, "public");
const distRuntime = join(root, "dist", "runtime.js");

if (!existsSync(clientDist)) {
  throw new Error("client/dist missing — run vite build first");
}
if (!existsSync(distRuntime)) {
  throw new Error("dist/runtime.js missing — run tsc first");
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(clientDist, publicDir, { recursive: true });
console.log("Prepared public/ for Vercel static hosting");
