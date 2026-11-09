/**
 * Selling an AI agent with its NFT and its budget, on NEAR testnet.
 *
 *   npx tsx scripts/agent-market-testnet-proof.ts
 *
 * The demo account (seller) mints a Characters NFT, puts an agent on it (v2) with
 * 0.3 USDC of budget, and lists it on the agent market for 0.2 NEAR, budget
 * included (one wallet request in the app: pause, budget follows, nft_approve).
 * The deployer (buyer) cannot buy under changed terms nor call the market's
 * callbacks; then buys: the NFT is theirs, the seller got exactly the price, and
 * after claiming, the agent holds the 0.3 USDC with its name and record. Then the
 * new owner lists it with a budget it did not promise on chain: the demo account's
 * purchase is refunded and nothing moves.
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const NFT = "nft.examples.testnet";
const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const PRICE = N / 5n; // 0.2 NEAR
const BUDGET = 300_000n; // 0.3 USDC
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents_v2.contract;
const MARKET: string = pub.agent_market?.contract ?? (() => { throw Error("Deploy the market first: scripts/deploy-agent-market-testnet.ts --execute"); })();
const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const { credential } = await testnetCredential();
const buyer = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const SELLER = `demo-agent.${credential.account_id}`;
const seller = new Account(SELLER, provider, KeyPairSigner.fromSecretKey(JSON.parse(await readFile(join(credentialDirectory, `${SELLER}.json`), "utf8")).private_key));

const checks: string[] = [];
const txs: Record<string, string> = {};
const pass = (n: string) => (checks.push(n), console.log("✓", n));
const view = async <T>(contract: string, method: string, args: object = {}): Promise<T> => {
  const r = (await provider.query({ request_type: "call_function", account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"), finality: "final" } as never)) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};
const balance = async (a: string) => BigInt(((await provider.query({ request_type: "view_account", account_id: a, finality: "final" } as never)) as unknown as { amount: string }).amount);
type Out = { transaction: { hash: string }; status: unknown; receipts_outcome: { outcome: { logs: string[]; status: unknown } }[] };
async function send(who: Account, receiverId: string, acts: ReturnType<typeof actions.functionCall>[], label: string, mayFail = false) {
  const r = (await who.signAndSendTransaction({ receiverId, actions: acts, waitUntil: "FINAL", throwOnFailure: !mayFail })) as unknown as Out;
  txs[label] = r.transaction.hash;
  return r;
}
const failed = (r: Out) => typeof r.status === "object" && r.status !== null && "Failure" in r.status;
const logs = (r: Out) => r.receipts_outcome.flatMap((o) => o.outcome.logs);
const fc = (m: string, a: object, deposit: bigint, tgas = 100n) => actions.functionCall(m, a, tgas * TGAS, deposit);
type SeatV = { seat_id: string; owner: string; balance: string; paused: boolean; budget_follows: boolean; held_for_next_owner: boolean; owners: number; done: number; profile: { name: string } | null };

// 1. The seller's agent: NFT, seat with a profile, 0.3 USDC budget.
const tokenId = `character-space-warrior-sale-${Date.now()}`;
await send(seller, NFT, [fc("nft_mint", { token_id: tokenId, receiver_id: SELLER, metadata: { title: "Space Warrior", description: "Characters: an AI agent for sale with its budget.", media: `${ART}/space-warrior.webp`, copies: 1 } }, N / 10n)], "mint");
const created = await send(seller, AGENTS, [fc("create_seat", { nft_contract: NFT, token_id: tokenId, kind: "Payer", policy: null, profile: { name: "Grant scout", role: "payer", tool: "claude-code", avatar: null, manifest: null } }, N / 10n, 150n)], "create_seat");
const seatId = JSON.parse(Buffer.from((created.status as { SuccessValue: string }).SuccessValue, "base64").toString()) as string;
await send(seller, USDC, [fc("ft_transfer_call", { receiver_id: AGENTS, amount: BUDGET.toString(), msg: JSON.stringify({ seat_id: seatId }) }, 1n)], "fund");
let seat = await view<SeatV>(AGENTS, "seat", { seat_id: seatId });
assert.equal(seat.balance, BUDGET.toString());
pass(`${SELLER} has agent v2-${seatId} "Grant scout" on ${NFT} #${tokenId} with 0.3 USDC`);

// 2. List it, budget included: pause + budget follows (agents), then nft_approve (NFT) with the terms.
await send(seller, AGENTS, [fc("set_budget_follows", { seat_id: seatId, follows: true }, 1n, 30n), fc("pause", { seat_id: seatId }, 0n, 15n)], "pause_and_follow");
await send(seller, NFT, [fc("nft_approve", { token_id: tokenId, account_id: MARKET, msg: JSON.stringify({ price: PRICE.toString(), seat_id: seatId, budget: BUDGET.toString() }) }, 10n ** 22n)], "nft_approve");
const listing = await view<{ seller: string; price: string; budget: string; seat_id: string } | null>(MARKET, "listing", { nft_contract: NFT, token_id: tokenId });
assert.deepEqual([listing?.seller, listing?.price, listing?.budget, listing?.seat_id], [SELLER, PRICE.toString(), BUDGET.toString(), seatId]);
pass(`listed on ${MARKET} for 0.2 NEAR with 0.3 USDC promised; the agent is paused and its budget follows the NFT`);

// 3. No deal under other terms, and nobody calls the market's callbacks.
let r = await send(buyer, MARKET, [fc("buy", { nft_contract: NFT, token_id: tokenId, price: PRICE.toString(), budget: (BUDGET + 1n).toString() }, PRICE, 150n)], "buy_wrong_terms", true);
assert.ok(failed(r));
r = await send(buyer, MARKET, [fc("on_post_checked", { listing: { nft_contract: NFT, token_id: tokenId, seller: SELLER, approval_id: "0", price: PRICE.toString(), seat_id: seatId, budget: "0", listed_at: "0" }, buyer: buyer.accountId }, 0n, 30n)], "callback_direct", true);
assert.ok(failed(r));
assert.ok(await view(MARKET, "listing", { nft_contract: NFT, token_id: tokenId }));
pass("a purchase under other terms fails, a direct call to the payout callback fails, and the listing is untouched");

// 4. The purchase.
const sellerBefore = await balance(SELLER);
r = await send(buyer, MARKET, [fc("buy", { nft_contract: NFT, token_id: tokenId, price: PRICE.toString(), budget: BUDGET.toString() }, PRICE, 150n)], "buy");
assert.ok(logs(r).some((l) => l.includes('"event":"sold"')), logs(r).join("\n"));
const owner = (await view<{ owner_id: string }>(NFT, "nft_token", { token_id: tokenId })).owner_id;
assert.equal(owner, buyer.accountId);
// The price, plus the approval's storage the NFT contract refunds on a transfer.
const got = (await balance(SELLER)) - sellerBefore;
assert.ok(got >= PRICE && got < PRICE + 10n ** 22n, `seller got ${got}`);
assert.equal(await view(MARKET, "listing", { nft_contract: NFT, token_id: tokenId }), null);
pass(`bought: the NFT is ${buyer.accountId}'s and the seller received the 0.2 NEAR only once the market saw the budget still there`);

// 5. The buyer claims the agent and its budget.
await send(buyer, AGENTS, [fc("claim_seat", { seat_id: seatId }, 1n)], "claim");
seat = await view<SeatV>(AGENTS, "seat", { seat_id: seatId });
assert.equal(seat.owner, buyer.accountId);
assert.equal(seat.balance, BUDGET.toString());
assert.equal(seat.profile?.name, "Grant scout");
assert.equal(seat.owners, 2);
pass(`claimed: the agent is the buyer's with its 0.3 USDC, its name and its record (owners ${seat.owners})`);

// 6. A promise the chain does not back: the purchase is refunded and nothing moves.
await send(buyer, NFT, [fc("nft_approve", { token_id: tokenId, account_id: MARKET, msg: JSON.stringify({ price: PRICE.toString(), seat_id: seatId, budget: BUDGET.toString() }) }, 10n ** 22n)], "relist_unbacked");
const before = await balance(SELLER);
r = await send(seller, MARKET, [fc("buy", { nft_contract: NFT, token_id: tokenId, price: PRICE.toString(), budget: BUDGET.toString() }, PRICE, 150n)], "buy_refunded");
const refund = logs(r).find((l) => l.includes('"event":"sale_refunded"'));
assert.ok(refund && refund.includes("the budget no longer goes to the buyer") && refund.includes('"buyer_keeps_nft":false'), logs(r).join("\n"));
assert.equal((await view<{ owner_id: string }>(NFT, "nft_token", { token_id: tokenId })).owner_id, buyer.accountId);
const spent = before - (await balance(SELLER));
assert.ok(spent < N / 50n, `only gas is spent, got ${spent}`);
pass("a listing whose budget is not promised on chain cannot sell: the buyer's 0.2 NEAR came back (only gas spent) and the NFT stayed put");

const stats = await view<Record<string, unknown>>(MARKET, "stats");
const out = { at: new Date().toISOString(), market: MARKET, agents: AGENTS, seat_key: `v2-${seatId}`, nft: `${NFT} #${tokenId}`, price_near: "0.2", budget_usdc: "0.3", stats, checks, transactions: txs };
await mkdir("docs/results", { recursive: true });
await writeFile("docs/results/agent-market-testnet-proof.json", JSON.stringify(out, null, 2) + "\n");
console.log(`\n${checks.length} checks passed → docs/results/agent-market-testnet-proof.json`);
