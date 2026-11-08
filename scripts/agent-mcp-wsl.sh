#!/usr/bin/env bash
# Runs the MCP server inside WSL (used by scripts/agent-mcp-launch.mjs on Windows).
# Only stderr may carry logs: stdout is the MCP channel.
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
exec npx --no-install tsx scripts/agent-mcp.ts "$@"
