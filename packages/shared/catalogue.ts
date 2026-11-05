import type { OfficialModel, Category } from "./network.js";
import type { SeriesState } from "./series-state.js";
import type { Snapshot } from "./index.js";
import type { Listing } from "./series.js";
import { displayAmount } from "./ui.js";

export type CatalogueVisual = {
  src: string;
  alt: string;
  origin: string;
  credit: string;
};
export type CatalogueItem = {
  key: string;
  kind: "model" | "listing";
  name: string;
  category: Category | "historical";
  themes: string[];
  visual: CatalogueVisual;
  description: string;
  composition: {
    basis: "target" | "actual";
    rows: { label: string; amount?: string; proportion?: string }[];
    explanation: string;
    limits: string[];
    observedAt?: string;
  };
  exposure: string;
  exit: string;
  availability: string;
  actionable: boolean;
  money: { label: string; value: string };
  strategyId?: string;
  positionId?: string;
  listingId?: string;
  provenance: "editorial-configuration" | "verified-chain";
  sources: {
    financial: "verified-chain" | "not-available";
    observedAt?: string;
    estimates: "none";
    demonstration: boolean;
  };
};
export const catalogueEditorial: Record<
  Category,
  { themes: string[]; visual: CatalogueVisual }
> = {
  diversification: {
    themes: ["Diversification", "Allocation"],
    visual: {
      src: "/art/catalogue/diversification.svg",
      alt: "Trois cercles de couleurs distinctes organisés sur une orbite, illustration éditoriale de diversification.",
      origin: "public/art/catalogue/diversification.svg",
      credit: "Everkeep · illustration vectorielle originale",
    },
  },
  crypto: {
    themes: ["Crypto", "Protocoles"],
    visual: {
      src: "/art/catalogue/crypto.svg",
      alt: "Réseau de modules géométriques bleus et ivoire reliés entre eux, illustration éditoriale de protocoles.",
      origin: "public/art/catalogue/crypto.svg",
      credit: "Everkeep · illustration vectorielle originale",
    },
  },
  liquidity: {
    themes: ["Liquidité", "demoUSD"],
    visual: {
      src: "/art/catalogue/liquidity.svg",
      alt: "Lignes courbes et disque ivoire sur fond vert sombre, illustration éditoriale de réserve.",
      origin: "public/art/catalogue/liquidity.svg",
      credit: "Everkeep · illustration vectorielle originale",
    },
  },
};
export const categoryLabels = {
  diversification: "Diversification",
  crypto: "Crypto",
  liquidity: "Liquidité",
  historical: "Position historique",
};
const when = (ns: string) =>
  new Date(Number(BigInt(ns) / 1_000_000n)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function modelCatalogueItem(
  model: OfficialModel,
  data: SeriesState | null,
  now: bigint,
): CatalogueItem {
  const rules = data?.series.series;
  const verified =
    model.status === "demonstration" &&
    !!rules &&
    model.mandate_hash === rules.mandate_hash;
  const terms = verified ? rules!.terms : null;
  const open =
    !!terms &&
    !data!.series.closed &&
    now >= BigInt(terms.opens_at) &&
    now < BigInt(terms.closes_at) &&
    BigInt(data!.series.committed) < BigInt(terms.capacity);
  const limits: string[] = [];
  if (typeof model.rules.minimumAssets === "number")
    limits.push(
      "Au moins " +
        model.rules.minimumAssets +
        " actifs si ce modèle est activé.",
    );
  if (typeof model.rules.maxAssetBps === "number")
    limits.push("Au plus " + model.rules.maxAssetBps / 100 + " % par actif.");
  if (typeof model.rules.reserveBps === "number")
    limits.push(
      "Réserve cible : " +
        model.rules.reserveBps / 100 +
        " % ; actifs non définis.",
    );
  if (terms)
    limits.push(
      "Allocation autorisée dans la stratégie : au plus " +
        terms.allocation_bps / 100 +
        " %. Ce plafond n’est pas une allocation cible.",
    );
  return {
    key: "model:" + model.id,
    kind: "model",
    name: model.name,
    category: model.category,
    ...catalogueEditorial[model.category],
    description: model.description,
    composition: {
      basis: "target",
      rows: terms
        ? [{ label: "demoUSD de test", proportion: "100 % de l’actif déposé" }]
        : [],
      explanation: terms
        ? "Un seul actif autorisé. Le modèle définit des règles ; il ne représente pas un portefeuille déjà financé."
        : "Actifs et proportions non définis. Aucun instrument n’est actuellement disponible pour ce modèle.",
      limits,
    },
    exposure: terms
      ? "Jeton de démonstration NEAR. Aucune exposition à un dollar réel, à des actions ou à de l’ETH."
      : "Concept de modèle, sans exposition détenue. Ni action d’entreprise ni token de protocole disponible.",
    exit: terms
      ? "Retrait après le " + when(terms.matures_at) + " et dénouement."
      : model.exit,
    availability: open
      ? data?.mode === "sandbox"
        ? "Démonstration locale"
        : "Démonstration testnet"
      : verified
        ? "Souscription fermée"
        : model.status === "demonstration"
          ? "Lecture à vérifier"
          : "À venir",
    actionable: open,
    money: {
      label: "Dépôt minimum",
      value: terms
        ? displayAmount(terms.minimum) + " demoUSD"
        : model.status === "demonstration"
          ? "Non vérifié"
          : "À définir",
    },
    strategyId: model.id,
    provenance: "editorial-configuration",
    sources: {
      financial: verified ? "verified-chain" : "not-available",
      observedAt: verified ? data?.now : undefined,
      estimates: "none",
      demonstration: model.status === "demonstration",
    },
  };
}
export function activeCatalogueListings(data: SeriesState | null, now: bigint) {
  return (
    data?.listings.filter((l) => {
      const p = data.positions.find((p) => p.account_id === l.position);
      return (
        l.state === "Active" &&
        now < BigInt(l.expires_at) &&
        p?.funded &&
        p.owner_id === l.seller &&
        p.sale?.id === l.id &&
        p.status === "SaleLocked"
      );
    }) || []
  );
}
export function listingCatalogueItem(
  sale: Listing,
  position: Snapshot,
  model: OfficialModel | undefined,
  observedAt: string,
  assetId?: string,
): CatalogueItem {
  const known = position.asset === assetId;
  const format = (raw: string) =>
    known
      ? displayAmount(raw) + " demoUSD"
      : raw + " unités de " + position.asset;
  const total =
    BigInt(position.available) +
    BigInt(position.principal) +
    BigInt(position.reserved);
  const row = (label: string, raw: string) => ({
    label,
    amount: format(raw),
    proportion: total
      ? ((BigInt(raw) * 10000n) % total ? "≈ " : "") +
        displayAmount(((BigInt(raw) * 10000n) / total).toString(), 2) +
        " %"
      : undefined,
  });
  const composition = [
    row("Dans le compte", position.available),
    row("Engagés dans la stratégie", position.principal),
    row("Réservés pour une opération", position.reserved),
  ].filter((r) => !r.amount.startsWith("0 "));
  return {
    key: "listing:" + sale.position + ":" + sale.id,
    kind: "listing",
    name: model?.name || "Position historique",
    category: model?.category || "historical",
    ...catalogueEditorial[model?.category || "liquidity"],
    description: "Une position financée, avec ses actifs et ses règles.",
    composition: {
      basis: "actual",
      rows: composition,
      explanation: known
        ? "Actif détenu : demoUSD de test. Les montants sont comptabilisés dans le compte et la stratégie, pas dans le wallet du vendeur."
        : "Unités comptabilisées sur chaîne ; aucune conversion ni valeur monétaire estimée.",
      limits: [],
      observedAt,
    },
    exposure: known
      ? "demoUSD sur NEAR testnet. Aucune valeur dollar garantie ni exposition à des actions."
      : "Actif du contrat : " + position.asset,
    exit: position.series
      ? "Retrait après le " +
        when(position.series.terms.matures_at) +
        " et dénouement."
      : "Contraintes historiques conservées.",
    availability: "En vente · testnet",
    actionable: true,
    money: {
      label: "Prix demandé",
      value: displayAmount(sale.price) + " demoUSD",
    },
    strategyId: position.series?.terms.id,
    positionId: position.account_id,
    listingId: sale.id,
    provenance: "verified-chain",
    sources: {
      financial: "verified-chain",
      observedAt,
      estimates: "none",
      demonstration: known,
    },
  };
}
export function filterCatalogue(
  items: CatalogueItem[],
  query: string,
  category: string,
  theme: string,
) {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const words = norm(query.trim()).split(/\s+/).filter(Boolean);
  return items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (theme === "all" || item.themes.includes(theme)) &&
      words.every((word) =>
        norm(
          [
            item.name,
            item.description,
            categoryLabels[item.category],
            ...item.themes,
            ...item.composition.rows.map((r) => r.label),
            item.positionId || "",
            item.strategyId || "",
          ].join(" "),
        ).includes(word),
      ),
  );
}
