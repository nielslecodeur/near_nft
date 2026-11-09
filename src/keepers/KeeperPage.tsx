import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Coins,
  ExternalLink,
  History,
  PackagePlus,
  Send,
  ShoppingCart,
  Tag,
  Wallet as WalletIcon,
  X,
} from "lucide-react";
import { Button, Input, Notice, Skeleton } from "../terminal/primitives";
import { KeeperCardLarge, TierBadge, shortAccount } from "./KeeperCard";
import { ACCESSORIES, TIER_LABELS, VISORS, traits } from "./art";
import * as chain from "./chain";
import {
  EXPLORER,
  WRAP,
  contractOf,
  formatAmount,
  formatNear,
  parseAmount,
  parseNear,
  type Card,
  type ChainToken,
  type KeepersConfig,
  type TokenMeta,
  type Version,
} from "./chain";
import type { Wallet } from "./KeepersApp";

const since = (ns: string) => {
  const ms = Number(BigInt(ns) / 1_000_000n);
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  const date = new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return days <= 0
    ? `${date} (today)`
    : `${date} (${days} day${days > 1 ? "s" : ""})`;
};

function tierProgress(card: Card, config: KeepersConfig) {
  if (!card.next_tier_at) return 1;
  const next = BigInt(card.next_tier_at);
  const prev =
    card.tier === 0 ? 0n : BigInt(config.tier_thresholds[card.tier - 1]);
  const balance = BigInt(card.balance);
  return Number(((balance - prev) * 1000n) / (next - prev)) / 1000;
}

type Done = { title: string; hash?: string };
type Outcome = { transaction?: { hash: string } };
type Run = (
  name: string,
  title: string,
  action: () => Promise<unknown>,
) => Promise<void>;

/** "5 USDC · 1 wNEAR" — non-empty slots of a card's basket. */
export function basketSummary(card: Card, metas: Record<string, TokenMeta>) {
  return (card.inventory ?? [])
    .filter((i) => i.amount !== "0" && metas[i.token])
    .map(
      (i) =>
        `${formatAmount(i.amount, metas[i.token].decimals)} ${metas[i.token].symbol}`,
    )
    .join(" · ");
}

export function KeeperPage({
  id,
  version,
  wallet,
  navigate,
}: {
  id: string;
  version: Version;
  wallet: Wallet;
  navigate: (to: string) => void;
}) {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [token, setToken] = useState<ChainToken | null>(null);
  const [config, setConfig] = useState<KeepersConfig | null>(null);
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const home = version === "v1" ? "/keepers/v1" : "/market";

  const load = useCallback(async () => {
    try {
      const [c, t, cfg] = await Promise.all([
        chain.getCard(id, version),
        chain.getToken(id, version),
        chain.getConfig(version),
      ]);
      setCard(c);
      setToken(t);
      setConfig(cfg);
      setRevision((r) => r + 1);
      if (cfg.tokens?.length) {
        const list = await Promise.all(cfg.tokens.map(chain.tokenMeta));
        setMetas(Object.fromEntries(list.map((m) => [m.token, m])));
      }
    } catch (e) {
      setError(`Could not read the contract: ${String(e)}`);
    }
  }, [id, version]);
  useEffect(() => {
    setCard(undefined);
    setDone(null);
    setError("");
    void load();
  }, [load]);

  /** Runs a signed action, then re-reads the card from chain. */
  const run: Run = async (name, title, action) => {
    setBusy(name);
    setError("");
    setDone(null);
    try {
      if (!wallet.account) await wallet.connect();
      const result = (await action()) as Outcome | Outcome[] | undefined;
      const last = Array.isArray(result) ? result[result.length - 1] : result;
      setDone({ title, hash: last?.transaction?.hash });
      await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  };

  if (card === undefined && !error)
    return <Skeleton label={`Reading Keeper #${id} from chain`} />;
  if (!card || !config)
    return (
      <div className="kp-missing">
        {error ? (
          <Notice tone="error" title="Something went wrong">
            {error}
          </Notice>
        ) : (
          <p>Keeper #{id} does not exist yet.</p>
        )}
        <Button icon={ArrowLeft} onClick={() => navigate(home)}>
          {version === "v1" ? "Back to the v1 collection" : "Back to the market"}
        </Button>
      </div>
    );

  const isOwner = wallet.account !== "" && wallet.account === card.owner_id;
  const progress = tierProgress(card, config);
  const t = traits(card.dna >>> 0);
  const basket = basketSummary(card, metas);

  return (
    <div className="kp-detail">
      <a
        className="kp-back"
        href={home}
        onClick={(e) => {
          e.preventDefault();
          navigate(home);
        }}
      >
        <ArrowLeft aria-hidden="true" />{" "}
        {version === "v1" ? "v1 collection" : "Market"}
      </a>
      {version === "v1" && (
        <div className="kp-legacy">
          <History aria-hidden="true" />
          <span>
            Legacy <strong>v1</strong> card. It still holds NEAR, earns
            royalties and evolves, but v1 cards have no token basket. New cards
            are minted on v2.
          </span>
        </div>
      )}
      <div className="kp-detail-grid">
        <div className="kp-detail-art">
          <KeeperCardLarge card={card} account={wallet.account} />
          <dl className="kp-traits" aria-label="Traits from on-chain DNA">
            <div>
              <dt>Visor</dt>
              <dd>{VISORS[t.visor]}</dd>
            </div>
            <div>
              <dt>Accessory</dt>
              <dd>{ACCESSORIES[t.accessory]}</dd>
            </div>
            <div>
              <dt>DNA</dt>
              <dd className="kp-num">
                {(card.dna >>> 0).toString(16).padStart(8, "0")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="kp-detail-info">
          <div className="kp-title-row">
            <h1>Keeper #{card.token_id}</h1>
            <TierBadge card={card} />
            {version === "v1" && <span className="kp-version">v1</span>}
          </div>
          <p className="kp-owner-line">
            Owned by{" "}
            <a
              href={`${EXPLORER}/address/${card.owner_id}`}
              target="_blank"
              rel="noreferrer"
            >
              {isOwner ? "you" : shortAccount(card.owner_id)}
            </a>
            {" · held since "}
            {since(card.held_since)}
          </p>

          <section
            className="kp-balance"
            aria-label="Balance held by this Keeper"
          >
            <span>This card holds</span>
            <strong className="kp-num">{formatNear(card.balance)} NEAR</strong>
            <div
              className="kp-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label="Progress to the next tier"
            >
              <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
            </div>
            <small>
              {card.next_tier_at
                ? `${formatNear(BigInt(card.next_tier_at) - BigInt(card.balance))} NEAR more to reach ${TIER_LABELS[card.tier + 1]}`
                : "Top tier reached"}
              {version === "v2" && " · the tier counts NEAR only"}
            </small>
          </section>

          {version === "v2" && (
            <BasketPanel
              key={revision}
              card={card}
              metas={metas}
              account={wallet.account}
              isOwner={isOwner}
              busy={busy}
              run={run}
            />
          )}

          <dl className="kp-history" aria-label="Lifetime history">
            <div>
              <dt>Royalties earned</dt>
              <dd className="kp-num">{formatNear(card.royalties_earned)}</dd>
            </div>
            <div>
              <dt>Deposited</dt>
              <dd className="kp-num">{formatNear(card.deposited_total)}</dd>
            </div>
            <div>
              <dt>Withdrawn</dt>
              <dd className="kp-num">{formatNear(card.withdrawn_total)}</dd>
            </div>
            <div>
              <dt>Trades</dt>
              <dd className="kp-num">{card.trades}</dd>
            </div>
          </dl>

          {error && (
            <Notice tone="error" title="Transaction not completed">
              {error}
            </Notice>
          )}
          {done && (
            <Notice tone="success" title={done.title}>
              Read back from chain.{" "}
              {done.hash && (
                <a
                  href={`${EXPLORER}/txns/${done.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction{" "}
                  <ExternalLink aria-hidden="true" className="kp-inline-icon" />
                </a>
              )}
            </Notice>
          )}

          {card.list_price && (
            <div className="kp-listing">
              <Tag aria-hidden="true" />
              <span>
                For sale at{" "}
                <strong className="kp-num">
                  {formatNear(card.list_price)} NEAR
                </strong>
                .{" "}
                {formatNear(
                  (BigInt(card.list_price) * BigInt(config.royalty_bps)) /
                    10_000n,
                )}{" "}
                NEAR of it goes into the card.
              </span>
            </div>
          )}

          {isOwner ? (
            <OwnerActions card={card} config={config} busy={busy} run={run} />
          ) : (
            <VisitorActions
              card={card}
              basket={basket}
              wallet={wallet}
              busy={busy}
              run={run}
            />
          )}

          <details className="kp-proof">
            <summary>On-chain proof</summary>
            <div className="kp-proof-body">
              {token?.metadata.media && (
                <img
                  src={token.metadata.media}
                  alt="NFT image returned by nft_token on chain"
                  width={96}
                  height={96}
                />
              )}
              <div>
                <p>
                  Every number on this page comes from view calls on{" "}
                  <a
                    href={`${EXPLORER}/address/${contractOf(version)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {contractOf(version)}
                  </a>
                  : <code>card</code>, <code>nft_token</code> and{" "}
                  <code>config</code>
                  {version === "v2" && (
                    <>
                      , plus <code>ft_metadata</code> and{" "}
                      <code>ft_balance_of</code> on each token
                    </>
                  )}
                  . The image on the left is the NEP-177 media generated by the
                  contract; wallets show it with the live tier.
                </p>
                <p className="kp-num">
                  {token?.metadata.title} · tier {card.tier} ({card.tier_name})
                </p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function ActionForm({
  title,
  children,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  onSubmit: () => void;
}) {
  return (
    <form
      className="kp-action"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <h3>{title}</h3>
      <div className="kp-action-row">{children}</div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Basket (v2 inventory)
// ---------------------------------------------------------------------------

/** Suggested compositions, by token symbol. Amounts are editable before signing. */
const PRESETS: { name: string; amounts: Record<string, string> }[] = [
  { name: "Stable", amounts: { USDC: "5", demoUSD: "5" } },
  { name: "Balanced", amounts: { wNEAR: "1", USDC: "5" } },
  { name: "Dollar trio", amounts: { USDC: "3", "USDT.e": "3", demoUSD: "3" } },
  { name: "NEAR only", amounts: { wNEAR: "1" } },
];
/** NEAR kept in the wallet for gas and registrations when wrapping. */
const NEAR_RESERVE = 5n * 10n ** 22n; // 0.05 NEAR

function TokenIcon({ meta }: { meta?: TokenMeta }) {
  return meta?.icon ? (
    <img
      className="kp-token-icon"
      src={meta.icon}
      alt=""
      width={20}
      height={20}
    />
  ) : (
    <span className="kp-token-icon kp-token-icon--letter" aria-hidden="true">
      {(meta?.symbol ?? "?").slice(0, 1)}
    </span>
  );
}

function BasketPanel({
  card,
  metas,
  account,
  isOwner,
  busy,
  run,
}: {
  card: Card;
  metas: Record<string, TokenMeta>;
  account: string;
  isOwner: boolean;
  busy: string;
  run: Run;
}) {
  const inventory = card.inventory ?? [];
  const [held, setHeld] = useState<Record<string, bigint>>({});
  const [near, setNear] = useState<bigint>(0n);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const listed = card.list_price !== null;
  const empty = inventory.every((i) => i.amount === "0");

  // What the connected wallet holds of each token, to cap the fill amounts.
  useEffect(() => {
    if (!account || !open) return;
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        inventory.map(async ({ token }) => {
          try {
            const registered = await chain.ftRegistered(token, account);
            return [
              token,
              registered ? await chain.ftBalance(token, account) : 0n,
            ] as const;
          } catch {
            return [token, 0n] as const;
          }
        }),
      );
      const n = await chain.nearBalance(account).catch(() => 0n);
      if (alive) {
        setHeld(Object.fromEntries(entries));
        setNear(n);
      }
    })();
    return () => {
      alive = false;
    };
  }, [account, open, inventory.length]);

  // Balances are only known once a wallet is connected; until then, no cap.
  const max = (token: string) =>
    !account
      ? BigInt(Number.MAX_SAFE_INTEGER) ** 2n
      : (held[token] ?? 0n) +
        (token === WRAP && near > NEAR_RESERVE ? near - NEAR_RESERVE : 0n);
  const parsed = inventory.map(({ token }) => {
    const meta = metas[token];
    const text = amounts[token] ?? "";
    const value =
      meta && text.trim() !== "" ? parseAmount(text, meta.decimals) : 0n;
    return { token, meta, text, value };
  });
  const invalid = parsed.some(
    (p) => p.value === null || (p.value ?? 0n) > max(p.token),
  );
  const total = parsed.reduce(
    (n, p) => n + (p.value && p.value > 0n ? 1 : 0),
    0,
  );
  const applyPreset = (preset: Record<string, string>) =>
    setAmounts(
      Object.fromEntries(
        inventory.map(({ token }) => [
          token,
          preset[metas[token]?.symbol] ?? "",
        ]),
      ),
    );

  return (
    <section className="kp-basket" aria-labelledby="kp-basket-title">
      <div className="kp-basket-head">
        <h2 id="kp-basket-title">Basket</h2>
        <span className="kp-hint">
          Real NEP-141 tokens held by the card. They move with it when it is
          sold or transferred.
        </span>
      </div>
      <ul className="kp-basket-list">
        {inventory.map(({ token, amount }) => {
          const meta = metas[token];
          return (
            <li key={token} data-empty={amount === "0"}>
              <TokenIcon meta={meta} />
              <span className="kp-basket-symbol">{meta?.symbol ?? "…"}</span>
              <a
                className="kp-basket-contract"
                href={`${EXPLORER}/address/${token}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAccount(token)}
              </a>
              <strong className="kp-num">
                {meta ? formatAmount(amount, meta.decimals) : "…"}
              </strong>
              {isOwner && (
                <Button
                  variant="ghost"
                  icon={ArrowDownToLine}
                  busy={busy === `wt-${token}`}
                  disabled={amount === "0" || listed || busy !== ""}
                  title={listed ? "Delist the card first" : undefined}
                  onClick={() =>
                    void run(
                      `wt-${token}`,
                      `${meta?.symbol ?? "Token"} withdrawn to your wallet`,
                      () => chain.withdrawToken(card, account, token),
                    )
                  }
                >
                  Withdraw
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {empty && <p className="kp-hint">This basket is empty.</p>}

      {!open ? (
        <Button icon={PackagePlus} onClick={() => setOpen(true)}>
          Fill the basket
        </Button>
      ) : (
        <form
          className="kp-fill"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid || total === 0) return;
            void run("fill", "Tokens added to the basket", () =>
              chain.fillCard(
                card,
                account,
                parsed.map((p) => ({ token: p.token, amount: p.value ?? 0n })),
              ),
            );
          }}
        >
          <div className="kp-presets" role="group" aria-label="Presets">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                className="kp-filter"
                onClick={() => applyPreset(p.amounts)}
              >
                {p.name}
              </button>
            ))}
            <button
              type="button"
              className="kp-filter"
              onClick={() => setAmounts({})}
            >
              Clear
            </button>
          </div>
          <div className="kp-fill-grid">
            {parsed.map(({ token, meta, text, value }) => (
              <Input
                key={token}
                label={meta?.symbol ?? token}
                inputMode="decimal"
                placeholder="0"
                value={text}
                onChange={(e) =>
                  setAmounts((a) => ({ ...a, [token]: e.target.value }))
                }
                hint={
                  !account
                    ? undefined
                    : meta
                      ? token === WRAP
                        ? `You have ${formatAmount(held[token] ?? 0n, 24)} wNEAR; missing wNEAR is wrapped from your NEAR.`
                        : `You have ${formatAmount(held[token] ?? 0n, meta.decimals)}.`
                      : undefined
                }
                error={
                  value === null
                    ? "Enter a number"
                    : value > max(token)
                      ? "More than you hold"
                      : undefined
                }
              />
            ))}
          </div>
          <div className="kp-fill-foot">
            <span className="kp-hint">
              One wallet request, one transaction per token (ft_transfer_call).
              Tokens sent any other way cannot be credited.
            </span>
            <Button
              type="submit"
              variant="primary"
              icon={PackagePlus}
              busy={busy === "fill"}
              disabled={invalid || total === 0 || busy !== ""}
            >
              {account ? "Add to the basket" : "Connect and add"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// NEAR actions
// ---------------------------------------------------------------------------

function OwnerActions({
  card,
  config,
  busy,
  run,
}: {
  card: Card;
  config: KeepersConfig;
  busy: string;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [receiver, setReceiver] = useState("");
  const amountYocto = amount.trim() === "" ? null : parseNear(amount);
  const priceYocto = parseNear(price);
  const listed = card.list_price !== null;
  return (
    <section className="kp-actions" aria-label="Owner actions">
      <ActionForm
        title="Withdraw NEAR from the card"
        onSubmit={() =>
          run("withdraw", "Withdrawn to your wallet", () =>
            chain.withdraw(card, amountYocto),
          )
        }
      >
        <Input
          label="Amount in NEAR"
          hint={
            listed
              ? "Delist the card first: a listed card cannot be emptied."
              : "Leave empty to withdraw everything."
          }
          inputMode="decimal"
          placeholder={formatNear(card.balance)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={
            amount.trim() !== "" && amountYocto === null
              ? "Enter a number, e.g. 0.5"
              : undefined
          }
        />
        <Button
          type="submit"
          variant="primary"
          icon={WalletIcon}
          busy={busy === "withdraw"}
          disabled={
            listed ||
            card.balance === "0" ||
            (amount.trim() !== "" && amountYocto === null) ||
            busy !== ""
          }
        >
          Withdraw
        </Button>
      </ActionForm>

      {listed ? (
        <ActionForm
          title="Listing"
          onSubmit={() =>
            run("delist", "Listing removed", () => chain.delist(card))
          }
        >
          <p className="kp-action-note">
            The card is for sale at {formatNear(card.list_price!)} NEAR.
          </p>
          <Button
            type="submit"
            icon={X}
            busy={busy === "delist"}
            disabled={busy !== ""}
          >
            Delist
          </Button>
        </ActionForm>
      ) : (
        <ActionForm
          title="Sell on the built-in market"
          onSubmit={() =>
            priceYocto &&
            run("list", "Listed for sale", () => chain.list(card, priceYocto))
          }
        >
          <Input
            label="Price in NEAR"
            hint={`Minimum ${formatNear(config.min_list_price)} NEAR. ${config.royalty_bps / 100}% of the price will be credited to the card.${card.version === "v2" ? " The basket goes with the card." : ""}`}
            inputMode="decimal"
            placeholder="5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={
              price !== "" && priceYocto === null
                ? "Enter a number, e.g. 5"
                : undefined
            }
          />
          <Button
            type="submit"
            icon={Tag}
            busy={busy === "list"}
            disabled={
              !priceYocto ||
              priceYocto < BigInt(config.min_list_price) ||
              busy !== ""
            }
          >
            List
          </Button>
        </ActionForm>
      )}

      <DepositForm card={card} busy={busy} run={run} />

      <ActionForm
        title="Transfer (NEP-171)"
        onSubmit={() =>
          run("transfer", "Transferred", () =>
            chain.transfer(card, receiver.trim()),
          )
        }
      >
        <Input
          label="Receiver account"
          hint={`The balance, ${card.version === "v2" ? "basket, " : ""}tier and access go with the card.`}
          placeholder="friend.testnet"
          value={receiver}
          onChange={(e) => setReceiver(e.target.value)}
        />
        <Button
          type="submit"
          icon={Send}
          busy={busy === "transfer"}
          disabled={
            !/^[a-z0-9._-]+\.(testnet|near)$|^[0-9a-f]{64}$/.test(
              receiver.trim(),
            ) || busy !== ""
          }
        >
          Transfer
        </Button>
      </ActionForm>
    </section>
  );
}

function DepositForm({
  card,
  busy,
  run,
}: {
  card: Card;
  busy: string;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const amountYocto = parseNear(amount);
  return (
    <ActionForm
      title="Top up this card with NEAR"
      onSubmit={() =>
        amountYocto &&
        run("deposit", "Deposited into the card", () =>
          chain.deposit(card, amountYocto),
        )
      }
    >
      <Input
        label="Amount in NEAR"
        hint="Anyone can add NEAR. Only the owner can withdraw it."
        inputMode="decimal"
        placeholder="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={
          amount !== "" && amountYocto === null
            ? "Enter a number, e.g. 1"
            : undefined
        }
      />
      <Button
        type="submit"
        icon={Coins}
        busy={busy === "deposit"}
        disabled={!amountYocto || busy !== ""}
      >
        Deposit
      </Button>
    </ActionForm>
  );
}

function VisitorActions({
  card,
  basket,
  wallet,
  busy,
  run,
}: {
  card: Card;
  basket: string;
  wallet: Wallet;
  busy: string;
  run: Run;
}) {
  return (
    <section className="kp-actions" aria-label="Actions">
      {card.list_price && (
        <ActionForm
          title="Buy this Keeper"
          onSubmit={() =>
            run("buy", "You own this Keeper now", () => chain.buy(card))
          }
        >
          <p className="kp-action-note">
            You pay {formatNear(card.list_price)} NEAR and receive the card with
            the {formatNear(card.balance)} NEAR it holds
            {basket ? ` and its basket (${basket})` : ""}.{" "}
            {card.version === "v2"
              ? "If the seller changes the listing before your transaction lands, the purchase is refused."
              : "If the balance drops before your transaction lands, the purchase is refused."}
          </p>
          <Button
            type="submit"
            variant="primary"
            icon={ShoppingCart}
            busy={busy === "buy"}
            disabled={busy !== ""}
          >
            {wallet.account
              ? `Buy for ${formatNear(card.list_price)} NEAR`
              : "Connect and buy"}
          </Button>
        </ActionForm>
      )}
      <DepositForm card={card} busy={busy} run={run} />
      <a
        className="kp-explorer-link"
        href={`${EXPLORER}/address/${card.owner_id}`}
        target="_blank"
        rel="noreferrer"
      >
        Owner on explorer <ArrowUpRight aria-hidden="true" />
      </a>
    </section>
  );
}
