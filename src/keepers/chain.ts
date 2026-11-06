/**
 * Keepers chain access. Every value shown in the UI comes from these view calls
 * on the deployed contracts; nothing is computed from mock data.
 *
 * v2 (default) adds a card inventory of NEP-141 tokens. v1 stays readable and
 * usable through the "v1 legacy" pages so its cards are never stranded.
 */
import { config as rpcConfig, rpc, walletSelector } from "../client";
import { hasWalletApprovalSession } from "../wallet-session";
import { vaultMessage, verifySignature } from "./nep413";

export const KEEPERS_V2 =
  import.meta.env.VITE_KEEPERS_ID || "keepers-v2.everkeep-dev-mw0weth5.testnet";
export const KEEPERS_V1 =
  import.meta.env.VITE_KEEPERS_V1_ID ||
  "keepers-v1.everkeep-dev-mw0weth5.testnet";
/** The current collection (v2). */
export const KEEPERS_CONTRACT = KEEPERS_V2;
export const WRAP = "wrap.testnet";
export const EXPLORER = "https://testnet.nearblocks.io";
export const YOCTO = 10n ** 24n;
const TGAS = 1_000_000_000_000n;
/** NEP-145 registration on the allowlisted tokens (all ask 0.00125 NEAR). */
const TOKEN_REGISTRATION = 1_250_000_000_000_000_000_000n;

export type Version = "v1" | "v2";
export const contractOf = (v: Version) =>
  v === "v1" ? KEEPERS_V1 : KEEPERS_V2;
/** Page URL of a card, per collection version. */
export const cardHref = (card: { token_id: string; version: Version }) =>
  card.version === "v1"
    ? `/keepers/v1/${card.token_id}`
    : `/keepers/${card.token_id}`;

export type TokenAmount = { token: string; amount: string };
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
  /** v2 only. */
  listing_id?: string | null;
  /** v2 only: one entry per allowlisted token. */
  inventory?: TokenAmount[];
  /** Added client-side: which collection this card belongs to. */
  version: Version;
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
  tokens?: string[];
};
export type KeepersStats = {
  minted: number;
  total_card_balances: string;
  total_pending_payouts: string;
  storage_cost: string;
  account_balance: string;
  token_totals?: TokenAmount[];
};
export type ChainToken = {
  token_id: string;
  owner_id: string;
  metadata: { title: string; media: string; extra: string };
};
export type TokenMeta = {
  token: string;
  symbol: string;
  decimals: number;
  icon: string | null;
};

export async function viewOn<T>(
  account: string,
  method: string,
  args: object = {},
): Promise<T> {
  const result = await rpc("query", {
    request_type: "call_function",
    account_id: account,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
    // Optimistic so a just-signed transaction is visible immediately.
    finality: "optimistic",
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
}
export const viewKeepers = <T>(
  method: string,
  args: object = {},
  v: Version = "v2",
) => viewOn<T>(contractOf(v), method, args);

const tag = (v: Version) => (c: Omit<Card, "version">) =>
  ({ ...c, version: v }) as Card;

export const getConfig = (v: Version = "v2") =>
  viewKeepers<KeepersConfig>("config", {}, v);
export const getStats = (v: Version = "v2") =>
  viewKeepers<KeepersStats>("stats", {}, v);
export const getCard = async (tokenId: string, v: Version = "v2") => {
  const c = await viewKeepers<Omit<Card, "version"> | null>(
    "card",
    { token_id: tokenId },
    v,
  );
  return c ? tag(v)(c) : null;
};
export const getToken = (tokenId: string, v: Version = "v2") =>
  viewKeepers<ChainToken | null>("nft_token", { token_id: tokenId }, v);
export const isHolder = (accountId: string, v: Version = "v2") =>
  viewKeepers<boolean>("is_holder", { account_id: accountId }, v);
export const cardsForOwner = async (accountId: string, v: Version = "v2") =>
  (
    await viewKeepers<Omit<Card, "version">[]>(
      "cards_for_owner",
      { account_id: accountId, limit: 50 },
      v,
    )
  ).map(tag(v));

/** All minted cards, fetched in pages of 50 (the contract's page cap). */
export async function getAllCards(
  minted: number,
  v: Version = "v2",
): Promise<Card[]> {
  const pages = Array.from({ length: Math.ceil(minted / 50) }, (_, i) =>
    viewKeepers<Omit<Card, "version">[]>(
      "cards",
      { from_index: String(i * 50), limit: 50 },
      v,
    ),
  );
  return (await Promise.all(pages)).flat().map(tag(v));
}

// ---------------------------------------------------------------------------
// NEP-141 tokens of the inventory
// ---------------------------------------------------------------------------

const metaCache = new Map<string, Promise<TokenMeta>>();
export function tokenMeta(token: string): Promise<TokenMeta> {
  let m = metaCache.get(token);
  if (!m) {
    m = viewOn<{ symbol: string; decimals: number; icon: string | null }>(
      token,
      "ft_metadata",
    ).then((r) => ({
      token,
      symbol: r.symbol,
      decimals: r.decimals,
      icon: r.icon || null,
    }));
    m.catch(() => metaCache.delete(token));
    metaCache.set(token, m);
  }
  return m;
}
export const ftBalance = async (token: string, account: string) =>
  BigInt(await viewOn<string>(token, "ft_balance_of", { account_id: account }));
export const ftRegistered = async (token: string, account: string) =>
  (await viewOn<unknown>(token, "storage_balance_of", {
    account_id: account,
  })) !== null;
export const nearBalance = async (account: string) =>
  BigInt(
    (
      await rpc("query", {
        request_type: "view_account",
        account_id: account,
        finality: "optimistic",
      })
    ).amount,
  );

// ---------------------------------------------------------------------------
// Amounts (exact integer math, no floating point)
// ---------------------------------------------------------------------------

/** Raw token units → "1.2345" (trailing zeros trimmed, at most `digits` decimals). */
export function formatAmount(
  raw: string | bigint,
  decimals: number,
  digits = 4,
): string {
  const v = BigInt(raw);
  const unit = 10n ** BigInt(decimals);
  const whole = v / unit;
  const frac = (v % unit)
    .toString()
    .padStart(decimals, "0")
    .slice(0, digits)
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
/** "1.5" → raw units for a token with `decimals`. Returns null if invalid. */
export function parseAmount(text: string, decimals: number): bigint | null {
  const s = text.trim();
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, "0") || "0")
  );
}
export const formatNear = (yocto: string | bigint, digits = 4) =>
  formatAmount(yocto, 24, digits);
export const parseNear = (text: string) => parseAmount(text, 24);

// ---------------------------------------------------------------------------
// Signed calls through the connected wallet (near-connect)
// ---------------------------------------------------------------------------

type Outcome = {
  status: unknown;
  transaction: { hash: string };
  receipts_outcome?: { outcome: { status: unknown } }[];
};
type Call = {
  method: string;
  args: Record<string, unknown>;
  deposit: bigint;
  gasTgas: bigint;
};
type Tx = { receiverId: string; calls: Call[] };
const failed = (s: unknown) =>
  typeof s === "object" && s !== null && "Failure" in s;

/**
 * Connected wallet ready to sign. Intear signs every request (transactions
 * and NEP-413 messages) with an app key that Everkeep keeps in memory only
 * (src/wallet-session.ts), so it is gone after a page reload: reconnect
 * Intear to get a fresh one, and refuse if the account changed meanwhile.
 */
async function readyWallet() {
  const connector = await walletSelector();
  let wallet = await connector.wallet();
  const signer = (await wallet.getAccounts())[0]?.accountId;
  if (!signer) throw new Error("Connect a wallet before signing.");
  if (wallet.manifest.id === "intear-wallet" && !hasWalletApprovalSession()) {
    await wallet.signOut({ network: "testnet" });
    wallet = await connector.connect({ walletId: "intear-wallet" });
    if ((await wallet.getAccounts())[0]?.accountId !== signer)
      throw new Error(
        "The selected account changed while reconnecting. Nothing was signed.",
      );
  }
  return { wallet, signer };
}

/** Plain near-connect actions: no @near-js serializers (they need Node's Buffer). */
const toActions = (calls: Call[]) =>
  calls.map((c) => ({
    type: "FunctionCall" as const,
    params: {
      methodName: c.method,
      args: c.args,
      gas: (c.gasTgas * TGAS).toString(),
      deposit: c.deposit.toString(),
    },
  }));

/** Reads the final outcome from RPC (a wallet's own return value can be partial). */
async function confirm(hash: string | undefined, signer: string) {
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

/** Signs one or several transactions in a single wallet request. */
async function send(txs: Tx[]): Promise<Outcome[]> {
  const { wallet, signer } = await readyWallet();
  if (txs.length === 1) {
    const sent = (await wallet.signAndSendTransaction({
      network: "testnet",
      signerId: signer,
      receiverId: txs[0].receiverId,
      actions: toActions(txs[0].calls),
    })) as { transaction?: { hash: string } } | undefined;
    return [await confirm(sent?.transaction?.hash, signer)];
  }
  const sent = (await wallet.signAndSendTransactions({
    network: "testnet",
    signerId: signer,
    transactions: txs.map((t) => ({
      receiverId: t.receiverId,
      actions: toActions(t.calls),
    })),
  })) as { transaction?: { hash: string } }[] | undefined;
  if (!sent?.length)
    throw new Error(
      "The wallet returned no results. Check your wallet history before retrying.",
    );
  const out: Outcome[] = [];
  for (const s of sent) out.push(await confirm(s?.transaction?.hash, signer));
  return out;
}

const call = async (
  v: Version,
  method: string,
  args: Record<string, unknown>,
  deposit: bigint,
  gasTgas: bigint,
) =>
  (
    await send([
      {
        receiverId: contractOf(v),
        calls: [{ method, args, deposit, gasTgas }],
      },
    ])
  )[0];

function returned<T>(result: Outcome): T | null {
  const s = result.status as { SuccessValue?: string };
  if (!s?.SuccessValue) return null;
  return JSON.parse(atob(s.SuccessValue)) as T;
}

export async function mint(mintPrice: string, storageReserve: string) {
  const result = await call(
    "v2",
    "mint",
    {},
    BigInt(mintPrice) + BigInt(storageReserve),
    30n,
  );
  return returned<{ token_id: string }>(result)?.token_id ?? null;
}
export const deposit = (card: Card, amount: bigint) =>
  call(card.version, "deposit", { token_id: card.token_id }, amount, 15n);
export const withdraw = (card: Card, amount: bigint | null) =>
  call(
    card.version,
    "withdraw",
    {
      token_id: card.token_id,
      amount: amount === null ? null : amount.toString(),
    },
    1n,
    30n,
  );
export const list = (card: Card, price: bigint) =>
  call(
    card.version,
    "list",
    { token_id: card.token_id, price: price.toString() },
    1n,
    15n,
  );
export const delist = (card: Card) =>
  call(card.version, "delist", { token_id: card.token_id }, 1n, 15n);
/**
 * Buys exactly what the buyer reviewed: v2 names the `listing_id` (any
 * delist/relist since makes it fail); v1 names the NEAR balance seen.
 */
export const buy = (card: Card) =>
  call(
    card.version,
    "buy",
    card.version === "v2"
      ? { token_id: card.token_id, listing_id: card.listing_id }
      : { token_id: card.token_id, min_card_balance: card.balance },
    BigInt(card.list_price!),
    50n,
  );
export const transfer = (card: Card, receiverId: string) =>
  call(
    card.version,
    "nft_transfer",
    { token_id: card.token_id, receiver_id: receiverId },
    1n,
    30n,
  );

/**
 * Fills a v2 card with tokens in one wallet request: one transaction per token.
 * For wNEAR, the same transaction registers the user on wrap.testnet if needed
 * and wraps the missing NEAR before transferring.
 */
export async function fillCard(
  card: Card,
  account: string,
  items: { token: string; amount: bigint }[],
) {
  const msg = JSON.stringify({ token_id: card.token_id });
  const txs: Tx[] = [];
  for (const { token, amount } of items) {
    if (amount <= 0n) continue;
    const calls: Call[] = [];
    if (token === WRAP) {
      if (!(await ftRegistered(WRAP, account)))
        calls.push({
          method: "storage_deposit",
          args: { account_id: account, registration_only: true },
          deposit: TOKEN_REGISTRATION,
          gasTgas: 10n,
        });
      const held = (await ftRegistered(WRAP, account))
        ? await ftBalance(WRAP, account)
        : 0n;
      if (held < amount)
        calls.push({
          method: "near_deposit",
          args: {},
          deposit: amount - held,
          gasTgas: 10n,
        });
    }
    calls.push({
      method: "ft_transfer_call",
      args: {
        receiver_id: KEEPERS_V2,
        amount: amount.toString(),
        msg,
      },
      deposit: 1n,
      gasTgas: 60n,
    });
    txs.push({ receiverId: token, calls });
  }
  if (!txs.length) throw new Error("Enter at least one amount.");
  return send(txs);
}

/** Withdraws one token from a v2 card; registers the owner on the token first if needed. */
export async function withdrawToken(
  card: Card,
  account: string,
  token: string,
) {
  const txs: Tx[] = [];
  if (!(await ftRegistered(token, account)))
    txs.push({
      receiverId: token,
      calls: [
        {
          method: "storage_deposit",
          args: { account_id: account, registration_only: true },
          deposit: TOKEN_REGISTRATION,
          gasTgas: 10n,
        },
      ],
    });
  txs.push({
    receiverId: KEEPERS_V2,
    calls: [
      {
        method: "withdraw_token",
        args: { token_id: card.token_id, token },
        deposit: 1n,
        gasTgas: 40n,
      },
    ],
  });
  return send(txs);
}

export const rpcUrl = rpcConfig.rpc;

// ---------------------------------------------------------------------------
// Vault access: prove control of the account (NEP-413), then read is_holder.
// ---------------------------------------------------------------------------

export type AccountProof = {
  accountId: string;
  publicKey: string;
  issuedAt: number;
  message: string;
};

/**
 * Asks the wallet to sign a NEP-413 message, verifies the signature in the
 * browser, and checks on chain that the signing key is a FullAccess key of the
 * account. Nothing is sent to any server.
 */
export async function proveAccount(): Promise<AccountProof> {
  const { wallet, signer: accountId } = await readyWallet();
  if (
    wallet.manifest.features &&
    wallet.manifest.features.signMessage === false
  )
    throw new Error(
      "This wallet cannot sign messages (NEP-413). Use Intear or another wallet that supports it.",
    );
  const issuedAt = Date.now();
  const params = {
    message: vaultMessage(accountId, issuedAt),
    recipient: KEEPERS_CONTRACT,
    nonce: crypto.getRandomValues(new Uint8Array(32)),
  };
  const signed = await wallet.signMessage({
    ...params,
    network: "testnet",
    signerId: accountId,
  });
  if (!signed || signed.accountId !== accountId)
    throw new Error("The wallet signed for a different account.");
  if (!(await verifySignature(signed, params)))
    throw new Error("The wallet's signature does not match the message.");
  let permission: unknown;
  try {
    permission = (
      await rpc("query", {
        request_type: "view_access_key",
        account_id: accountId,
        public_key: signed.publicKey,
        finality: "final",
      })
    ).permission;
  } catch {
    throw new Error("The signing key is not registered on this account.");
  }
  if (permission !== "FullAccess")
    throw new Error(
      "The signing key is not a full-access key of this account.",
    );
  return {
    accountId,
    publicKey: signed.publicKey,
    issuedAt,
    message: params.message,
  };
}

// ---------------------------------------------------------------------------
// Agent keys (probe): a function-call key on the owner's own account.
// ---------------------------------------------------------------------------

export type KeyPermission =
  | "FullAccess"
  | {
      FunctionCall: {
        allowance: string | null;
        receiver_id: string;
        method_names: string[];
      };
    };

/** Reads one access key from chain, or null when it is not on the account. */
export async function viewAccessKey(
  accountId: string,
  publicKey: string,
): Promise<KeyPermission | null> {
  try {
    const key = await rpc("query", {
      request_type: "view_access_key",
      account_id: accountId,
      public_key: publicKey,
      finality: "final",
    });
    return key.permission as KeyPermission;
  } catch {
    return null;
  }
}

/** Sends one transaction to the signer's own account with raw actions. */
async function sendToSelf(actions: unknown[]) {
  const { wallet, signer } = await readyWallet();
  const sent = (await wallet.signAndSendTransaction({
    network: "testnet",
    signerId: signer,
    receiverId: signer,
    actions: actions as never,
  })) as { transaction?: { hash: string } } | undefined;
  return { signer, outcome: await confirm(sent?.transaction?.hash, signer) };
}

/**
 * Method A: an AddKey action in a normal transaction. The key may call only
 * `methodNames` on `contractId`, attaches no deposit (protocol rule), and can
 * burn at most `allowance` yoctoNEAR of gas over its lifetime.
 */
export const addAgentKey = (
  publicKey: string,
  contractId: string,
  methodNames: string[],
  allowance: bigint,
) =>
  sendToSelf([
    {
      type: "AddKey",
      params: {
        publicKey,
        accessKey: {
          permission: {
            receiverId: contractId,
            allowance: allowance.toString(),
            methodNames,
          },
        },
      },
    },
  ]);

export const deleteAgentKey = (publicKey: string) =>
  sendToSelf([{ type: "DeleteKey", params: { publicKey } }]);

/**
 * Method B: reconnect the wallet and let it add the key during sign-in
 * (near-connect `addFunctionCallKey`). Returns the account that signed in.
 */
export async function reconnectWithAgentKey(
  publicKey: string,
  contractId: string,
  methodNames: string[],
  allowance: bigint,
) {
  const connector = await walletSelector();
  const current = await connector.wallet().catch(() => null);
  const walletId = current?.manifest.id;
  if (current) await current.signOut({ network: "testnet" });
  const wallet = await connector.connect({
    walletId,
    addFunctionCallKey: {
      contractId,
      publicKey,
      allowMethods: { anyMethod: false, methodNames },
      gasAllowance: { kind: "limited", amount: allowance.toString() },
    },
  });
  return (await wallet.getAccounts())[0]?.accountId ?? "";
}

// ---------------------------------------------------------------------------
// Raw multi-transaction requests (agent seats): any action type, one approval.
// ---------------------------------------------------------------------------

export type RawAction = { type: string; params: Record<string, unknown> };
/** `"self"` is replaced by the signing account (for AddKey / DeleteKey). */
export type RawTx = { receiverId: string; actions: RawAction[] };

export const fnCall = (
  method: string,
  args: Record<string, unknown>,
  deposit: bigint,
  gasTgas: bigint,
): RawAction => ({
  type: "FunctionCall",
  params: {
    methodName: method,
    args,
    gas: (gasTgas * TGAS).toString(),
    deposit: deposit.toString(),
  },
});

/** Signs every transaction in one wallet request, then confirms each one on chain. */
export async function sendRaw(txs: RawTx[]) {
  const { wallet, signer } = await readyWallet();
  const resolved = txs.map((t) => ({
    receiverId: t.receiverId === "self" ? signer : t.receiverId,
    actions: t.actions as never,
  }));
  const sent = (
    resolved.length === 1
      ? [
          await wallet.signAndSendTransaction({
            network: "testnet",
            signerId: signer,
            ...resolved[0],
          }),
        ]
      : await wallet.signAndSendTransactions({
          network: "testnet",
          signerId: signer,
          transactions: resolved,
        })
  ) as ({ transaction?: { hash: string } } | undefined)[] | undefined;
  if (!sent?.length)
    throw new Error(
      "The wallet returned no results. Check your wallet history before retrying.",
    );
  const outcomes: Outcome[] = [];
  for (const s of sent) outcomes.push(await confirm(s?.transaction?.hash, signer));
  return { signer, outcomes };
}

/** JSON value returned by a confirmed transaction (the last receipt's result). */
export const returnedValue = <T>(o: { status: unknown }) => returned<T>(o as Outcome);
