// Synthetic presentation fixtures. Never use for transaction arguments, balances or valuation.
import themes from "../../design-system/terminal/card-themes.json";
import { parseCardTheme } from "./card-theme";
import type {
  CollectionRow,
  HistoryPoint,
  InventoryState,
  MarketItem,
} from "./market-components";

export const cardThemes = Object.fromEntries(
  Object.entries(themes).map(([id, theme]) => [id, parseCardTheme(theme)]),
);
export const fixtureItems: MarketItem[] = [
  {
    id: "ui-reserve-018",
    name: "Réserve #018",
    collection: "Réserve à échéance",
    category: "Liquidité",
    art: "/art/catalogue/liquidity.svg",
    alt: "Illustration Everkeep : disque ivoire et strates vertes.",
    price: { value: "11,00", unit: "demoUSD" },
    lastSale: { value: "10,40", unit: "demoUSD" },
    available: true,
    theme: cardThemes.matte,
  },
  {
    id: "ui-orbite-024",
    name: "Orbite #024",
    collection: "Études d’allocation",
    category: "Diversification",
    art: "/art/catalogue/diversification.svg",
    alt: "Illustration Everkeep : cercles répartis sur une orbite.",
    price: { value: "24,50", unit: "demoUSD" },
    lastSale: { value: "22,00", unit: "demoUSD" },
    available: true,
    theme: cardThemes.metal,
  },
  {
    id: "ui-axes-031",
    name: "Axes #031",
    collection: "Études de protocoles",
    category: "Crypto",
    art: "/art/catalogue/crypto.svg",
    alt: "Illustration Everkeep : modules reliés dans un réseau géométrique.",
    price: null,
    lastSale: null,
    available: false,
    theme: cardThemes.holo,
  },
];
export const fixtureCollections: CollectionRow[] = [
  {
    id: "ui-reserve-018",
    name: "Réserve à échéance",
    art: "/art/catalogue/liquidity.svg",
    floor: { value: "11,00", unit: "demoUSD" },
    change: 2.8,
    volume: { value: "284,00", unit: "demoUSD" },
    owners: "24",
    points: [10, 11, 10.5, 11.2, 11, 12, 12.2, 13],
  },
  {
    id: "ui-orbite-024",
    name: "Études d’allocation",
    art: "/art/catalogue/diversification.svg",
    floor: { value: "24,50", unit: "demoUSD" },
    change: -1.6,
    volume: { value: "196,00", unit: "demoUSD" },
    owners: "18",
    points: [14, 13.5, 14, 13, 12, 12.5, 11, 10],
  },
  {
    id: "ui-axes-031",
    name: "Études de protocoles",
    art: "/art/catalogue/crypto.svg",
    floor: { value: "8,20", unit: "demoUSD" },
    change: 0,
    volume: { value: "82,00", unit: "demoUSD" },
    owners: "10",
    points: [8, 8, 8.1, 8.2, 8, 8.1, 8.1, 8.1],
  },
];
export const initialInventory: InventoryState = {
  query: "",
  categories: [],
  availableOnly: false,
  filtersOpen: false,
  view: "grid",
  density: "comfortable",
  sort: "recent",
};
export const fixturePriceOrder: Record<string, number> = {
  "ui-reserve-018": 11,
  "ui-orbite-024": 24.5,
  "ui-axes-031": Infinity,
};
export const fixtureFloorOrder: Record<string, number> = {
  "ui-reserve-018": 11,
  "ui-orbite-024": 24.5,
  "ui-axes-031": 8.2,
};
export const fixtureVolumeOrder: Record<string, number> = {
  "ui-reserve-018": 284,
  "ui-orbite-024": 196,
  "ui-axes-031": 82,
};
export const fixtureHistory: HistoryPoint[] = [
  { label: "06 oct.", value: 8.5 },
  { label: "09 oct.", value: 8.9 },
  { label: "12 oct.", value: 8.7 },
  { label: "15 oct.", value: 9.4 },
  { label: "18 oct.", value: 9.2 },
  { label: "21 oct.", value: 10.1 },
  { label: "24 oct.", value: 9.9 },
  { label: "27 oct.", value: 10.5 },
  { label: "30 oct.", value: 10.2 },
  { label: "01 nov.", value: 10.7 },
  { label: "03 nov.", value: 10.8 },
  { label: "04 nov.", value: 11 },
];
