/**
 * "I found an agent on GitHub, put it on an NFT and gave it to a friend", on testnet.
 *
 * Me = the deployer, my friend = the demo account (both keys in ~/.near-credentials).
 *   1. I mint a Characters NFT and put an identity-only agent on it (agents v2): no
 *      policy, no budget, its name and its GitHub skill link in the on-chain profile
 *   2. the contract refuses any spending by it (there is nothing to spend, no key)
 *   3. I send the NFT to my friend; my friend claims the agent: same profile, owners = 2
 *
 *   npx tsx scripts/skill-agent-testnet-proof.ts
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const NFT = "nft.examples.testnet";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const SKILL = "https://github.com/janestreet/agent_skills";

const provider = new JsonRpcProvider({ url: RPC });
const { credential } = await testnetCredential();
const me = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const FRIEND = `demo-agent.${credential.account_id}`;
const friendKey = JSON.parse(await readFile(join(credentialDirectory, `${FRIEND}.json`), "utf8")).private_key;
const friend = new Account(FRIEND, provider, KeyPairSigner.fromSecretKey(friendKey));

const view = async <T>(contract: string, method: string, args: object = {}): Promise<T> => {
  const r = (await provider.query({
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "optimistic",
  } as never)) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};
const txs: Record<string, string> = {};
async function call(who: Account, receiver: string, method: string, args: object, deposit: bigint, tgas: bigint, label: string) {
  const r = await who.signAndSendTransaction({
    receiverId: receiver,
    actions: [actions.functionCall(method, args, tgas * TGAS, deposit)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  txs[label] = r.transaction.hash;
  const s = r.status as { SuccessValue?: string };
  const text = s.SuccessValue ? Buffer.from(s.SuccessValue, "base64").toString() : "";
  return text ? JSON.parse(text) : null;
}
const checks: string[] = [];
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};
type Seat = { owner: string; owners: number; policy: unknown; balance: string; agent_key: string | null; profile: { name: string; role: string; manifest: string | null } | null };

// 1. My NFT, my identity-only agent.
const tokenId = `character-socratic-tutor-${Date.now()}`;
await call(me, NFT, "nft_mint", {
  token_id: tokenId,
  receiver_id: me.accountId,
  metadata: { title: "Socratic Tutor", description: "Characters: an AI skill found on GitHub, carried by an NFT.", media: `${ART}/galaxy-princess.webp`, copies: 1 },
}, N / 10n, 100n, "mint");
const profile = { name: "Socratic tutor", role: "skill", tool: "claude-code", avatar: null, manifest: SKILL };
const id: string = await call(me, AGENTS, "create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy: null, profile }, N / 10n, 150n, "create_seat");
let s = await view<Seat>(AGENTS, "seat", { seat_id: id });
assert.equal(s.policy, null);
assert.equal(s.profile?.manifest, SKILL);
pass(`v2 seat #${id}: "Socratic tutor" on ${NFT} #${tokenId}, skill link on chain, no policy, no budget`);

// 2. Nothing to spend: funding USDC into it would work, but with no policy the contract refuses any action.
assert.equal(s.agent_key, null);
assert.equal(s.balance, "0");
pass("no key and no budget: the agent can move no money");

// 3. To my friend, who claims it.
await call(me, NFT, "nft_transfer", { receiver_id: FRIEND, token_id: tokenId }, 1n, 50n, "nft_transfer");
assert.equal(await call(friend, AGENTS, "claim_seat", { seat_id: id }, 1n, 100n, "claim_seat"), true);
s = await view<Seat>(AGENTS, "seat", { seat_id: id });
assert.equal(s.owner, FRIEND);
assert.equal(s.owners, 2);
assert.deepEqual(s.profile, profile);
pass(`my friend claims it: same name and skill link, owners = 2 → open /agents/v2-${id}`);

const result = { at: new Date().toISOString(), contract: AGENTS, seat_key: `v2-${id}`, nft: `${NFT} #${tokenId}`, skill: SKILL, checks, transactions: txs };
await mkdir("docs/results", { recursive: true });
await writeFile("docs/results/skill-agent-testnet-proof.json", JSON.stringify(result, null, 2) + "\n");
console.log(`\n${checks.length} checks passed → docs/results/skill-agent-testnet-proof.json`);
