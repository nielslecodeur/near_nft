/**
 * A wallet for end-to-end tests of the app's real screens (scripts/browser-e2e-flows.mjs).
 *
 *   npx tsx scripts/e2e-wallet-bridge.ts        # prints its token, listens on 127.0.0.1:8797
 *
 * It signs for the two testnet test accounts this repo's proofs already use (the
 * deployer and demo-agent.<deployer>), exactly what a wallet does when the app asks:
 * send a transaction, or sign a NEP-413 message. The browser test swaps the app's
 * wallet connector for one that calls this bridge, so every button, form and wallet
 * request is the app's own code, and every transaction is real, on testnet.
 * Local only (127.0.0.1), one random token per run, test tokens only.
 */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseEncode, encodeTransaction } from "near-api-js";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { nep413Bytes } from "../src/keepers/nep413.js";
import { credentialDirectory, testnetCredential } from "./testnet-credentials.js";

const PORT = Number(process.env.E2E_WALLET_PORT || 8797);
const TOKEN = process.env.E2E_WALLET_TOKEN || randomBytes(16).toString("hex");
// Public testnet nodes are rate-limited: every call may move to the next one.
const NODES = [...(process.env.NEAR_TESTNET_RPC ? [process.env.NEAR_TESTNET_RPC] : []), "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://rpc.testnet.fastnear.com"];
const providers = NODES.map((url) => new JsonRpcProvider({ url }));
async function anyNode<T>(f: (p: JsonRpcProvider) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let round = 0; round < 3; round++)
    for (const p of providers)
      try {
        // A node that stops answering must not hang the wallet: move on after 40 s.
        return await Promise.race([f(p), new Promise<never>((_, no) => setTimeout(() => no(new Error("node timeout")), 40_000))]);
      } catch (e) {
        last = e;
        console.error(`[bridge] ${new Date().toISOString()} node ${providers.indexOf(p)} round ${round}: ${String((e as Error).message ?? e).slice(0, 160)}`);
        await new Promise((r) => setTimeout(r, 700 * (round + 1)));
      }
  throw last;
}
const { credential } = await testnetCredential();
const DEMO = `demo-agent.${credential.account_id}`;
const secrets: Record<string, string> = {
  [credential.account_id]: credential.private_key as string,
  [DEMO]: JSON.parse(await readFile(join(credentialDirectory, `${DEMO}.json`), "utf8")).private_key,
};
const accountOf = (id: string, provider = providers[0]) => {
  if (!secrets[id]) throw new Error(`not a test account: ${id}`);
  return new Account(id, provider, KeyPairSigner.fromSecretKey(secrets[id] as `ed25519:${string}`));
};

type RawAction = { type: string; params: Record<string, unknown> };
/** near-connect's plain actions -> near-api-js actions. */
function toAction(a: RawAction) {
  const p = a.params as Record<string, string> & { args?: object };
  if (a.type === "FunctionCall") return actions.functionCall(p.methodName, p.args ?? {}, BigInt(p.gas), BigInt(p.deposit));
  if (a.type === "Transfer") return actions.transfer(BigInt(p.deposit));
  throw new Error(`the test wallet does not sign ${a.type}`);
}

async function handle(path: string, body: Record<string, unknown>) {
  if (path === "/accounts") return { deployer: credential.account_id, demo: DEMO };
  if (path === "/send") {
    const id = String(body.account);
    // Signed ONCE: sending the same signed transaction again (another node, a retry) can never run it twice.
    const signed = await anyNode((p) => accountOf(id, p).createSignedTransaction({ receiverId: String(body.receiverId), actions: (body.actions as RawAction[]).map(toAction) }));
    const hash = baseEncode(createHash("sha256").update(encodeTransaction(signed.transaction)).digest());
    await anyNode(async (p) => {
      try {
        await p.sendTransactionUntil(signed, "FINAL");
      } catch (e) {
        // On chain already (the node failed while waiting, or the call itself failed on chain)? The app reads the outcome.
        await p.viewTransactionStatus({ txHash: hash, accountId: id, waitUntil: "NONE" }).catch(() => {
          throw e;
        });
      }
    });
    return { hash };
  }
  if (path === "/sign") {
    const id = String(body.account);
    accountOf(id);
    const kp = KeyPair.fromString(secrets[id] as `ed25519:${string}`);
    const payload = nep413Bytes({ message: String(body.message), recipient: String(body.recipient), nonce: Uint8Array.from(body.nonce as number[]) });
    const signature = kp.sign(createHash("sha256").update(payload).digest()).signature;
    return { accountId: id, publicKey: kp.getPublicKey().toString(), signature: Buffer.from(signature).toString("base64") };
  }
  throw new Error("unknown route");
}

createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const reply = (code: number, data: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(data));
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return reply(401, { error: "token" });
    // A body that is not JSON is the caller's mistake: answer 400, never crash the wallet.
    new Promise<Record<string, unknown>>((ok) => ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {})).then((body) => handle(req.url ?? "", body)).then(
      (data) => reply(200, data),
      (e) => reply(400, { error: String((e as Error).message ?? e) }),
    );
  });
}).listen(PORT, "127.0.0.1", () => console.log(`e2e wallet bridge on 127.0.0.1:${PORT} token ${TOKEN} accounts ${Object.keys(secrets).join(", ")}`));
