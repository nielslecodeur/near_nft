/**
 * Real take-over test on testnet, run as the demo account.
 *
 *   npx tsx scripts/takeover-test.ts            # find seats whose NFT the demo account now holds (read only)
 *   npx tsx scripts/takeover-test.ts --execute  # claim the seat, then set it up with a new key in ONE tx, fund it and let the agent act
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const TGAS = 10n ** 12n;
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents.contract;
const USDC: string = pub.agents.usdc;
const execute = process.argv.includes("--execute");

const provider = new JsonRpcProvider({ url: RPC });
const { credential } = await testnetCredential();
const DEMO = `demo-agent.${credential.account_id}`;
const demoCred = JSON.parse(await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8"));
const demo = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(demoCred.private_key));

const view = async <T>(contract: string, method: string, args: object = {}): Promise<T> => {
  const r = (await provider.query({
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    finality: "optimistic",
  })) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};

type Seat = { seat_id: string; owner: string; nft_contract: string; token_id: string; kind: string; asset: string; balance: string; paused: boolean; policy: unknown; agent_key: string | null };
const stats = await view<Record<string, unknown>>(AGENTS, "stats");
const total = Number((stats as { seats_created?: string }).seats_created ?? 0);
const found: Seat[] = [];
for (let id = 1; id <= total + 2; id++) {
  const s = await view<Seat | null>(AGENTS, "seat", { seat_id: String(id) }).catch(() => null);
  if (!s) continue;
  const tok = await view<{ owner_id: string } | null>(s.nft_contract, "nft_token", { token_id: s.token_id }).catch(() => null);
  if (tok?.owner_id === DEMO && s.seat_id !== "9") found.push(s);
}
console.log(JSON.stringify({ demo: DEMO, stats, seats_now_on_demo_nfts: found }, null, 2));
if (!execute || found.length === 0) process.exit(0);

const seat = found[found.length - 1];
const tx = async (receiver: string, acts: ReturnType<typeof actions.functionCall>[]) => {
  const r = await demo.signAndSendTransaction({ receiverId: receiver, actions: acts, waitUntil: "FINAL", throwOnFailure: true });
  return r.transaction.hash as string;
};

// 1. claim (resets the seat to the demo account; the old budget goes to the sender's refunds)
if (seat.owner !== DEMO) {
  const h = await tx(AGENTS, [actions.functionCall("claim_seat", { seat_id: seat.seat_id }, 100n * TGAS, 1n)]);
  console.log("claim_seat", h);
}
const claimed = await view<Seat>(AGENTS, "seat", { seat_id: seat.seat_id });
console.log("after claim", JSON.stringify(claimed));

// 2. new agent key on the demo account + ONE agents tx: set_policy, resume, set_agent_key
const key = KeyPair.fromRandom("ed25519");
const pk = key.getPublicKey().toString();
const methods = claimed.kind === "Buyer" ? ["agent_buy", "pause"] : ["agent_pay", "pause"];
await demo.signAndSendTransaction({
  receiverId: DEMO,
  actions: [actions.addFunctionCallAccessKey(key.getPublicKey(), AGENTS, methods, 500_000_000_000_000_000_000_000n)],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
const U = 1_000_000n;
const policy = { per_tx_max: U.toString(), per_day_max: (2n * U).toString(), payees: claimed.kind === "Payer" ? [DEMO] : [], market: null };
const setupActs = [actions.functionCall("set_policy", { seat_id: seat.seat_id, policy }, 30n * TGAS, 1n)];
if (claimed.paused) setupActs.push(actions.functionCall("resume", { seat_id: seat.seat_id }, 20n * TGAS, 1n));
setupActs.push(actions.functionCall("set_agent_key", { seat_id: seat.seat_id, public_key: pk }, 20n * TGAS, 1n));
console.log("setup", await tx(AGENTS, setupActs));

// 3. fund 1 USDC and let the new agent pay itself home
if (claimed.kind === "Payer") {
  console.log(
    "fund",
    await tx(USDC, [actions.functionCall("ft_transfer_call", { receiver_id: AGENTS, amount: U.toString(), msg: JSON.stringify({ seat_id: seat.seat_id }) }, 100n * TGAS, 1n)]),
  );
  const agent = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(key.toString() as `ed25519:${string}`));
  const r = await agent.signAndSendTransaction({
    receiverId: AGENTS,
    actions: [actions.functionCall("agent_pay", { seat_id: seat.seat_id, payee: DEMO, amount: (U / 2n).toString(), memo: "takeover test" }, 100n * TGAS, 0n)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  console.log("agent_pay", r.transaction.hash);
}
console.log("final", JSON.stringify(await view<Seat>(AGENTS, "seat", { seat_id: seat.seat_id })));
console.log("log", JSON.stringify((await view<unknown[]>(AGENTS, "seat_log", { seat_id: seat.seat_id })).slice(-4)));
