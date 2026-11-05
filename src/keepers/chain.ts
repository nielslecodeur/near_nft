/**
 * Keepers chain access. Every value shown in the UI comes from these view calls
 * on the deployed contract; nothing is computed from mock data.
 */
import { config as rpcConfig, rpc, walletSelector } from "../client";

export const KEEPERS_CONTRACT =
  import.meta.env.VITE_KEEPERS_ID || "keepers-v1.everkeep-dev-mw0weth5.testnet";
export const EXPLORER = "https://testnet.nearblocks.io";
export const YOCTO = 10n ** 24n;
const TGAS = 1_000_000_000_000n;

export type Card = {
  token_id: string;
  owner_id: string;
  dna: number;
  balance: string;
  tier: number;
  tier_name: "matte" | "brushed" | "holographic" | "animated";
  next_tier_at: string | null;
  trades: number;
  minted_at: string;
  held_since: string;
  royalties_earned: string;
  deposited_total: string;
  withdrawn_total: string;
  list_price: string | null;
};
export type KeepersConfig = {
  creator: string;
  mint_price: string;
  storage_reserve: string;
  royalty_bps: number;
  min_list_price: string;
  max_supply: number;
  tier_names: string[];
  tier_thresholds: string[];
};
export type KeepersStats = {
  minted: number;
  total_card_balances: string;
  total_pending_payouts: string;
  storage_cost: string;
  account_balance: string;
};
export type ChainToken = {
  token_id: string;
  owner_id: string;
  metadata: { title: string; media: string; extra: string };
};

export async function viewKeepers<T>(
  method: string,
  args: object = {},
): Promise<T> {
  const result = await rpc("query", {
    request_type: "call_function",
    account_id: KEEPERS_CONTRACT,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    // Optimistic so a just-signed transaction is visible immediately.
    finality: "optimistic",
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
}

export const getConfig = () => viewKeepers<KeepersConfig>("config");
export const getStats = () => viewKeepers<KeepersStats>("stats");
export const getCard = (tokenId: string) =>
  viewKeepers<Card | null>("card", { token_id: tokenId });
export const getToken = (tokenId: string) =>
  viewKeepers<ChainToken | null>("nft_token", { token_id: tokenId });
export const isHolder = (accountId: string) =>
  viewKeepers<boolean>("is_holder", { account_id: accountId });
export const cardsForOwner = (accountId: string) =>
  viewKeepers<Card[]>("cards_for_owner", { account_id: accountId, limit: 50 });

/** All minted cards, fetched in pages of 50 (the contract's page cap). */
export async function getAllCards(minted: number): Promise<Card[]> {
  const pages = Array.from({ length: Math.ceil(minted / 50) }, (_, i) =>
    viewKeepers<Card[]>("cards", { from_index: String(i * 50), limit: 50 }),
  );
  return (await Promise.all(pages)).flat();
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** yoctoNEAR → "1.2345" (trailing zeros trimmed, at most `digits` decimals). */
export function formatNear(yocto: string | bigint, digits = 4): string {
  const v = BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO)
    .toString()
    .padStart(24, "0")
    .slice(0, digits)
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** "1.5" → yoctoNEAR, exact (no floating point). Returns null if invalid. */
export function parseNear(text: string): bigint | null {
  const s = text.trim();
  if (!/^\d+(\.\d{0,24})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return BigInt(whole) * YOCTO + BigInt(frac.padEnd(24, "0") || "0");
}

// ---------------------------------------------------------------------------
// Signed calls through the connected wallet (near-connect)
// ---------------------------------------------------------------------------

type Outcome = {
  status: unknown;
  transaction: { hash: string };
  receipts_outcome?: { outcome: { status: unknown } }[];
};
const failed = (s: unknown) =>
  typeof s === "object" && s !== null && "Failure" in s;

async function call(
  method: string,
  args: object,
  deposit: bigint,
  gasTgas: bigint,
) {
  const connector = await walletSelector();
  const wallet = await connector.wallet();
  const { actionCreators } = await import("@near-js/transactions");
  const result = (await wallet.signAndSendTransaction({
    receiverId: KEEPERS_CONTRACT,
    actions: [
      actionCreators.functionCall(method, args, gasTgas * TGAS, deposit),
    ],
  })) as Outcome | undefined;
  if (!result)
    throw new Error(
      "The wallet returned no result. Check your wallet history before retrying.",
    );
  if (
    failed(result.status) ||
    result.receipts_outcome?.some((r) => failed(r.outcome.status))
  )
    throw new Error(
      `Transaction failed on chain. See ${EXPLORER}/txns/${result.transaction.hash}`,
    );
  return result;
}

function returned<T>(result: Outcome): T | null {
  const s = result.status as { SuccessValue?: string };
  if (!s?.SuccessValue) return null;
  return JSON.parse(atob(s.SuccessValue)) as T;
}

export async function mint(mintPrice: string, storageReserve: string) {
  const result = await call(
    "mint",
    {},
    BigInt(mintPrice) + BigInt(storageReserve),
    30n,
  );
  return returned<{ token_id: string }>(result)?.token_id ?? null;
}
export const deposit = (tokenId: string, amount: bigint) =>
  call("deposit", { token_id: tokenId }, amount, 15n);
export const withdraw = (tokenId: string, amount: bigint | null) =>
  call(
    "withdraw",
    { token_id: tokenId, amount: amount === null ? null : amount.toString() },
    1n,
    30n,
  );
export const list = (tokenId: string, price: bigint) =>
  call("list", { token_id: tokenId, price: price.toString() }, 1n, 15n);
export const delist = (tokenId: string) =>
  call("delist", { token_id: tokenId }, 1n, 15n);
/** `seenBalance` protects the buyer: the purchase fails if the card holds less. */
export const buy = (tokenId: string, price: string, seenBalance: string) =>
  call(
    "buy",
    { token_id: tokenId, min_card_balance: seenBalance },
    BigInt(price),
    50n,
  );
export const transfer = (tokenId: string, receiverId: string) =>
  call("nft_transfer", { token_id: tokenId, receiver_id: receiverId }, 1n, 30n);

export const rpcUrl = rpcConfig.rpc;
