// Start the FastAPI backend and Vite frontend together, with prefixed logs.
import { spawn } from "node:child_process";
import { backend, frontend, isWin, requireVenv } from "./py.mjs";

const python = requireVenv();
const procs = [];

function start(name, color, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, shell: isWin, env: { ...process.env, FORCE_COLOR: "1" } });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => out.write(tag + l + "\n")));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stderr);
  p.on("exit", (code) => {
    console.log(`${tag}exited (${code})`);
    shutdown(code ?? 0);
  });
  procs.push(p);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("api", "35", python, ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"], backend);
start("web", "36", "npm", ["run", "dev", "--", "--host", "127.0.0.1"], frontend);
console.log("\n  StudyFlow → http://localhost:5173   (API: http://localhost:8000/docs)\n");
