import type { CatalogueItem } from "../../packages/shared/catalogue";
import type { MarketItem } from "./market-components";
import { parseCardTheme } from "./card-theme";
import themes from "../../design-system/terminal/card-themes.json";
import { catalogueCardData } from "./position-card-data";

// Frames are editorial treatments, never financial ratings or NFT rarity.
export function presentCatalogueItem(item: CatalogueItem): MarketItem {
  const price = /^(.*?)\s+(demoUSD)$/.exec(item.money.value);
  return {
    id: item.key,
    name: item.name,
    collection:
      item.kind === "model" ? "Modèle officiel · NEAR" : "Position NFT · NEAR",
    category: item.category,
    art: item.visual.src,
    alt: item.visual.alt,
    price: price ? { value: price[1], unit: price[2] } : null,
    lastSale: null,
    theme: parseCardTheme(
      item.visual.src.startsWith("/art/special/")
        ? themes.special
        : themes.matte,
    ),
    available: item.actionable,
    presentation: {
      card: catalogueCardData(item),
      badge: item.kind === "model" ? "Modèle" : "En vente",
      priceLabel: item.money.value,
      actionLabel:
        item.kind === "model" ? "Examiner la création" : "Examiner l’achat",
      unavailableLabel: "Création indisponible",
      note: `${item.money.label} · ${item.availability}`,
    },
  };
}
