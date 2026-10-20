#!/usr/bin/env node
// Starts the local engine (FastAPI) and the web interface (Next.js) together.
// Usage: npm run dev   (from the repository root)
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const python = join(root, "backend", ".venv", isWindows ? "Scripts/python.exe" : "bin/python");

if (!existsSync(python)) {
  console.error("The backend isn't set up yet. Run the setup script first:");
  console.error(isWindows ? "  powershell -ExecutionPolicy Bypass -File scripts\\setup.ps1" : "  ./scripts/setup.sh");
  process.exit(1);
}
if (!existsSync(join(root, "frontend", "node_modules"))) {
  console.error("Frontend dependencies are missing. Run the setup script first.");
  process.exit(1);
}

// Load REELFORGE_* settings from a root .env file, without overriding the shell.
const envFile = join(root, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const colors = { engine: "\x1b[35m", web: "\x1b[36m" };
const children = [];

function run(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, shell: isWindows, env: process.env });
  const prefix = `${colors[name]}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line) out.write(prefix + line + "\n");
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("engine", python, ["-m", "reelforge"], join(root, "backend"));
run("web", "npm", ["run", "dev"], join(root, "frontend"));
console.log("ReelForge is starting: open http://localhost:3000 (press Ctrl+C to stop)");
