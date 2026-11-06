/**
 * Mints an NFT on nft.examples.testnet (NEAR's public NFT tutorial contract,
 * not ours) for an account, so an agent can be put on an NFT from another
 * collection. The deployer pays the storage; unused deposit is refunded.
 *
 *   npx tsx scripts/mint-example-nft.ts <receiver.testnet> [slug]            # dry run
 *   npx tsx scripts/mint-example-nft.ts <receiver.testnet> [slug] --execute
 * slug: angel | galaxy-soldier | space-warrior | galaxy-princess | fate (default: rotates)
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { testnetCredential } from "./testnet-credentials.js";

export const EXAMPLE_NFT = "nft.examples.testnet";
const receiver = process.argv[2];
const execute = process.argv.includes("--execute");
if (!receiver?.endsWith(".testnet")) throw new Error("Usage: mint-example-nft.ts <receiver.testnet> [--execute]");

/** Character art (see src/keepers/nft-art.ts); media is the public file URL. */
const ART_BASE =
  process.env.NFT_ART_BASE ||
  "https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/nft-art";
const CHARACTERS: Record<string, [string, string]> = {
  angel: ["Angel", "Light, feathers and a steady hand with money."],
  "galaxy-soldier": ["Galaxy Soldier", "Guards a budget like a border."],
  "space-warrior": ["Space Warrior", "Fast on the market, never over the cap."],
  "galaxy-princess": ["Galaxy Princess", "Pays on time, every time."],
  fate: ["Fate", "Decides what to buy; the contract decides how much."],
};
const slug = process.argv.find((a) => a in CHARACTERS) ?? Object.keys(CHARACTERS)[Date.now() % 5];
const [name, line] = CHARACTERS[slug];
const tokenId = `character-${slug}-${Date.now()}`;
const metadata = {
  title: name,
  description: `Characters: ${line}`,
  media: `${ART_BASE}/${slug}.webp`,
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
