// `npm test` runs backend tests; `npm start` serves the built app on one port.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { backend, frontend, isWin, requireVenv } from "./py.mjs";

const python = requireVenv();
const mode = process.argv[2];
const opts = { cwd: backend, stdio: "inherit", shell: isWin };

if (mode === "test") {
  process.exit(spawnSync(python, ["-m", "pytest", "-q"], opts).status ?? 1);
}
if (mode === "start") {
  if (!existsSync(join(frontend, "dist", "index.html"))) {
    const b = spawnSync("npm", ["run", "build"], { cwd: frontend, stdio: "inherit", shell: isWin });
    if (b.status !== 0) process.exit(b.status ?? 1);
  }
  const port = process.env.PORT ?? "8000";
  console.log(`\n  StudyFlow → http://localhost:${port}\n`);
  process.exit(spawnSync(python, ["-m", "uvicorn", "app.main:app", "--host", process.env.HOST ?? "127.0.0.1", "--port", port], opts).status ?? 1);
}
console.error("usage: node scripts/run.mjs test|start");
process.exit(1);
