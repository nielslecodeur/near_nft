/**
 * /market: the Keepers market, framed for what it is in the Agent Wallet, the
 * one place buyer agents may spend (their on-chain policy names keepers-v2 as
 * their market). It shows what is for sale, cheapest first, and for each card
 * which of your buyer agents could buy it right now within its limits.
 *
 * The Keeper itself (a card that holds NEAR, earns its royalties, evolves)
 * is explained at the bottom, folded: it is the goods, not the pitch.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bot,
  Coins,
  KeyRound,
  Layers,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
} from "lucide-react";
import { Button, Notice, Skeleton } from "../terminal/primitives";
import { KeeperTile } from "./KeeperCard";
import { TIER_LABELS } from "./art";
import { cardHref, formatNear, getAllCards, getConfig, getStats, mint, type Card, type KeepersConfig, type KeepersStats } from "./chain";
import * as ag from "./agents";
import type { Job, Seat } from "./agents";
import { nameFor } from "./AgentsPage";
import type { Wallet } from "./KeepersApp";

type Filter = "listed" | "all" | "mine";
type Buyer = { seat: Seat; job?: Job; name: string; ceiling: bigint; minTier: number; active: boolean };

const TIER_NAMES = ["matte", "brushed", "holographic", "animated"];
const min = (...v: bigint[]) => v.reduce((a, b) => (b < a ? b : a));

/** What a buyer agent could pay for one card right now: its price limit, cap per card, what is left today and its budget. */
function buyerOf(seat: Seat, job: Job | undefined): Buyer {
  const perTx = BigInt(seat.policy?.per_tx_max ?? "0");
  const maxPrice = job?.buyer?.maxPrice ? BigInt(job.buyer.maxPrice) : perTx;
  const active = !!seat.policy && !seat.paused && !!seat.agent_key;
  return {
    seat,
    job,
    name: nameFor(seat, job),
    ceiling: active ? min(maxPrice, perTx, BigInt(seat.left_today), BigInt(seat.balance)) : 0n,
    minTier: job?.buyer?.minTier ?? 0,
    active,
  };
}

export function MarketPage({ wallet, navigate }: { wallet: Wallet; navigate: (to: string) => void }) {
  const account = wallet.account;
  const [config, setConfig] = useState<KeepersConfig | null>(null);
  const [stats, setStats] = useState<KeepersStats | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [buyers, setBuyers] = useState<Buyer[] | null>(null);
  const [filter, setFilter] = useState<Filter>("listed");
  const [error, setError] = useState("");
  const [minting, setMinting] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, s] = await Promise.all([getConfig("v2"), getStats("v2")]);
      setConfig(c);
      setStats(s);
      setCards(await getAllCards(s.minted, "v2"));
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  // Your buyer agents, and their mission from the runner when you are signed in to it (never prompts).
  useEffect(() => {
    if (!account) return setBuyers(null);
    let alive = true;
    void (async () => {
      const seats = (await ag.seatsForOwner(account).catch(() => [] as Seat[])).filter((s) => s.kind === "Buyer");
      const jobs = ag.runnerSignedIn(account) ? await ag.runnerJobs(account).catch(() => [] as Job[]) : [];
      if (alive) setBuyers(seats.map((s) => buyerOf(s, jobs.find((j) => j.seatId === s.seat_id))));
    })();
    return () => {
      alive = false;
    };
  }, [account, cards]);

  async function onMint() {
    if (!config) return;
    setMinting(true);
    setError("");
    try {
      if (!account) await wallet.connect();
      const id = await mint(config.mint_price, config.storage_reserve);
      if (id) navigate(`/keepers/${id}`);
      else await load();
    } catch (e) {
      setError(ag.friendlyError(e));
    } finally {
      setMinting(false);
    }
  }

  const listed = useMemo(
    () => (cards ?? []).filter((c) => c.list_price !== null).sort((a, b) => (BigInt(a.list_price!) < BigInt(b.list_price!) ? -1 : 1)),
    [cards],
  );
  /** Which of your agents could buy this card now (not your own card: an agent never buys from its owner). */
  const reach = (c: Card) =>
    c.list_price === null || c.owner_id === account
      ? []
      : (buyers ?? []).filter((b) => b.active && BigInt(c.list_price!) <= b.ceiling && c.tier >= b.minTier);
  const shown =
    filter === "listed" ? listed : filter === "mine" ? (cards ?? []).filter((c) => c.owner_id === account).reverse() : [...(cards ?? [])].reverse();
  const cheapest = listed[0]?.list_price ?? null;
  const mintCost = config ? formatNear(BigInt(config.mint_price) + BigInt(config.storage_reserve)) : "…";

  return (
    <div className="kp-collection mk-page">
      <section className="kp-hero mk-hero">
        <div className="kp-hero-text">
          <p className="kp-eyebrow">Market</p>
          <h1>Where your buyer agents shop.</h1>
          <p className="kp-lede">
            A buyer agent can spend only here, on the Keepers market. It picks a card under the price you set; the
            contract checks its limits, pays the seller and sends the card to your wallet. You can buy and sell by hand
            too.
          </p>
          <div className="kp-hero-actions">
            <Button variant="primary" icon={Bot} onClick={() => navigate("/agents/new?role=collector")}>
              Hire a buyer agent
            </Button>
            <Button variant="secondary" icon={Sparkles} busy={minting} disabled={!config} onClick={() => void onMint()}>
              Mint a card to sell · {mintCost} NEAR
            </Button>
          </div>
        </div>
        <ol className="mk-steps" aria-label="How a buyer agent buys">
          <li>
            <Tag aria-hidden="true" />
            <div>
              <strong>1. A seller lists a card</strong>
              <span>With a price in NEAR. Anyone can list a Keeper they own.</span>
            </div>
          </li>
          <li>
            <Bot aria-hidden="true" />
            <div>
              <strong>2. Your agent picks one</strong>
              <span>The cheapest card under your price and tier, with no signature from you.</span>
            </div>
          </li>
          <li>
            <ShieldCheck aria-hidden="true" />
            <div>
              <strong>3. The contract checks, pays, delivers</strong>
              <span>Cap per card, daily cap and budget are enforced on chain; the card lands in your wallet.</span>
            </div>
          </li>
        </ol>
      </section>

      {error && (
        <Notice tone="error" title="Could not read the market">
          {error}
        </Notice>
      )}

      {account && (
        <section className="kp-vault-section" aria-labelledby="mk-buyers">
          <h2 id="mk-buyers">Your buyer agents</h2>
          {buyers === null ? (
            <Skeleton label="Looking for your buyer agents" />
          ) : buyers.length === 0 ? (
            <p className="ag-muted">
              None yet. A buyer agent waits for a card under your price and buys it while you are away.{" "}
              <a
                href="/agents/new?role=collector"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/agents/new?role=collector");
                }}
              >
                Hire one
              </a>
              .
            </p>
          ) : (
            <ul className="mk-buyers">
              {buyers.map((b) => {
                const n = listed.filter((c) => reach(c).includes(b)).length;
                return (
                  <li key={b.seat.seat_id}>
                    <a
                      href={`/agents/${b.seat.seat_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/agents/${b.seat.seat_id}`);
                      }}
                    >
                      <strong>{b.name}</strong>
                    </a>
                    <span className="ag-muted">
                      {b.active
                        ? `Up to ${formatNear(b.ceiling)} NEAR for one card right now${b.minTier ? `, ${TIER_NAMES[b.minTier]} or better` : ""}`
                        : b.seat.paused
                          ? "Paused"
                          : !b.seat.agent_key
                            ? "No access key"
                            : "Not set up"}
                      {" · "}budget {ag.formatAsset(b.seat.balance, "NEAR")}
                    </span>
                    <span className="mk-reach" data-none={!b.active || n === 0 || undefined}>
                      {b.active ? (n ? `Can buy ${n} card${n === 1 ? "" : "s"} below` : "Nothing in reach now") : "Off"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="kp-grid-section" aria-labelledby="mk-grid-title">
        <div className="kp-grid-head">
          <h2 id="mk-grid-title">{filter === "listed" ? "For sale now" : filter === "mine" ? "Your cards" : "Every card"}</h2>
          <div className="kp-filters" role="group" aria-label="Show">
            {(
              [
                ["listed", `For sale (${listed.length})`],
                ["all", "All cards"],
                ["mine", "Yours"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="kp-filter"
                aria-pressed={filter === value}
                disabled={value === "mine" && !account}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="ghost" icon={RefreshCw} busy={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        {filter === "listed" && cheapest && (
          <p className="ag-muted mk-sub">Cheapest first. Cheapest now: {formatNear(cheapest)} NEAR.</p>
        )}
        {cards === null ? (
          <Skeleton label="Reading the market from chain" />
        ) : shown.length === 0 ? (
          <div className="kp-empty">
            {filter === "listed"
              ? "Nothing is for sale right now. Mint a card and list it, and buyer agents can pick it up."
              : filter === "mine"
                ? "You don't own a Keeper yet."
                : "No Keeper has been minted yet."}
          </div>
        ) : (
          <div className="kp-grid">
            {shown.map((card) => {
              const who = reach(card);
              return (
                <div key={card.token_id} className="mk-item">
                  <KeeperTile card={card} account={account} href={cardHref(card)} onOpen={() => navigate(cardHref(card))} />
                  {card.list_price !== null && account && card.owner_id !== account && buyers && buyers.length > 0 && (
                    <p className="mk-match" data-ok={who.length > 0 || undefined}>
                      {who.length ? (
                        <>
                          <BadgeCheck aria-hidden="true" /> Within {who.map((b) => b.name).join(", ")}'s limits
                        </>
                      ) : (
                        "Above what your agents may pay now"
                      )}
                    </p>
                  )}
                  {card.owner_id === account && card.list_price !== null && <p className="mk-match">Your listing</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <details className="kp-vault-section mk-about">
        <summary>
          <h2>What is a Keeper?</h2>
          <span className="ag-muted">The cards sold here, and why they are worth holding.</span>
        </summary>
        <ul className="kp-features" aria-label="What a Keeper does">
          <li>
            <Coins aria-hidden="true" />
            <div>
              <strong>Holds NEAR and a basket</strong>
              <span>NEAR plus wNEAR, USDC, USDT and demoUSD, held by the contract for that card. Only the owner withdraws.</span>
            </div>
          </li>
          <li>
            <TrendingUp aria-hidden="true" />
            <div>
              <strong>Earns its own royalties</strong>
              <span>{config ? config.royalty_bps / 100 : 10}% of each resale here goes into the card itself.</span>
            </div>
          </li>
          <li>
            <Layers aria-hidden="true" />
            <div>
              <strong>Evolves on chain</strong>
              <span>
                Its frame tier comes from its balance:{" "}
                {TIER_LABELS.map((label, i) => (
                  <span key={label}>
                    {i > 0 && ", "}
                    {label}
                    {config && i > 0 ? ` from ${formatNear(config.tier_thresholds[i - 1])} NEAR` : ""}
                  </span>
                ))}
                .
              </span>
            </div>
          </li>
          <li>
            <KeyRound aria-hidden="true" />
            <div>
              <strong>Opens the Vault</strong>
              <span>Holders unlock the Vault. Sell the card and the access moves with it.</span>
            </div>
          </li>
          <li>
            <PackageCheck aria-hidden="true" />
            <div>
              <strong>Can carry an agent too</strong>
              <span>Like any NFT, a Keeper can hold one of your agents; whoever owns the card controls it.</span>
            </div>
          </li>
        </ul>
        <p className="kp-hint">
          {stats ? `${stats.minted} of ${config?.max_supply ?? "…"} minted, ${formatNear(stats.total_card_balances)} NEAR held by the cards. ` : ""}
          A new card costs {mintCost} NEAR (1 to the creator, the rest for storage) and starts empty and matte.
        </p>
      </details>
    </div>
  );
}
