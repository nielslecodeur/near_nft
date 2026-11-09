/**
 * An agent arrives in a wallet with nothing to send: no link, no message (testnet).
 *
 *   npx tsx scripts/inbox-testnet-proof.ts [--keep]
 *
 * The demo account puts an agent with a public GitHub skill on a fresh NFT and
 * transfers the NFT to the deployer. The transfer's own event names the agent and
 * where to claim it. Then, knowing only the receiver's account, the one-file MCP
 * server (public/mcp/agent-wallet.mjs, the real build) finds the agent waiting on
 * its NFTs (`received_agents`) and gives the install command, which is run here in
 * a throwaway home and installs the skill. The receiver claims it and the inbox is
 * empty again. `--keep` stops before the claim, to leave one waiting for a demo.
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const NFT = "nft.examples.testnet";
const APP = "https://near-nft-wheat.vercel.app";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const SKILL = "https://github.com/janestreet/agent_skills/tree/master/socratic-tutor";
const keep = process.argv.includes("--keep");
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const { credential } = await testnetCredential();
const receiver = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const SENDER = `demo-agent.${credential.account_id}`;
const sender = new Account(SENDER, provider, KeyPairSigner.fromSecretKey(JSON.parse(await readFile(join(credentialDirectory, `${SENDER}.json`), "utf8")).private_key));

const checks: string[] = [];
const txs: Record<string, string> = {};
const pass = (n: string) => (checks.push(n), console.log("✓", n));
type Out = { transaction: { hash: string }; status: unknown; receipts_outcome: { outcome: { logs: string[] } }[] };
async function send(who: Account, receiverId: string, method: string, args: object, deposit: bigint, tgas: bigint, label: string) {
  const r = (await who.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, tgas * TGAS, deposit)], waitUntil: "FINAL", throwOnFailure: true })) as unknown as Out;
  txs[label] = r.transaction.hash;
  return r;
}

// The receiver's AI: the one-file MCP server, told nothing but the account.
const mcp = new Client({ name: "inbox-proof", version: "1.0.0" });
await mcp.connect(new StdioClientTransport({ command: process.execPath, args: ["public/mcp/agent-wallet.mjs", "--demo"], stderr: "inherit" }));
type Received = { seat_id: string; name: string; from: string; skill: { install_claude_code?: string } | null; claim: string };
const inbox = async () => {
  const r = await mcp.callTool({ name: "received_agents", arguments: { account: receiver.accountId } });
  assert.ok(!r.isError, JSON.stringify(r.content));
  return (JSON.parse((r.content as { text: string }[])[0].text) as { received: Received[] }).received;
};
const before = (await inbox()).map((a) => a.seat_id);

// Test NEAR for the sender's storage deposits, from the receiver when it runs low.
const balanceOf = async (a: string) => BigInt(((await provider.query({ request_type: "view_account", account_id: a, finality: "final" } as never)) as unknown as { amount: string }).amount);
if ((await balanceOf(SENDER)) < (4n * N) / 10n)
  await receiver.signAndSendTransaction({ receiverId: SENDER, actions: [actions.transfer(N / 2n)], waitUntil: "FINAL", throwOnFailure: true });

// 1. The sender's agent, with a public skill, on a fresh NFT.
const tokenId = `character-angel-inbox-${Date.now()}`;
await send(sender, NFT, "nft_mint", { token_id: tokenId, receiver_id: SENDER, metadata: { title: "Angel", description: `Characters: carries an AI agent. ${APP.replace("https://", "")}/agents`, media: `${ART}/angel.webp`, copies: 1 } }, N / 10n, 100n, "mint");
const created = await send(sender, AGENTS, "create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy: null, profile: { name: "Study buddy", role: "skill", tool: "claude-code", avatar: null, manifest: SKILL } }, N / 10n, 150n, "create_seat");
const seatId = JSON.parse(Buffer.from((created.status as { SuccessValue: string }).SuccessValue, "base64").toString()) as string;
const key = `v2-${seatId}`;
pass(`${SENDER} has agent ${key} "Study buddy" (skill: janestreet/agent_skills) on ${NFT} #${tokenId}`);

// 2. Only the NFT moves. Its transfer event says what it carries and where to claim it.
const memo = `AI agent "Study buddy" on this NFT: claim it at ${APP}/agents/${key}`;
const moved = await send(sender, NFT, "nft_transfer", { receiver_id: receiver.accountId, token_id: tokenId, memo }, 1n, 50n, "nft_transfer");
assert.ok(moved.receipts_outcome.flatMap((o) => o.outcome.logs).some((l) => l.includes("nft_transfer") && l.includes(`${APP}/agents/${key}`)));
pass(`the NFT is in ${receiver.accountId}'s wallet; its on-chain transfer event carries "${memo}"`);

// 3. Nothing was sent to the receiver: their AI finds the agent from their account alone.
const waiting = await inbox();
const mine = waiting.find((a) => a.seat_id === key);
assert.ok(mine, `not found in ${JSON.stringify(waiting)}`);
assert.equal(mine.from, SENDER);
assert.ok(!before.includes(key));
assert.ok(mine.claim.includes(`${APP}/agents/${key}`));
pass(`received_agents(${receiver.accountId}) finds "${mine.name}" from ${SENDER}, with no link or message`);

// 4. The install command it gives is run as is, in a throwaway home: the skill lands in ~/.claude/skills.
const home = await mkdtemp(join(tmpdir(), "inbox-proof-"));
try {
  assert.ok(mine.skill?.install_claude_code);
  execFileSync("bash", ["-c", mine.skill.install_claude_code], { env: { ...process.env, HOME: home }, stdio: "pipe", timeout: 120_000 });
  assert.ok(existsSync(join(home, ".claude", "skills", "socratic-tutor", "SKILL.md")));
} finally {
  await rm(home, { recursive: true, force: true });
}
pass("the AI runs the install command it was given: ~/.claude/skills/socratic-tutor/SKILL.md is there");

// 5. One signature from the receiver, and nothing is left waiting.
if (!keep) {
  await send(receiver, AGENTS, "claim_seat", { seat_id: seatId }, 1n, 100n, "claim");
  assert.ok(!(await inbox()).some((a) => a.seat_id === key));
  pass("the receiver claims it (one signature): the inbox no longer lists it");
} else console.log(`kept unclaimed: ${APP}/agents?as=${receiver.accountId}`);
await mcp.close();

if (!keep) {
  const out = { at: new Date().toISOString(), contract: AGENTS, seat_key: key, nft: `${NFT} #${tokenId}`, from: SENDER, to: receiver.accountId, memo, checks, transactions: txs };
  await mkdir("docs/results", { recursive: true });
  await writeFile("docs/results/inbox-testnet-proof.json", JSON.stringify(out, null, 2) + "\n");
  console.log(`\n${checks.length} checks passed → docs/results/inbox-testnet-proof.json`);
}
