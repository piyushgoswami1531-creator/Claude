// Shared helpers: locate the backend virtualenv's Python on any OS.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const backend = join(root, "backend");
export const frontend = join(root, "frontend");
export const venv = join(backend, ".venv");
export const isWin = process.platform === "win32";
export const venvPython = isWin ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");

export function requireVenv() {
  if (!existsSync(venvPython)) {
    console.error("\n  Backend environment not found. Run `npm run setup` first.\n");
    process.exit(1);
  }
  return venvPython;
}
