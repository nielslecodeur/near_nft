/**
 * Keeps the public demo agent (#9) usable through judging.
 *
 * Its key is published on purpose, so anyone can spend its gas allowance with
 * refused calls, or drain its budget 2 USDC a day (back to the demo account).
 * This reads its health and, with --execute, repairs it from the demo account:
 *   - budget below 2 USDC (one day)        -> top it up to 6 USDC (ft_transfer_call)
 *   - agent key allowance below 0.2 NEAR   -> re-add the SAME public key with a fresh
 *                                             allowance, so the published secret stays valid
 *   - demo account below 0.25 NEAR         -> top up from the deployer, when its key is here
 *   - seat paused                          -> resume (the demo key cannot pause, the owner can)
 * Exit code 1 when something is still wrong after the run (for a scheduler).
 *
 *   npx tsx scripts/demo-agent-watch.ts             # report only
 *   npx tsx scripts/demo-agent-watch.ts --execute   # report and repair
 *   ... --execute --refresh-key                      # also re-add the agent key with a fresh allowance now
 *
 * Credentials: the demo account's full-access key from ~/.near-credentials/testnet
 * (or DEMO_ACCOUNT_KEY=ed25519:... for a scheduler); the deployer's is optional.
 */
import { Account, JsonRpcProvider, KeyPairSigner, PublicKey, actions } from "near-api-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const TGAS = 10n ** 12n;
const USDC_UNIT = 1_000_000n;
const RPC = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const pub = JSON.parse(await readFile("public/testnet.json", "utf8"));
const demoKeyFile = JSON.parse(await readFile("demo/agent-key.json", "utf8")) as { account_id: string; seat_id: string; public_key: string };
const AGENTS: string = pub.agents.contract;
const USDC: string = pub.agents.usdc;
const DEMO = demoKeyFile.account_id;
const SEAT = demoKeyFile.seat_id;
const MIN_BUDGET = 2n * USDC_UNIT;
const TARGET_BUDGET = 6n * USDC_UNIT;
const MIN_ALLOWANCE = N / 5n; // 0.2 NEAR
const NEW_ALLOWANCE = N; // 1 NEAR
const MIN_DEMO_NEAR = N / 4n; // each refused or paid call costs the account about 0.0005 NEAR
const DEMO_TOP_UP = N;
const execute = process.argv.includes("--execute");

const provider = new JsonRpcProvider({ url: RPC });
const query = (params: object) => provider.query({ finality: "final", ...params } as never) as Promise<Record<string, unknown>>;
const view = async <T>(contract: string, method: string, args: object = {}): Promise<T> => {
  const r = (await query({
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  })) as unknown as { result: number[] };
  return JSON.parse(Buffer.from(r.result).toString());
};
const nearOf = async (id: string) => BigInt(((await query({ request_type: "view_account", account_id: id })) as { amount: string }).amount);
const fmtN = (v: bigint) => `${(Number(v) / 1e24).toFixed(3)} NEAR`;
const fmtU = (v: bigint) => `${(Number(v) / 1e6).toFixed(2)} USDC`;

async function demoAccount(): Promise<Account | null> {
  const secret =
    process.env.DEMO_ACCOUNT_KEY ||
    (await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8")
      .then((t) => JSON.parse(t).private_key as string)
      .catch(() => ""));
  return secret ? new Account(DEMO, provider, KeyPairSigner.fromSecretKey(secret as `ed25519:${string}`)) : null;
}
async function deployerAccount(): Promise<Account | null> {
  try {
    const { credential } = await testnetCredential();
    return new Account(credential.account_id, provider, KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`));
  } catch {
    return null;
  }
}

type Seat = { balance: string; paused: boolean; agent_key: string | null; policy: { per_tx_max: string; per_day_max: string; payees: string[] } | null; spent_today: string; done: number; refused: number };
type Entry = { status: string; action: string; detail: string };

async function health() {
  const [seat, log, demoNear, demoUsdc] = await Promise.all([
    view<Seat>(AGENTS, "seat", { seat_id: SEAT }),
    view<Entry[]>(AGENTS, "seat_log", { seat_id: SEAT }),
    nearOf(DEMO),
    view<string>(USDC, "ft_balance_of", { account_id: DEMO }).then(BigInt),
  ]);
  const key = (await query({ request_type: "view_access_key", account_id: DEMO, public_key: demoKeyFile.public_key }).catch(() => null)) as {
    permission?: { FunctionCall?: { allowance: string | null; method_names: string[] } };
  } | null;
  const allowance = key?.permission?.FunctionCall?.allowance ? BigInt(key.permission.FunctionCall.allowance) : key ? null : -1n;
  return { seat, log, demoNear, demoUsdc, allowance, methods: key?.permission?.FunctionCall?.method_names ?? [] };
}

const h = await health();
const problems: string[] = [];
const budget = BigInt(h.seat.balance);
if (budget < MIN_BUDGET) problems.push("budget");
if (h.allowance === -1n) problems.push("key-missing");
else if ((h.allowance !== null && h.allowance < MIN_ALLOWANCE) || process.argv.includes("--refresh-key")) problems.push("allowance");
if (h.demoNear < MIN_DEMO_NEAR) problems.push("demo-near");
if (h.seat.paused) problems.push("paused");
if (h.seat.agent_key !== demoKeyFile.public_key) problems.push("key-not-on-seat");
const recentRefused = h.log.filter((e) => e.status === "refused").length;

console.log(
  JSON.stringify(
    {
      seat: SEAT,
      demo_account: DEMO,
      budget: fmtU(budget),
      spent_today: fmtU(BigInt(h.seat.spent_today)),
      paused: h.seat.paused,
      done_total: h.seat.done,
      refused_total: h.seat.refused,
      refused_in_last_entries: `${recentRefused} of ${h.log.length}`,
      agent_key_allowance: h.allowance === -1n ? "KEY MISSING" : h.allowance === null ? "unlimited" : fmtN(h.allowance),
      agent_key_methods: h.methods,
      demo_account_near: fmtN(h.demoNear),
      demo_account_usdc: fmtU(h.demoUsdc),
      problems,
      execute,
    },
    null,
    2,
  ),
);
if (!problems.length || !execute) process.exit(problems.length ? 1 : 0);

const demo = await demoAccount();
if (!demo) {
  console.error("No demo account key (~/.near-credentials/testnet or DEMO_ACCOUNT_KEY): cannot repair.");
  process.exit(1);
}
const send = async (who: Account, receiverId: string, acts: ReturnType<typeof actions.functionCall>[]) =>
  (await who.signAndSendTransaction({ receiverId, actions: acts, waitUntil: "FINAL", throwOnFailure: true })).transaction.hash as string;

if (problems.includes("demo-near")) {
  const deployer = await deployerAccount();
  if (deployer) console.log(`topped up the demo account with ${fmtN(DEMO_TOP_UP)}: ${await send(deployer, DEMO, [actions.transfer(DEMO_TOP_UP)])}`);
  else console.error("demo account is low on NEAR and no deployer key is available");
}
if (problems.includes("allowance") || problems.includes("key-missing")) {
  const pk = PublicKey.fromString(demoKeyFile.public_key);
  const acts = [
    ...(problems.includes("allowance") ? [actions.deleteKey(pk)] : []),
    actions.addFunctionCallAccessKey(pk, AGENTS, ["agent_pay"], NEW_ALLOWANCE),
  ];
  console.log(`agent key re-added with ${fmtN(NEW_ALLOWANCE)} of allowance (same public key): ${await send(demo, DEMO, acts as never)}`);
}
if (problems.includes("paused"))
  console.log(`resumed: ${await send(demo, AGENTS, [actions.functionCall("resume", { seat_id: SEAT }, 20n * TGAS, 1n)])}`);
if (problems.includes("key-not-on-seat"))
  console.log(
    `agent key set on the seat: ${await send(demo, AGENTS, [actions.functionCall("set_agent_key", { seat_id: SEAT, public_key: demoKeyFile.public_key }, 20n * TGAS, 1n)])}`,
  );
if (problems.includes("budget")) {
  const need = TARGET_BUDGET - budget;
  const amount = need < h.demoUsdc ? need : h.demoUsdc;
  if (amount > 0n)
    console.log(
      `budget topped up by ${fmtU(amount)}: ${await send(demo, USDC, [
        actions.functionCall("ft_transfer_call", { receiver_id: AGENTS, amount: amount.toString(), msg: JSON.stringify({ seat_id: SEAT }) }, 100n * TGAS, 1n),
      ])}`,
    );
  else console.error("the demo account has no USDC left to refill the budget (Circle faucet: faucet.circle.com, NEAR Testnet)");
}

const after = await health();
const still: string[] = [];
if (BigInt(after.seat.balance) < MIN_BUDGET) still.push("budget");
if (after.allowance !== null && after.allowance < MIN_ALLOWANCE) still.push("allowance");
if (after.seat.paused) still.push("paused");
if (after.seat.agent_key !== demoKeyFile.public_key) still.push("key-not-on-seat");
console.log(`after: budget ${fmtU(BigInt(after.seat.balance))}, allowance ${after.allowance === null ? "unlimited" : fmtN(after.allowance)}, problems: ${still.join(", ") || "none"}`);
process.exit(still.length ? 1 : 0);
