import { CardFrame } from "../terminal/CardFrame";
import { parseCardTheme, type CardTheme } from "../terminal/card-theme";
import themes from "../../design-system/terminal/card-themes.json";
import { Gem } from "lucide-react";
import { NFTCard, type NftCardModel } from "./NFTCard";
import { keeperArt, traits, TIER_LABELS } from "./art";
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

/** Card model for a Keeper: its own on-chain art (immutable) in the shared NFTCard. */
export function keeperModel(card: Card, account: string): NftCardModel {
  const tier = Math.min(3, Math.max(0, card.tier));
  const mine = account !== "" && card.owner_id === account;
  const listed = !!card.list_price;
  return {
    id: `${card.version}-${card.token_id}`,
    name: `Keeper #${card.token_id}${card.version === "v1" ? " (v1)" : ""}`,
    description: mine ? "Yours" : `Owned by ${shortAccount(card.owner_id)}`,
    image: keeperArt(card.dna, tier),
    fit: "contain",
    backdrop: traits(card.dna >>> 0).background,
    imageAlt: `Keeper #${card.token_id}, ${TIER_LABELS[tier]} tier`,
    collection: "Keepers",
    subtitle: TIER_LABELS[tier],
    avatar: <Gem />,
    timer: listed ? { label: "for sale" } : undefined,
    status: { label: TIER_LABELS[tier], tone: tier >= 2 ? "brand" : "neutral" },
    fact:
      card.version === "v1"
        ? { label: "Trades", value: String(card.trades) }
        : { label: "Basket", value: `${basketCount(card)} token${basketCount(card) === 1 ? "" : "s"}` },
    value: listed
      ? { label: "Price", amount: `${formatNear(card.list_price!)} NEAR` }
      : { label: "Holds", amount: `${formatNear(card.balance)} NEAR` },
  };
}

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
  return <NFTCard model={keeperModel(card, account)} href={href} onOpen={onOpen} />;
}

/** The same card, larger, for the Keeper's own page. */
export function KeeperCardLarge({ card, account }: { card: Card; account: string }) {
  return (
    <div className="kp-card-large">
      <NFTCard as="div" model={keeperModel(card, account)} />
    </div>
  );
}
