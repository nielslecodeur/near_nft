/**
 * The NFT as the access key to a private agent skill, on the hosted runner and NEAR testnet.
 *
 *   RUNNER_URL=https://agent-wallet-runner.nielshallgren.workers.dev npx tsx scripts/gated-skill-proof.ts
 *
 * A fresh Characters NFT for the demo account. Both accounts sign in to the runner
 * with real NEP-413 signatures (full-access keys). Then: a non-holder can neither
 * store nor read the skill; the holder stores and reads it; the public card shows
 * its name and fingerprint, never its text; the agent card goes on the NFT (v2
 * seat, no money, profile link = the private skill); after the NFT is transferred,
 * the old holder is refused, the new one reads the same skill and claims the card.
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nep413Bytes } from "../src/keepers/nep413.js";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const RUNNER = process.env.RUNNER_URL || "https://agent-wallet-runner.nielshallgren.workers.dev";
const NFT = "nft.examples.testnet";
const AGENTS: string = JSON.parse(await readFile("public/testnet.json", "utf8")).agents_v2.contract;
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const { credential } = await testnetCredential();
const deployerKey = credential.private_key as string;
const deployer = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(deployerKey as `ed25519:${string}`));
const DEMO = `demo-agent.${credential.account_id}`;
const demoKey = JSON.parse(await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8")).private_key as string;
const demo = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(demoKey as `ed25519:${string}`));

const checks: string[] = [];
const txs: Record<string, string> = {};
const pass = (n: string) => (checks.push(n), console.log("✓", n));

/** Signs the runner's challenge like a NEP-413 wallet, and returns a session token. */
async function signIn(accountId: string, secret: string) {
  const c = (await (await fetch(`${RUNNER}/auth/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) })).json()) as {
    nonce: string; message: string; recipient: string;
  };
  const kp = KeyPair.fromString(secret as `ed25519:${string}`);
  const hash = createHash("sha256").update(nep413Bytes({ message: c.message, recipient: c.recipient, nonce: Buffer.from(c.nonce, "base64") })).digest();
  const r = await fetch(`${RUNNER}/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce: c.nonce, accountId, publicKey: kp.getPublicKey().toString(), signature: Buffer.from(kp.sign(hash).signature).toString("base64") }),
  });
  const s = (await r.json()) as { token?: string; error?: string };
  assert.ok(s.token, s.error);
  return s.token!;
}
const gated = (path = "") => `${RUNNER}/gated/${encodeURIComponent(NFT)}/${encodeURIComponent(tokenId)}${path}`;
const call = (token: string | null, method = "GET", body?: unknown) =>
  fetch(gated(), { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });

// A fresh NFT for the demo account.
const tokenId = `character-galaxy-soldier-gated-${Date.now()}`;
let r = await deployer.signAndSendTransaction({
  receiverId: NFT,
  actions: [actions.functionCall("nft_mint", { token_id: tokenId, receiver_id: DEMO, metadata: { title: "Galaxy Soldier", description: "Characters: its private skill opens for the holder only.", media: `${ART}/galaxy-soldier.webp`, copies: 1 } }, 100n * TGAS, N / 10n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.mint = r.transaction.hash;
const [demoToken, deployerToken] = [await signIn(DEMO, demoKey), await signIn(credential.account_id, deployerKey)];
pass(`${DEMO} holds ${NFT} #${tokenId}; both accounts signed in to ${RUNNER} with NEP-413`);

const skill = `---\nname: hackathon-coach\ndescription: "Private test skill: reviews a hackathon submission against its rules."\n---\n\nYou are a hackathon coach. Check the README, the license and the demo link first.\n`;

assert.equal((await call(deployerToken, "PUT", { name: "hackathon-coach", content: skill })).status, 403);
assert.equal((await call(null)).status, 401);
pass("a non-holder cannot store a skill on it, and nobody signed out can read");

let res = await call(demoToken, "PUT", { name: "hackathon-coach", content: skill });
assert.equal(res.status, 200);
const stored = (await res.json()) as { sha256: string };
assert.equal(stored.sha256, createHash("sha256").update(skill).digest("hex"));
res = await call(demoToken);
assert.equal(((await res.json()) as { content: string }).content, skill);
pass(`the holder stores the private skill (sha256 ${stored.sha256.slice(0, 12)}…) and reads it back`);

const meta = (await (await fetch(gated("/meta"))).json()) as Record<string, unknown>;
assert.equal(meta.exists, true);
assert.equal(meta.sha256, stored.sha256);
assert.equal("content" in meta, false);
assert.equal((await call(deployerToken)).status, 403);
pass("the public card shows its name, size and fingerprint, never its text; the non-holder is refused");

// The agent card on the NFT: v2, no policy, its profile links to the private skill.
const profile = { name: "Hackathon coach", role: "skill", tool: "claude-code", avatar: null, manifest: gated() };
r = await demo.signAndSendTransaction({
  receiverId: AGENTS,
  actions: [actions.functionCall("create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy: null, profile }, 150n * TGAS, N / 10n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.create_seat = r.transaction.hash;
const seatId = JSON.parse(Buffer.from((r.status as { SuccessValue: string }).SuccessValue, "base64").toString()) as string;
const view = async <T>(method: string, args: object): Promise<T> => {
  const v = (await provider.query({ request_type: "call_function", account_id: AGENTS, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "final" } as never)) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(v.result).toString());
};
type Seat = { owner: string; owners: number; policy: unknown; profile: { manifest: string | null } | null };
let seat = await view<Seat>("seat", { seat_id: seatId });
assert.equal(seat.profile?.manifest, gated());
assert.equal(seat.policy, null);
pass(`agent card v2-${seatId} on the NFT links to the private skill (${gated().replace(/^https:\/\//, "")}), with no money attached`);

r = await demo.signAndSendTransaction({
  receiverId: NFT,
  actions: [actions.functionCall("nft_transfer", { receiver_id: credential.account_id, token_id: tokenId, memo: "hand over the skill" }, 50n * TGAS, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.nft_transfer = r.transaction.hash;
assert.equal((await call(demoToken)).status, 403);
res = await call(deployerToken);
assert.equal(res.status, 200);
assert.equal(((await res.json()) as { content: string }).content, skill);
r = await deployer.signAndSendTransaction({
  receiverId: AGENTS,
  actions: [actions.functionCall("claim_seat", { seat_id: seatId }, 100n * TGAS, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.claim_seat = r.transaction.hash;
seat = await view<Seat>("seat", { seat_id: seatId });
assert.equal(seat.owner, credential.account_id);
assert.equal(seat.profile?.manifest, gated());
pass(`after the NFT moves to ${credential.account_id}, the old holder is refused, the new one reads the same skill and claims the card (owners ${seat.owners})`);

const out = { at: new Date().toISOString(), runner: RUNNER, contract: AGENTS, seat_key: `v2-${seatId}`, nft: `${NFT} #${tokenId}`, sha256: stored.sha256, checks, transactions: txs };
await mkdir("docs/results", { recursive: true });
await writeFile("docs/results/gated-skill-proof.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${checks.length} checks passed → docs/results/gated-skill-proof.json`);
