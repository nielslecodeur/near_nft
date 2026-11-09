/**
 * Handing an AI agent over to a teammate, frozen on the commit of the handover (testnet).
 *
 * The agent on v2 seat 4 ("Socratic tutor", janestreet/agent_skills) is held by the demo
 * account. In ONE transaction it freezes the skill link on GitHub's current commit
 * (set_profile) and transfers the NFT (nft_transfer is a separate receiver, so it is a
 * second transaction of the same wallet request in the app). The deployer, as the
 * teammate, claims the agent: the profile on chain now points at that exact commit.
 * The printed install command installs exactly that commit.
 *
 *   npx tsx scripts/handover-testnet-proof.ts [seat=4]
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pinnedLink, skillInstall } from "../src/keepers/skills.js";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const TGAS = 10n ** 12n;
const SEAT = process.argv[2] || "4";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const { credential } = await testnetCredential();
const teammate = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const ME = `demo-agent.${credential.account_id}`;
const me = new Account(ME, provider, KeyPairSigner.fromSecretKey(JSON.parse(await readFile(join(credentialDirectory, `${ME}.json`), "utf8")).private_key));

type Seat = { owner: string; owners: number; nft_contract: string; token_id: string; profile: { name: string; role: string; tool: string | null; avatar: string | null; manifest: string | null } };
const view = async <T>(contract: string, method: string, args: object): Promise<T> => {
  const r = (await provider.query({ request_type: "call_function", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "optimistic" } as never)) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};
const txs: Record<string, string> = {};
const checks: string[] = [];
const pass = (n: string) => (checks.push(n), console.log("✓", n));

let seat = await view<Seat>(AGENTS, "seat", { seat_id: SEAT });
assert.equal(seat.owner, ME, `v2 seat ${SEAT} must be held by ${ME}`);
const link = seat.profile.manifest!;
const before = seat.owners;

// 1. GitHub's current commit, and the link frozen on it.
const repo = /github\.com\/([\w.-]+\/[\w.-]+)/.exec(link)![1];
const head = ((await (await fetch(`https://api.github.com/repos/${repo}/commits/HEAD`)).json()) as { sha: string }).sha;
const frozen = pinnedLink(link, head)!;
assert.ok(frozen && frozen.includes(head));
pass(`${repo} is at ${head.slice(0, 7)} now: the handover freezes ${frozen}`);

// 2. Me -> teammate: freeze, then transfer.
let r = await me.signAndSendTransaction({
  receiverId: AGENTS,
  actions: [actions.functionCall("set_profile", { seat_id: SEAT, profile: { ...seat.profile, manifest: frozen } }, 30n * TGAS, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.freeze = r.transaction.hash;
r = await me.signAndSendTransaction({
  receiverId: seat.nft_contract,
  actions: [actions.functionCall("nft_transfer", { receiver_id: teammate.accountId, token_id: seat.token_id, memo: "hackathon handover" }, 50n * TGAS, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.nft_transfer = r.transaction.hash;
pass(`skill link frozen on chain, NFT sent to ${teammate.accountId}`);

// 3. The teammate claims it.
r = await teammate.signAndSendTransaction({
  receiverId: AGENTS,
  actions: [actions.functionCall("claim_seat", { seat_id: SEAT }, 100n * TGAS, 1n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.claim = r.transaction.hash;
seat = await view<Seat>(AGENTS, "seat", { seat_id: SEAT });
assert.equal(seat.owner, teammate.accountId);
assert.equal(seat.owners, before + 1);
assert.equal(seat.profile.manifest, frozen);
pass(`the teammate holds it: same name "${seat.profile.name}", owners ${before} -> ${seat.owners}, skill frozen at ${head.slice(0, 7)}`);

const install = skillInstall(frozen)!;
console.log(`\ninstall command for the teammate:\n${install.claudeCode}\n`);
const out = { at: new Date().toISOString(), contract: AGENTS, seat_key: `v2-${SEAT}`, repo, commit: head, frozen, install: install.claudeCode, checks, transactions: txs };
await mkdir("docs/results", { recursive: true });
await writeFile("docs/results/handover-testnet-proof.json", JSON.stringify(out, null, 2) + "\n");
console.log(`${checks.length} checks passed → docs/results/handover-testnet-proof.json`);
