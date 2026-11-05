/** Official faucet bootstrap. Saves a local test-only credential, never logs key material. */
import { KeyPair } from "near-api-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { credentialDirectory } from "./testnet-credentials.js";
import { join } from "node:path";
const rpc = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const status = await (await fetch(rpc + "/status")).json();
if (status.chain_id !== "testnet" || status.protocol_version < 88)
  throw new Error("Testnet protocol 88 required");
await mkdir(".local", { recursive: true });
const role = process.argv.includes("--user") ? "user" : "deployer";
await mkdir(credentialDirectory, { recursive: true, mode: 0o700 });
const file = join(credentialDirectory, `everkeep-${role}.json`);
let credential: { account_id: string; public_key: string; private_key: string };
try {
  credential = JSON.parse(await readFile(file, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT")
    throw new Error("Local credential unreadable; never overwritten.");
  const key = KeyPair.fromRandom("ed25519");
  credential = {
    account_id: `everkeep-${role === "user" ? "niels" : "dev"}-${Date.now().toString(36)}.testnet`,
    public_key: key.getPublicKey().toString(),
    private_key: key.toString(),
  };
  await writeFile(file, JSON.stringify(credential), {
    flag: "wx",
    mode: 0o600,
  });
}
try {
  await writeFile(
    join(credentialDirectory, credential.account_id + ".json"),
    JSON.stringify(credential),
    { flag: "wx", mode: 0o600 },
  );
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
}
const state = async () => {
  const r = await (
    await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "audit",
        method: "query",
        params: {
          request_type: "view_account",
          account_id: credential.account_id,
          finality: "final",
        },
      }),
    })
  ).json();
  if (r.error) {
    if (JSON.stringify(r.error).includes("UNKNOWN_ACCOUNT")) return null;
    throw new Error("RPC lookup failed; no faucet request retried.");
  }
  return r.result;
};
let account = await state();
if (!account) {
  const response = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      newAccountId: credential.account_id,
      newAccountPublicKey: credential.public_key,
    }),
    signal: AbortSignal.timeout(20000),
  });
  console.log(
    JSON.stringify({
      account: credential.account_id,
      faucet_status: response.status,
    }),
  );
  if (response.ok) {
    for (let n = 0; n < 15 && !account; n++) {
      await new Promise((r) => setTimeout(r, 1000));
      account = await state();
    }
  }
}
const result = {
  at: new Date().toISOString(),
  network: "testnet",
  rpc,
  protocol: status.protocol_version,
  account: credential.account_id,
  funded: !!account,
  amount: account?.amount || null,
  credential_file: file,
};
await writeFile(
  `.local/testnet-${role === "user" ? "user" : "bootstrap"}.json`,
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
