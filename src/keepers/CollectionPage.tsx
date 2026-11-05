import { useCallback, useEffect, useState } from "react";
import {
  Coins,
  KeyRound,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button, Notice, Skeleton } from "../terminal/primitives";
import { KeeperTile } from "./KeeperCard";
import { TIER_LABELS } from "./art";
import {
  formatNear,
  getAllCards,
  getConfig,
  getStats,
  mint,
  type Card,
  type KeepersConfig,
  type KeepersStats,
} from "./chain";
import type { Wallet } from "./KeepersApp";

type Filter = "all" | "listed" | "mine";

export function CollectionPage({
  wallet,
  navigate,
}: {
  wallet: Wallet;
  navigate: (to: string) => void;
}) {
  const [config, setConfig] = useState<KeepersConfig | null>(null);
  const [stats, setStats] = useState<KeepersStats | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [minting, setMinting] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, s] = await Promise.all([getConfig(), getStats()]);
      setConfig(c);
      setStats(s);
      setCards(await getAllCards(s.minted));
    } catch (e) {
      setError(`Could not read the contract: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function onMint() {
    if (!config) return;
    setMinting(true);
    setError("");
    try {
      if (!wallet.account) await wallet.connect();
      const id = await mint(config.mint_price, config.storage_reserve);
      if (id) navigate(`/keepers/${id}`);
      else await load();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setMinting(false);
    }
  }

  const shown = (cards ?? [])
    .filter((c) =>
      filter === "listed"
        ? c.list_price !== null
        : filter === "mine"
          ? c.owner_id === wallet.account
          : true,
    )
    .slice()
    .reverse();
  const mintCost = config
    ? formatNear(BigInt(config.mint_price) + BigInt(config.storage_reserve))
    : "…";

  return (
    <div className="kp-collection">
      <section className="kp-hero">
        <div className="kp-hero-text">
          <p className="kp-eyebrow">NEAR Hackathon · NFTs that do something</p>
          <h1>Keepers hold money, earn from every resale and evolve.</h1>
          <p className="kp-lede">
            Each Keeper is an NFT with its own NEAR balance, held by the
            contract for that token. Every resale pays{" "}
            {config ? config.royalty_bps / 100 : 10}% into the card itself, and
            its frame upgrades as the balance grows. Sell it, and the balance,
            tier and access move with it.
          </p>
          <div className="kp-hero-actions">
            <Button
              variant="primary"
              icon={Sparkles}
              busy={minting}
              disabled={!config}
              onClick={() => void onMint()}
            >
              Mint a Keeper · {mintCost} NEAR
            </Button>
            <span className="kp-hint">
              1 NEAR goes to the creator, 0.02 NEAR covers on-chain storage. The
              card starts empty and matte.
            </span>
          </div>
        </div>
        <ul className="kp-features" aria-label="What a Keeper does">
          <li>
            <Coins aria-hidden="true" />
            <div>
              <strong>Holds funds</strong>
              <span>
                Anyone can top up a card. Only its owner can withdraw.
              </span>
            </div>
          </li>
          <li>
            <TrendingUp aria-hidden="true" />
            <div>
              <strong>Earns its own royalties</strong>
              <span>
                10% of each resale goes to the card, not to the creator.
              </span>
            </div>
          </li>
          <li>
            <Layers aria-hidden="true" />
            <div>
              <strong>Evolves on chain</strong>
              <span>
                The frame tier is computed by the contract from the balance.
              </span>
            </div>
          </li>
          <li>
            <KeyRound aria-hidden="true" />
            <div>
              <strong>Grants access</strong>
              <span>
                Holders unlock the Vault. Sell the card and access moves too.
              </span>
            </div>
          </li>
        </ul>
      </section>

      {error && (
        <Notice tone="error" title="Something went wrong">
          {error}
        </Notice>
      )}

      <section className="kp-stats" aria-label="Collection on chain">
        <div>
          <span>Minted</span>
          <strong className="kp-num">
            {stats ? `${stats.minted} / ${config?.max_supply ?? "…"}` : "…"}
          </strong>
        </div>
        <div>
          <span>NEAR held by cards</span>
          <strong className="kp-num">
            {stats ? formatNear(stats.total_card_balances) : "…"}
          </strong>
        </div>
        <div>
          <span>Royalty to the card</span>
          <strong className="kp-num">
            {config ? `${config.royalty_bps / 100}%` : "…"}
          </strong>
        </div>
        <div className="kp-tiers">
          <span>Tiers by balance</span>
          <ol>
            {TIER_LABELS.map((label, i) => (
              <li key={label} className={`kp-tier kp-tier--${i}`}>
                {label}
                <small className="kp-num">
                  {i === 0
                    ? "< " +
                      (config ? formatNear(config.tier_thresholds[0]) : "…")
                    : "≥ " +
                      (config
                        ? formatNear(config.tier_thresholds[i - 1])
                        : "…")}
                </small>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="kp-grid-section" aria-labelledby="kp-grid-title">
        <div className="kp-grid-head">
          <h2 id="kp-grid-title">Collection</h2>
          <div className="kp-filters" role="group" aria-label="Filter">
            {(
              [
                ["all", "All"],
                ["listed", "For sale"],
                ["mine", "Yours"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="kp-filter"
                aria-pressed={filter === value}
                disabled={value === "mine" && !wallet.account}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            icon={RefreshCw}
            busy={loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        </div>
        {cards === null ? (
          <Skeleton label="Reading the collection from chain" />
        ) : shown.length === 0 ? (
          <div className="kp-empty">
            {cards.length === 0
              ? "No Keeper has been minted yet. Mint the first one."
              : filter === "listed"
                ? "No Keeper is for sale right now."
                : "You don't own a Keeper yet."}
          </div>
        ) : (
          <div className="kp-grid">
            {shown.map((card) => (
              <KeeperTile
                key={card.token_id}
                card={card}
                account={wallet.account}
                href={`/keepers/${card.token_id}`}
                onOpen={() => navigate(`/keepers/${card.token_id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
