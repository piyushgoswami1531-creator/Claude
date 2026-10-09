// One-time setup: Python venv + backend deps, frontend deps, .env file.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { backend, frontend, isWin, root, venv, venvPython } from "./py.mjs";

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\nSetup failed while running: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function findPython() {
  for (const c of isWin ? ["py", "python", "python3"] : ["python3", "python"]) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8", shell: isWin });
    const m = `${r.stdout}${r.stderr}`.match(/Python 3\.(\d+)/);
    if (r.status === 0 && m && Number(m[1]) >= 10) return c;
  }
  console.error("Python 3.10+ is required. Install it from https://www.python.org/downloads/");
  process.exit(1);
}

if (!existsSync(venvPython)) run(findPython(), ["-m", "venv", venv]);
run(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "-q"]);
run(venvPython, ["-m", "pip", "install", "-r", join(backend, "requirements-dev.txt"), "-q"]);
run("npm", ["install", "--no-audit", "--no-fund"], frontend);

const env = join(root, ".env");
if (!existsSync(env)) {
  copyFileSync(join(root, ".env.example"), env);
  console.log("\nCreated .env. Add your ANTHROPIC_API_KEY there for real AI (the app also runs without it in demo mode).");
}
console.log("\n✓ Setup complete. Start the app with:  npm run dev\n");
