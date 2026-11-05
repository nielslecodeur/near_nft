/** Idempotent on-chain demo inventory. Keys belong only to dedicated test accounts, outside the repo. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { KeyPair } from "near-api-js";
import { SandboxAccount } from "./harness.js";
import { testnetCredential } from "./testnet-credentials.js";
import {
  ml_dsa65,
  b64,
  initProof,
  authorize,
  envelope,
  type Snapshot,
} from "../packages/shared/index.js";
import { TESTNET } from "../packages/shared/network.js";
const execute = process.argv.includes("--execute"),
  { deployment: d } = JSON.parse(await readFile("public/testnet.json", "utf8")),
  { credential } = await testnetCredential();
if (credential.account_id !== d.parent) throw new Error("Wrong test operator.");
const operator = new SandboxAccount(
    d.parent,
    TESTNET.rpc,
    KeyPair.fromString(credential.private_key as `ed25519:${string}`),
  ),
  dir = join(homedir(), ".near-credentials/testnet/everkeep-demo"),
  stateFile = join(dir, "state.json"),
  N = 10n ** 24n;
async function guard() {
  if ((await operator.rpc("status", [])).chain_id !== "testnet")
    throw new Error("TESTNET_ONLY");
}
await guard();
const series = await operator.getAccount(d.collection).view<any>("series");
if (series.series.mandate_hash !== d.mandate_hash)
  throw new Error("Official model mismatch.");
if (!execute) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        network: "testnet",
        model: d.series_id,
        collection: d.collection,
        positions: [
          { name: "demo-1", amount: "10000000", list: true },
          { name: "demo-2", amount: "20000000", list: false },
        ],
        note: "Only the implemented Liquidity model; no invented crypto or multi-asset adapters.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
await mkdir(dir, { recursive: true, mode: 0o700 });
let state: any;
try {
  state = JSON.parse(await readFile(stateFile, "utf8"));
  if (state.collection !== d.collection)
    throw new Error("Different demo collection; no overwrite.");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  const run = Date.now().toString(36);
  state = {
    network: "testnet",
    collection: d.collection,
    positions: [1, 2].map((i) => ({
      name: "demo-" + i,
      owner: "everkeep-demo-" + run + "-" + i + ".testnet",
      amount: String(i * 10_000_000),
      listed: false,
      transactions: [],
    })),
  };
  await writeFile(stateFile, JSON.stringify(state), {
    flag: "wx",
    mode: 0o600,
  });
}
const save = () => writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
async function transact(
  account: SandboxAccount,
  receiver: string,
  method: string,
  args: object,
  deposit = 0n,
) {
  await guard();
  const r = await account.callRaw(receiver, method, args, {
    gas: 280_000_000_000_000n,
    attachedDeposit: deposit,
  });
  if (r.failed || r.receiptFailures.length)
    throw new Error(
      "Seed transaction failed: " +
        method +
        " " +
        r.receiptFailureMessages.join(" "),
    );
  return r.result.transaction.hash;
}
for (const job of state.positions) {
  const file = join(dir, job.owner + ".json");
  let material: any;
  try {
    material = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const native = KeyPair.fromRandom("ed25519"),
      mldsa = ml_dsa65.keygen();
    material = {
      account_id: job.owner,
      private_key: native.toString(),
      public_key: native.getPublicKey().toString(),
      mldsa_public: b64(mldsa.publicKey),
      mldsa_secret: b64(mldsa.secretKey),
    };
    mldsa.secretKey.fill(0);
    await writeFile(file, JSON.stringify(material), {
      flag: "wx",
      mode: 0o600,
    });
  }
  const actor = new SandboxAccount(
    job.owner,
    TESTNET.rpc,
    KeyPair.fromString(material.private_key),
  );
  let exists = false;
  try {
    await actor.accountView();
    exists = true;
  } catch (e) {
    if (!/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
  }
  if (!exists) {
    const response = await fetch("https://helper.nearprotocol.com/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        newAccountId: job.owner,
        newAccountPublicKey: material.public_key,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        "Official faucet refused demo account " + response.status,
      );
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        await actor.accountView();
        break;
      } catch (e) {
        if (attempt === 14 || !/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  const token = operator.getAccount(d.asset),
    balance = BigInt(
      await token.view<string>("ft_balance_of", { account_id: job.owner }),
    );
  if (!job.distributed && balance < 100_000_000n) {
    job.transactions.push(
      await transact(
        operator,
        d.asset,
        "storage_deposit",
        { account_id: job.owner, registration_only: true },
        N / 100n,
      ),
    );
    job.transactions.push(
      await transact(
        operator,
        d.asset,
        "ft_transfer",
        { receiver_id: job.owner, amount: (100_000_000n - balance).toString() },
        1n,
      ),
    );
    job.distributed = true;
    await save();
  }
  const position = job.name + "." + d.collection,
    keys = {
      publicKey: Buffer.from(material.mldsa_public, "base64"),
      secretKey: Buffer.from(material.mldsa_secret, "base64"),
    };
  let snapshot: Snapshot | null = null;
  try {
    snapshot = await actor.getAccount(position).view<Snapshot>("snapshot");
  } catch (e) {
    if (!/UNKNOWN_ACCOUNT/.test(String(e))) throw e;
  }
  if (!snapshot) {
    job.transactions.push(
      await transact(
        actor,
        d.collection,
        "create_plan",
        {
          name: job.name,
          ...initProof(keys, "testnet", position, d.collection, job.owner),
        },
        6n * N,
      ),
    );
    await save();
    snapshot = await actor.getAccount(position).view<Snapshot>("snapshot");
  }
  if (
    snapshot.owner_id !== job.owner ||
    snapshot.public_key !== material.mldsa_public ||
    snapshot.series?.mandate_hash !== d.mandate_hash
  )
    throw new Error("Existing demo NFT changed; no overwrite.");
  if (!snapshot.funded) {
    const sub = await operator
      .getAccount(d.collection)
      .view<any>("subscription", { position });
    if (sub)
      throw new Error(
        "Existing demo subscription " +
          sub.state +
          "; reconcile manually, no second deposit.",
      );
    job.transactions.push(
      await transact(
        actor,
        d.strategy,
        "register_position",
        { wallet: position },
        N / 50n,
      ),
    );
    job.transactions.push(
      await transact(
        actor,
        d.asset,
        "ft_transfer_call",
        {
          receiver_id: d.collection,
          amount: job.amount,
          msg: JSON.stringify({ Subscribe: position }),
        },
        1n,
      ),
    );
    await save();
    snapshot = await actor.getAccount(position).view<Snapshot>("snapshot");
  }
  const nft = await operator
    .getAccount(d.collection)
    .view<any>("nft_token", { token_id: position });
  if (
    !snapshot.funded ||
    !nft ||
    nft.owner_id !== job.owner ||
    snapshot.deposits !== job.amount
  )
    throw new Error("Demo funding/NFT not confirmed.");
  if (job.name === "demo-1" && !job.listed) {
    if (snapshot.sale)
      throw new Error(
        "Existing sale requires inspection; no duplicate listing.",
      );
    const now = BigInt(
        (await operator.rpc("block", { finality: "final" })).header
          .timestamp_nanosec,
      ),
      expiry = [
        now + 22n * 3600n * 1_000_000_000n,
        BigInt(snapshot.series!.terms.matures_at) - 1n,
      ]
        .reduce((a, b) => (a < b ? a : b))
        .toString(),
      q = await actor
        .getAccount(position)
        .view<any>("sale_quote", { price: "11000000", expires_at: expiry });
    job.transactions.push(
      await transact(
        actor,
        position,
        "execute",
        authorize(
          keys,
          envelope(
            snapshot,
            {
              List: {
                id: q.id,
                price: "11000000",
                payment_token: d.asset,
                expires_at: expiry,
                valuation_hash: q.valuation_hash,
              },
            },
            (now + 600_000_000_000n).toString(),
          ),
        ),
      ),
    );
    job.listed = true;
    await save();
  }
  keys.secretKey.fill(0);
  job.position = position;
  await save();
  console.log(
    JSON.stringify({
      owner: job.owner,
      position,
      amount: job.amount,
      listed: job.listed,
    }),
  );
}
const manifest = {
  network: "testnet",
  collection: d.collection,
  label: "Démonstration Everkeep",
  models: [{ id: d.series_id, mandate_hash: d.mandate_hash }],
  positions: state.positions.map((j: any) => ({
    position: j.position,
    owner: j.owner,
    amount: j.amount,
    listed: j.listed,
    transactions: j.transactions,
  })),
};
await writeFile("public/testnet-demo.json", JSON.stringify(manifest, null, 2));
await writeFile(
  "docs/results/testnet-seed.json",
  JSON.stringify({ at: new Date().toISOString(), ...manifest }, null, 2),
);
