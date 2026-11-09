// Starts the Agent Wallet MCP server (scripts/agent-mcp.ts) on any OS.
// Plain JS on purpose: it runs with bare `node`, before any TypeScript tooling.
//
// Fast path: dist-mcp/agent-mcp.mjs, a single-file bundle (`npm run build:mcp`)
// that plain node starts in well under a second, on Windows too. It is used
// only when it is newer than the sources, so a stale bundle never runs.
// Slow path (no bundle, or sources changed): tsx from source; inside WSL when
// the repo's node_modules were installed from WSL (Linux esbuild only).
// stdio is passed through untouched: it is the MCP channel.
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const bundle = resolve(root, "dist-mcp/agent-mcp.mjs");
const sources = ["scripts/agent-mcp.ts", "scripts/agent-runner-core.ts"].map((p) => resolve(root, p));

function toWsl(p) {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : p;
}

function bundleIsFresh() {
  if (!existsSync(bundle)) return false;
  const built = statSync(bundle).mtimeMs;
  return sources.every((s) => !existsSync(s) || statSync(s).mtimeMs <= built);
}

let child;
if (bundleIsFresh()) {
  child = spawn(process.execPath, [bundle, ...args], { stdio: "inherit", cwd: process.cwd() });
} else {
  console.error("[agent-mcp] no up-to-date bundle, starting from source (slow). Run `npm run build:mcp` for a fast start.");
  const linuxModulesOnWindows =
    process.platform === "win32" && !existsSync(resolve(root, "node_modules/@esbuild/win32-x64")) && existsSync(resolve(root, "node_modules/@esbuild/linux-x64"));
  child = linuxModulesOnWindows
    ? spawn("wsl", ["bash", toWsl(resolve(root, "scripts/agent-mcp-wsl.sh")), ...args], { stdio: "inherit" })
    : spawn("npx", ["tsx", resolve(root, "scripts/agent-mcp.ts"), ...args], { stdio: "inherit", cwd: root, shell: process.platform === "win32" });
}

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
