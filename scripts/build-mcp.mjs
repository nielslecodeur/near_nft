// Builds the Agent Wallet MCP server (scripts/agent-mcp.ts) into ONE file that
// plain `node` runs, with no repo, no npm install, no TypeScript:
//   dist-mcp/agent-mcp.mjs        used by scripts/agent-mcp-launch.mjs (fast start)
//   public/mcp/agent-wallet.mjs   served by the site and committed, so anyone can
//                                 download it (raw GitHub URL works without hosting)
// Run: npm run build:mcp
import { build } from "esbuild";
import { copyFile, mkdir, stat } from "node:fs/promises";

const banner = [
  "#!/usr/bin/env node",
  "// Agent Wallet MCP server, one-file build of scripts/agent-mcp.ts (NEAR testnet).",
  "// Usage: node agent-wallet.mjs --demo | --key <agent-key.json> | --help",
  "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
].join("\n");

await build({
  entryPoints: ["scripts/agent-mcp.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  minify: true,
  legalComments: "none",
  outfile: "dist-mcp/agent-mcp.mjs",
  banner: { js: banner },
  logLevel: "warning",
});
await mkdir("public/mcp", { recursive: true });
await copyFile("dist-mcp/agent-mcp.mjs", "public/mcp/agent-wallet.mjs");
const { size } = await stat("public/mcp/agent-wallet.mjs");
console.log(`MCP bundle: dist-mcp/agent-mcp.mjs and public/mcp/agent-wallet.mjs (${(size / 1024).toFixed(0)} KB)`);
