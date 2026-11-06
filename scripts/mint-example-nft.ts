/**
 * Mints an NFT on nft.examples.testnet (NEAR's public NFT tutorial contract,
 * not ours) for an account, so an agent can be put on an NFT from another
 * collection. The deployer pays the storage; unused deposit is refunded.
 *
 *   npx tsx scripts/mint-example-nft.ts <receiver.testnet>            # dry run
 *   npx tsx scripts/mint-example-nft.ts <receiver.testnet> --execute
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { testnetCredential } from "./testnet-credentials.js";

export const EXAMPLE_NFT = "nft.examples.testnet";
const receiver = process.argv[2];
const execute = process.argv.includes("--execute");
if (!receiver?.endsWith(".testnet")) throw new Error("Usage: mint-example-nft.ts <receiver.testnet> [--execute]");

/** A small on-chain SVG so the NFT shows art without any external host. */
export const exampleMedia = (seed: number) => {
  const hue = seed % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><rect width='120' height='120' fill='hsl(${hue},60%,22%)'/><circle cx='60' cy='60' r='38' fill='hsl(${(hue + 40) % 360},80%,62%)'/><rect x='38' y='50' width='44' height='14' rx='7' fill='hsl(${hue},60%,14%)'/><circle cx='60' cy='86' r='4' fill='hsl(${hue},60%,14%)'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const tokenId = `agent-demo-${Date.now()}`;
const metadata = {
  title: `Agent carrier ${tokenId.slice(-6)}`,
  description: "A plain NFT from NEAR's public example collection, used to carry an agent seat.",
  media: exampleMedia(Date.now()),
  copies: 1,
};
console.log(JSON.stringify({ contract: EXAMPLE_NFT, receiver, token_id: tokenId, execute }, null, 2));
if (!execute) process.exit(0);

const { credential } = await testnetCredential();
const provider = new JsonRpcProvider({ url: process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com" });
const signer = new Account(
  credential.account_id,
  provider,
  KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`),
);
const r = await signer.signAndSendTransaction({
  receiverId: EXAMPLE_NFT,
  actions: [
    actions.functionCall(
      "nft_mint",
      { token_id: tokenId, metadata, receiver_id: receiver },
      100_000_000_000_000n,
      10n ** 23n, // 0.1 NEAR, the contract refunds what storage does not use
    ),
  ],
  waitUntil: "FINAL",
  throwOnFailure: true,
});
const view = (await provider.query({
  request_type: "call_function",
  account_id: EXAMPLE_NFT,
  method_name: "nft_token",
  args_base64: Buffer.from(JSON.stringify({ token_id: tokenId })).toString("base64"),
  finality: "final",
})) as unknown as { result: number[] };
const token = JSON.parse(Buffer.from(view.result).toString());
console.log(`Minted ${EXAMPLE_NFT} #${tokenId} for ${token?.owner_id} · tx ${r.transaction.hash}`);
