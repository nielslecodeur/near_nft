/**
 * Sets up the public demo agent ("try to make it overspend").
 *
 * - demo-agent.<deployer>: a sub-account that owns a Characters NFT and one
 *   Payer agent on it. Its full-access key stays in ~/.near-credentials.
 * - The agent may pay ONE account, its own owner, so a successful payment just
 *   moves USDC back home; 1 USDC per payment, 2 USDC per day.
 * - Its agent key is published in demo/agent-key.json ON PURPOSE. It is a
 *   function-call key limited to `agent_pay` on the agents contract, no
 *   deposit, 0.5 NEAR of gas: it cannot withdraw, change limits, pause or move
 *   the NFT. Anyone can try; the contract refuses and logs every overspend.
 *
 *   npx tsx scripts/setup-demo-agent.ts            # dry run (prints the plan)
 *   npx tsx scripts/setup-demo-agent.ts --execute  # create / resume setup
 *   npx tsx scripts/setup-demo-agent.ts --fund 3   # move 3 USDC from the demo account into the agent
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const AGENTS: string = pub.agents.contract;
const USDC: string = pub.agents.usdc;
const EXAMPLE_NFT = "nft.examples.testnet";
const ART = "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const USDC_UNIT = 1_000_000n;
const POLICY = { per_tx_max: USDC_UNIT.toString(), per_day_max: (2n * USDC_UNIT).toString() };
const execute = process.argv.includes("--execute");
const fundAt = process.argv.indexOf("--fund");

const provider = new JsonRpcProvider({ url: RPC });
const { credential } = await testnetCredential();
const deployer = new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
const DEMO = `demo-agent.${credential.account_id}`;
const demoCredPath = join(credentialDirectory, `${DEMO}.json`);
const STATE = "demo/agent-key.json";

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
const exists = async (id: string) => {
  try {
    await provider.query({ request_type: "view_account", account_id: id, finality: "final" });
    return true;
  } catch {
    return false;
  }
};
const call = async (who: Account, receiver: string, method: string, args: object, deposit: bigint, tgas = 100n) => {
  const r = await who.signAndSendTransaction({
    receiverId: receiver,
    actions: [actions.functionCall(method, args, tgas * TGAS, deposit)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  const s = r.status as { SuccessValue?: string };
  const text = s.SuccessValue ? Buffer.from(s.SuccessValue, "base64").toString() : "";
  return { hash: r.transaction.hash, value: text ? JSON.parse(text) : null };
};
const state = async () => {
  try {
    return JSON.parse(await readFile(STATE, "utf8"));
  } catch {
    return null;
  }
};

console.log(JSON.stringify({ demo_account: DEMO, agents: AGENTS, nft_contract: EXAMPLE_NFT, policy: "1 USDC per payment, 2 USDC per day, payee = itself", execute }, null, 2));

if (fundAt > 0) {
  const amount = BigInt(Math.round(Number(process.argv[fundAt + 1]) * 1e6));
  const st = await state();
  const cred = JSON.parse(await readFile(demoCredPath, "utf8"));
  const demo = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(cred.private_key));
  const r = await call(demo, USDC, "ft_transfer_call", { receiver_id: AGENTS, amount: amount.toString(), msg: JSON.stringify({ seat_id: st.seat_id }) }, 1n);
  console.log(`Funded agent #${st.seat_id} with ${Number(amount) / 1e6} USDC · tx ${r.hash}`);
  process.exit(0);
}
if (!execute) process.exit(0);

// 1. The demo account (0.6 NEAR: seat storage, NFT, gas for the agent key).
let demoKey: KeyPair;
if (!(await exists(DEMO))) {
  demoKey = KeyPair.fromRandom("ed25519");
  await mkdir(credentialDirectory, { recursive: true });
  await writeFile(demoCredPath, JSON.stringify({ account_id: DEMO, public_key: demoKey.getPublicKey().toString(), private_key: demoKey.toString() }), { mode: 0o600 });
  const r = await deployer.signAndSendTransaction({
    receiverId: DEMO,
    actions: [actions.createAccount(), actions.transfer((6n * N) / 10n), actions.addFullAccessKey(demoKey.getPublicKey())],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  console.log(`1. created ${DEMO} · tx ${r.transaction.hash}`);
} else {
  const cred = JSON.parse(await readFile(demoCredPath, "utf8"));
  demoKey = KeyPair.fromString(cred.private_key);
  console.log(`1. ${DEMO} exists`);
}
const demo = new Account(DEMO, provider, KeyPairSigner.fromSecretKey(demoKey.toString() as `ed25519:${string}`));

// 2. Registered on USDC so it can hold and receive USDC.
if (!(await view(USDC, "storage_balance_of", { account_id: DEMO }))) {
  const r = await call(deployer, USDC, "storage_deposit", { account_id: DEMO, registration_only: true }, 125n * 10n ** 19n, 30n);
  console.log(`2. registered on USDC · tx ${r.hash}`);
} else console.log("2. already registered on USDC");

// 3. A Characters NFT to carry the agent.
const owned = await view<{ token_id: string }[]>(EXAMPLE_NFT, "nft_tokens_for_owner", { account_id: DEMO, from_index: "0", limit: 10 });
let tokenId = owned.find((t) => t.token_id.startsWith("character-"))?.token_id;
if (!tokenId) {
  tokenId = `character-space-warrior-demo-${Date.now()}`;
  const r = await call(
    deployer,
    EXAMPLE_NFT,
    "nft_mint",
    {
      token_id: tokenId,
      receiver_id: DEMO,
      metadata: { title: "Space Warrior", description: "Characters: the public demo agent. Try to make it overspend.", media: `${ART}/space-warrior.webp`, copies: 1 },
    },
    N / 10n,
  );
  console.log(`3. minted ${EXAMPLE_NFT} #${tokenId} · tx ${r.hash}`);
} else console.log(`3. owns ${EXAMPLE_NFT} #${tokenId}`);

// 4. The Payer seat: one payee, itself.
let seat = await view<{ seat_id: string } | null>(AGENTS, "seat_for_nft", { nft_contract: EXAMPLE_NFT, token_id: tokenId });
if (!seat) {
  const r = await call(demo, AGENTS, "create_seat", { nft_contract: EXAMPLE_NFT, token_id: tokenId, kind: "Payer", policy: { ...POLICY, payees: [DEMO], market: null } }, N / 10n, 120n);
  seat = { seat_id: r.value };
  console.log(`4. created agent #${seat.seat_id} · tx ${r.hash}`);
} else console.log(`4. agent #${seat.seat_id} exists`);

// 5. The public agent key: agent_pay only, 0.5 NEAR of gas.
let st = await state();
if (!st || st.seat_id !== seat.seat_id) {
  const agentKey = KeyPair.fromRandom("ed25519");
  const add = await demo.signAndSendTransaction({
    receiverId: DEMO,
    actions: [actions.addFunctionCallAccessKey(agentKey.getPublicKey(), AGENTS, ["agent_pay"], N / 2n)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  const set = await call(demo, AGENTS, "set_agent_key", { seat_id: seat.seat_id, public_key: agentKey.getPublicKey().toString() }, 1n, 30n);
  st = {
    note:
      "PUBLIC ON PURPOSE. This function-call key can only call agent_pay on the agents contract, with no deposit and 0.5 NEAR of gas. Try to make the agent overspend: the contract refuses and logs it.",
    network: "testnet",
    account_id: DEMO,
    seat_id: seat.seat_id,
    agents_contract: AGENTS,
    nft: `${EXAMPLE_NFT} #${tokenId}`,
    allowed_payee: DEMO,
    limits: "1 USDC per payment, 2 USDC per day",
    public_key: agentKey.getPublicKey().toString(),
    secret_key: agentKey.toString(),
  };
  await mkdir("demo", { recursive: true });
  await writeFile(STATE, JSON.stringify(st, null, 2) + "\n");
  console.log(`5. agent key added (${add.transaction.hash}) and set on the seat (${set.hash}) → ${STATE}`);
} else console.log(`5. ${STATE} already holds the agent key`);

const usdc = BigInt(await view<string>(USDC, "ft_balance_of", { account_id: DEMO }));
console.log(`\nDemo account holds ${Number(usdc) / 1e6} USDC. Next: send it a few USDC, then run --fund <amount>.`);
