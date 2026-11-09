/**
 * Agents v2, proven on NEAR testnet with real accounts, a real NFT
 * (nft.examples.testnet) and Circle's testnet USDC.
 *
 * Seller = the demo account, buyer = the deployer (both keys in ~/.near-credentials).
 *   1. a seat created WITH a profile; funded; the agent key pays
 *   2. 5 identical refused attempts merge into one log entry (times = 5)
 *   3. the seller leaves the budget to the next owner; a withdraw first proves
 *      NFT ownership on chain, then goes through
 *   4. the NFT is sold (transferred); the seller's withdraw is refused and the
 *      budget is held for the buyer
 *   5. the buyer claims: profile kept, owners = 2, the held budget is his; he withdraws it
 *
 *   npx tsx scripts/agents-v2-testnet-proof.ts
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const U = 1_000_000n;
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const USDC: string = pub.agents_v2.usdc;
const NFT = "nft.examples.testnet";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";

const provider = new JsonRpcProvider({ url: RPC });
const { credential } = await testnetCredential();
const buyer = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const SELLER = `demo-agent.${credential.account_id}`;
const sellerKey = JSON.parse(await readFile(join(credentialDirectory, `${SELLER}.json`), "utf8")).private_key;
const seller = new Account(SELLER, provider, KeyPairSigner.fromSecretKey(sellerKey));

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
async function call(who: Account, receiver: string, method: string, args: object, deposit: bigint, tgas = 100n, label?: string) {
  const r = await who.signAndSendTransaction({
    receiverId: receiver,
    actions: [actions.functionCall(method, args, tgas * TGAS, deposit)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  if (label) txs[label] = r.transaction.hash;
  const s = r.status as { SuccessValue?: string };
  const text = s.SuccessValue ? Buffer.from(s.SuccessValue, "base64").toString() : "";
  return text ? JSON.parse(text) : null;
}
const checks: string[] = [];
const pass = (name: string) => {
  checks.push(name);
  console.log("✓", name);
};
type Seat = {
  owner: string; balance: string; owners: number; profile: { name: string; role: string } | null;
  budget_follows: boolean; held_for_next_owner: boolean; paused: boolean; refused: number; done: number;
};
const seat = (id: string) => view<Seat>(AGENTS, "seat", { seat_id: id });
const log = (id: string) => view<{ status: string; detail: string; times: number; action: string }[]>(AGENTS, "seat_log", { seat_id: id });
const usdcOf = async (a: string) => BigInt(await view<string>(USDC, "ft_balance_of", { account_id: a }));

// 0. Funds and registrations.
if (BigInt(((await provider.query({ request_type: "view_account", account_id: SELLER, finality: "final" } as never)) as unknown as { amount: string }).amount) < N / 2n) {
  const r = await buyer.signAndSendTransaction({ receiverId: SELLER, actions: [actions.transfer(N / 2n)], waitUntil: "FINAL", throwOnFailure: true });
  txs.top_up_seller = r.transaction.hash;
}
if (!(await view(USDC, "storage_balance_of", { account_id: buyer.accountId })))
  await call(buyer, USDC, "storage_deposit", { account_id: buyer.accountId, registration_only: true }, 125n * 10n ** 19n, 30n, "register_buyer_usdc");
assert.ok((await usdcOf(SELLER)) >= U, "the seller needs 1 USDC");

// 1. A Characters NFT for the seller; a seat with a profile; funding; an agent key that pays.
const tokenId = `character-pocket-guide-v2-${Date.now()}`;
await call(buyer, NFT, "nft_mint", {
  token_id: tokenId,
  receiver_id: SELLER,
  metadata: { title: "Pocket Guide", description: "Characters: the agents v2 testnet proof.", media: `${ART}/angel.webp`, copies: 1 },
}, N / 10n, 100n, "mint");
const profile = { name: "Pocket money", role: "allowance", tool: "runner", avatar: `${ART}/angel.webp`, manifest: null };
const policy = { per_tx_max: (U / 10n).toString(), per_day_max: U.toString(), payees: [SELLER], market: null };
const id: string = await call(seller, AGENTS, "create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy, profile }, N / 10n, 150n, "create_seat");
assert.ok(id, "seat created");
let s = await seat(id);
assert.equal(s.profile?.name, "Pocket money");
assert.equal(s.owners, 1);
pass(`seat #${id} created on ${NFT} #${tokenId} with a profile on chain (owners = 1)`);

await call(seller, USDC, "ft_transfer_call", { receiver_id: AGENTS, amount: U.toString(), msg: JSON.stringify({ seat_id: id }) }, 1n, 100n, "fund");
const agentKey = KeyPair.fromRandom("ed25519");
const added = await seller.signAndSendTransaction({
  receiverId: SELLER,
  actions: [actions.addFunctionCallAccessKey(agentKey.getPublicKey(), AGENTS, ["agent_pay", "agent_buy", "pause"], N)], // 1 NEAR, as the app: the allowance must cover the gas a call reserves (~0.1 NEAR for 100 TGas)
  waitUntil: "FINAL",
  throwOnFailure: true,
});
txs.add_agent_key = added.transaction.hash;
await call(seller, AGENTS, "set_agent_key", { seat_id: id, public_key: agentKey.getPublicKey().toString() }, 1n, 30n, "set_agent_key");
const agent = new Account(SELLER, provider, KeyPairSigner.fromSecretKey(agentKey.toString() as `ed25519:${string}`));
assert.equal(await call(agent, AGENTS, "agent_pay", { seat_id: id, payee: SELLER, amount: (U / 10n).toString(), memo: "v2 proof" }, 0n, 100n, "agent_pay"), true);
assert.equal((await log(id))[0].status, "done");
pass("funded with 1 USDC; the agent key pays 0.1 USDC with no wallet signature");

// 2. A refusal flood collapses into one entry.
for (let i = 0; i < 5; i++)
  assert.equal(await call(agent, AGENTS, "agent_pay", { seat_id: id, payee: "attacker.testnet", amount: (U / 10n).toString() }, 0n, 100n, i === 0 ? "refused" : undefined), false);
const top = (await log(id))[0];
assert.equal(top.status, "refused");
assert.equal(top.times, 5);
assert.ok((await log(id)).some((e) => e.status === "done"), "the payment is still in the log");
pass("5 identical refused attempts are one log entry (times = 5); the payment stays visible");

// 3. Budget follows the NFT; a withdraw first proves ownership, then goes through.
await call(seller, AGENTS, "set_budget_follows", { seat_id: id, follows: true }, 1n, 30n, "set_budget_follows");
assert.equal((await seat(id)).budget_follows, true);
const before = await usdcOf(SELLER);
await call(seller, AGENTS, "withdraw", { seat_id: id, amount: (U / 10n).toString() }, 1n, 150n, "withdraw_with_proof");
assert.equal(await usdcOf(SELLER), before + U / 10n);
pass("budget promised to the next owner; a withdraw proves NFT ownership on chain first, then pays out");

// 4. The NFT is sold: the seller can no longer pull the budget, it is held for the buyer.
await call(seller, NFT, "nft_transfer", { receiver_id: buyer.accountId, token_id: tokenId }, 1n, 50n, "nft_transfer");
const heldAmount = BigInt((await seat(id)).balance);
const refused = await call(seller, AGENTS, "withdraw", { seat_id: id }, 1n, 150n, "withdraw_after_sale");
assert.equal(refused, false);
s = await seat(id);
assert.equal(s.held_for_next_owner, true);
assert.equal(BigInt(s.balance), heldAmount);
pass(`after the sale the seller's withdraw is refused; ${Number(heldAmount) / 1e6} USDC is held for the buyer`);

// 5. The buyer claims: same agent, same profile, owners = 2, the budget is his.
assert.equal(await call(buyer, AGENTS, "claim_seat", { seat_id: id }, 1n, 100n, "claim_seat"), true);
s = await seat(id);
assert.equal(s.owner, buyer.accountId);
assert.equal(s.owners, 2);
assert.equal(s.profile?.name, "Pocket money");
assert.equal(s.held_for_next_owner, false);
assert.equal(BigInt(s.balance), heldAmount);
const buyerBefore = await usdcOf(buyer.accountId);
await call(buyer, AGENTS, "withdraw", { seat_id: id }, 1n, 100n, "buyer_withdraw");
assert.equal(await usdcOf(buyer.accountId), buyerBefore + heldAmount);
pass(`the buyer claims it: profile kept, owners = 2, and he withdraws the ${Number(heldAmount) / 1e6} USDC left to him`);

const result = { at: new Date().toISOString(), contract: AGENTS, seat_id: id, nft: `${NFT} #${tokenId}`, checks, transactions: txs, final_seat: await seat(id) };
await mkdir("docs/results", { recursive: true });
await writeFile("docs/results/agents-v2-testnet-proof.json", JSON.stringify(result, null, 2) + "\n");
console.log(`\n${checks.length} testnet checks passed → docs/results/agents-v2-testnet-proof.json`);
