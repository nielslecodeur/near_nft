// Starts the Agent Wallet MCP server (scripts/agent-mcp.ts) on any OS.
// Plain JS on purpose: it runs with bare `node`, before any TypeScript tooling.
// On Windows the repo's node_modules are installed from WSL (Linux esbuild),
// so the server runs inside WSL; elsewhere it runs directly with tsx.
// stdio is passed through untouched: it is the MCP channel.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function toWsl(p) {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : p;
}

const child =
  process.platform === "win32"
    ? spawn("wsl", ["bash", toWsl(resolve(root, "scripts/agent-mcp-wsl.sh")), ...process.argv.slice(2)], { stdio: "inherit" })
    : spawn("npx", ["tsx", resolve(root, "scripts/agent-mcp.ts"), ...process.argv.slice(2)], { stdio: "inherit", cwd: root });

child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
