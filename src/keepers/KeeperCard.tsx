import { CardFrame } from "../terminal/CardFrame";
import { parseCardTheme, type CardTheme } from "../terminal/card-theme";
import themes from "../../design-system/terminal/card-themes.json";
import { Badge } from "../terminal/primitives";
import { Tag } from "lucide-react";
import { keeperArt, TIER_LABELS } from "./art";
import { formatNear, type Card } from "./chain";

/** Frame material for each on-chain tier (0..3), from the JSON theme config. */
const TIER_THEMES: CardTheme[] = [
  parseCardTheme(themes["keeper-matte"]),
  parseCardTheme(themes["keeper-brushed"]),
  parseCardTheme(themes["keeper-holographic"]),
  parseCardTheme(themes["keeper-animated"]),
];

export function KeeperFrame({ card }: { card: Card }) {
  const tier = Math.min(3, Math.max(0, card.tier));
  return (
    <div
      className={`kp-frame kp-frame--tier-${tier}`}
      data-tier={card.tier_name}
    >
      <CardFrame
        theme={TIER_THEMES[tier]}
        art={keeperArt(card.dna, tier)}
        alt={`Keeper #${card.token_id}, ${TIER_LABELS[tier]} tier`}
      />
    </div>
  );
}

export function TierBadge({ card }: { card: Card }) {
  return (
    <span className={`kp-tier kp-tier--${card.tier}`}>
      {TIER_LABELS[card.tier]}
    </span>
  );
}

export function shortAccount(id: string) {
  return id.length > 26 ? `${id.slice(0, 12)}…${id.slice(-12)}` : id;
}

/** Number of tokens the card actually holds (non-empty basket slots). */
export const basketCount = (card: Card) =>
  (card.inventory ?? []).filter((i) => i.amount !== "0").length;

export function KeeperTile({
  card,
  account,
  href,
  onOpen,
}: {
  card: Card;
  account: string;
  href: string;
  onOpen: () => void;
}) {
  const mine = account !== "" && card.owner_id === account;
  return (
    <a
      className="kp-tile"
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onOpen();
      }}
    >
      <KeeperFrame card={card} />
      <div className="kp-tile-body">
        <div className="kp-tile-head">
          <strong>
            Keeper #{card.token_id}
            {card.version === "v1" && <span className="kp-version">v1</span>}
          </strong>
          <TierBadge card={card} />
        </div>
        <dl className="kp-tile-stats">
          <div>
            <dt>Holds</dt>
            <dd className="kp-num">{formatNear(card.balance)} NEAR</dd>
          </div>
          <div>
            <dt>{card.version === "v1" ? "Trades" : "Basket"}</dt>
            <dd className="kp-num">
              {card.version === "v1"
                ? card.trades
                : `${basketCount(card)} token${basketCount(card) === 1 ? "" : "s"}`}
            </dd>
          </div>
        </dl>
        <div className="kp-tile-foot">
          <span className="kp-owner">
            {mine ? "Yours" : shortAccount(card.owner_id)}
          </span>
          {card.list_price && (
            <Badge tone="brand" icon={Tag}>
              {formatNear(card.list_price)} NEAR
            </Badge>
          )}
        </div>
      </div>
    </a>
  );
}
