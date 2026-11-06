/**
 * Puts Keepers up for sale on keepers-v2 from the deployer account, so a Buyer
 * agent has something to buy on testnet (it ignores its owner's own listings).
 * The deployer is also the collection creator, so the 1 NEAR mint price comes
 * back to it: each card costs about 0.02 NEAR of storage plus gas.
 *
 *   npx tsx scripts/seed-agents-market.ts            # dry run
 *   npx tsx scripts/seed-agents-market.ts --execute  # mint + list
 * Env: SEED_COUNT (default 1), SEED_PRICE in NEAR (default 0.5).
 */
import { Account, JsonRpcProvider, KeyPairSigner, actions } from "near-api-js";
import { testnetCredential } from "./testnet-credentials.js";

const N = 10n ** 24n;
const MARKET = "keepers-v2.everkeep-dev-mw0weth5.testnet";
const endpoint = process.env.NEAR_TESTNET_RPC || "https://test.rpc.fastnear.com";
const count = Number(process.env.SEED_COUNT || 1);
const price = BigInt(Math.round(Number(process.env.SEED_PRICE || 0.5) * 1000)) * (N / 1000n);
const execute = process.argv.includes("--execute");

const { credential } = await testnetCredential();
const provider = new JsonRpcProvider({ url: endpoint });
const seller = new Account(
  credential.account_id,
  provider,
  KeyPairSigner.fromSecretKey(credential.private_key as `ed25519:${string}`),
);
const view = async <T>(method: string, args: object = {}): Promise<T> =>
  JSON.parse(
    Buffer.from(
      (
        (await provider.query({
          request_type: "call_function",
          account_id: MARKET,
          method_name: method,
          args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          finality: "final",
        })) as unknown as { result: number[] }
      ).result,
    ).toString(),
  );

const config = await view<{ creator: string; mint_price: string; storage_reserve: string }>("config");
console.log(
  JSON.stringify(
    { market: MARKET, seller: credential.account_id, creator: config.creator, count, price_near: Number(price) / 1e24, execute },
    null,
    2,
  ),
);
if (!execute) process.exit(0);

const call = async (method: string, args: object, deposit: bigint, tgas = 50n) => {
  const r = await seller.signAndSendTransaction({
    receiverId: MARKET,
    actions: [actions.functionCall(method, args, tgas * 10n ** 12n, deposit)],
    waitUntil: "FINAL",
    throwOnFailure: true,
  });
  const s = r.status as { SuccessValue?: string };
  return { hash: r.transaction.hash, value: s.SuccessValue ? JSON.parse(Buffer.from(s.SuccessValue, "base64").toString()) : null };
};

for (let i = 0; i < count; i++) {
  const minted = await call("mint", {}, BigInt(config.mint_price) + BigInt(config.storage_reserve));
  const tokenId: string = minted.value.token_id;
  const listed = await call("list", { token_id: tokenId, price: price.toString() }, 1n, 15n);
  const card = await view<{ listing_id: string; list_price: string; tier_name: string }>("card", { token_id: tokenId });
  console.log(`Keeper #${tokenId} (${card.tier_name}) listed at ${Number(price) / 1e24} NEAR · listing ${card.listing_id} · mint ${minted.hash} · list ${listed.hash}`);
}
