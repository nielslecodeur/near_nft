/**
 * Keepers chain access. Every value shown in the UI comes from these view calls
 * on the deployed contract; nothing is computed from mock data.
 */
import { config as rpcConfig, rpc, walletSelector } from "../client";
import { hasWalletApprovalSession } from "../wallet-session";

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

/**
 * Signs one function call with the connected wallet, then reads the final
 * outcome back from RPC (the wallet's own return value can be partial).
 * Same path as the Everkeep app (src/testnet-network.ts walletCall): plain
 * near-connect actions, no @near-js serializers, which need Node's Buffer.
 */
async function call(
  method: string,
  args: Record<string, unknown>,
  deposit: bigint,
  gasTgas: bigint,
) {
  const connector = await walletSelector();
  let wallet = await connector.wallet();
  const signer = (await wallet.getAccounts())[0]?.accountId;
  if (!signer) throw new Error("Connect a wallet before signing.");
  // Intear needs its approval session for this page; reconnect if it was lost.
  if (wallet.manifest.id === "intear-wallet" && !hasWalletApprovalSession()) {
    await wallet.signOut({ network: "testnet" });
    wallet = await connector.connect({ walletId: "intear-wallet" });
    if ((await wallet.getAccounts())[0]?.accountId !== signer)
      throw new Error(
        "The selected account changed while reconnecting. Nothing was signed.",
      );
  }
  const sent = (await wallet.signAndSendTransaction({
    network: "testnet",
    signerId: signer,
    receiverId: KEEPERS_CONTRACT,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: method,
          args,
          gas: (gasTgas * TGAS).toString(),
          deposit: deposit.toString(),
        },
      },
    ],
  })) as { transaction?: { hash: string } } | undefined;
  const hash = sent?.transaction?.hash;
  if (!hash)
    throw new Error(
      "The wallet returned no transaction hash. Check your wallet history before retrying.",
    );
  const result = (await rpc("tx", {
    tx_hash: hash,
    sender_account_id: signer,
    wait_until: "FINAL",
  })) as Outcome;
  if (
    failed(result.status) ||
    result.receipts_outcome?.some((r) => failed(r.outcome.status))
  )
    throw new Error(
      `Transaction failed on chain. See ${EXPLORER}/txns/${hash}`,
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
