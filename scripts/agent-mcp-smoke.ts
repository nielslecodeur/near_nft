/**
 * Smoke test for the Agent Wallet MCP server, with a real MCP client over
 * stdio: lists the tools and calls the read-only ones on testnet.
 * Run: npx tsx scripts/agent-mcp-smoke.ts  (needs npm run agent:runner)
 */
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "agent-wallet-smoke", version: "1.0.0" });
await client.connect(
  new StdioClientTransport({ command: "npx", args: ["tsx", "scripts/agent-mcp.ts"], stderr: "inherit" }),
);
const text = (r: Awaited<ReturnType<typeof client.callTool>>) =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, ["agent_status", "buy", "list_agents", "list_market", "pause", "pay", "received_agents"]);
console.log("✓ tools:", tools.join(", "));

const agents = await client.callTool({ name: "list_agents", arguments: {} });
assert.ok(!agents.isError, text(agents));
const parsed = JSON.parse(text(agents));
assert.ok(Array.isArray(parsed.agents) && parsed.agents.length > 0);
console.log(`✓ list_agents: ${parsed.account}, ${parsed.agents.length} agents`);
console.log(JSON.stringify(parsed.agents[0], null, 2));

const first = parsed.agents[0].seat_id;
const status = await client.callTool({ name: "agent_status", arguments: { seat_id: first } });
assert.ok(!status.isError, text(status));
console.log(`✓ agent_status #${first}: ${JSON.parse(text(status)).recent_activity.length} recent entries`);

const market = await client.callTool({ name: "list_market", arguments: {} });
assert.ok(!market.isError, text(market));
console.log(`✓ list_market: ${JSON.parse(text(market)).listings.length} listings`);

const wrong = await client.callTool({ name: "agent_status", arguments: { seat_id: "999999" } });
assert.ok(wrong.isError);
console.log("✓ unknown agent returns an error result:", text(wrong));

await client.close();
