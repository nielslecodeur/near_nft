import { rpc, view, config } from "./client";
import { testnetDeployment, assertTestnet } from "./testnet-network";
import { parseOwnedPlans } from "../packages/shared/wallet";
import { verifyPair, type Snapshot } from "../packages/shared/index";
import {
  parseSeriesState,
  type SeriesState,
} from "../packages/shared/series-state";
import type { Listing } from "../packages/shared/series";
import { readBasketPositions } from "./basket-network";
export async function readTestnetState(owner: string): Promise<SeriesState> {
  await assertTestnet();
  const deployment = await testnetDeployment();
  if (!deployment)
    throw new Error(
      "Aucun modèle opérationnel testnet n’est encore configuré. La connexion et les soldes NEAR restent disponibles.",
    );
  const block = await rpc("block", { finality: "final" }),
    hash = block.header.hash;
  const [account, keys, series] = await Promise.all([
    rpc("query", {
      request_type: "view_account",
      account_id: deployment.collection,
      block_id: hash,
    }),
    rpc("query", {
      request_type: "view_access_key_list",
      account_id: deployment.collection,
      block_id: hash,
    }),
    view(deployment.collection, "series", {}, hash),
  ]);
  // Read successive on-chain pages at one final block; never silently truncate
  // the catalogue at the first 100 historical listings.
  const listings: Listing[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await view(
      deployment.collection,
      "listings",
      { from_index: offset, limit: 100 },
      hash,
    );
    if (!Array.isArray(page) || page.length > 100)
      throw new Error("Page d’annonces invalide.");
    listings.push(...page);
    if (page.length < 100) break;
    if (offset === 900)
      throw new Error(
        "Plus de 1 000 annonces : lecture complète indisponible. Aucun catalogue partiel présenté comme complet.",
      );
  }
  if (
    account.code_hash !== deployment.code_hashes[deployment.collection] ||
    keys.keys.length ||
    series.series?.mandate_hash !== deployment.mandate_hash ||
    series.series.terms.asset !== deployment.asset ||
    series.series.terms.strategy !== deployment.strategy
  )
    throw new Error(
      "Le modèle testnet ne correspond pas à la configuration officielle. Souscription bloquée.",
    );
  const ids = new Set<string>();
  if (owner) {
    for (let offset = 0; offset < 1000; offset += 20) {
      const tokens = await view(
        config.collection,
        "nft_tokens_for_owner",
        { account_id: owner, from_index: String(offset), limit: 20 },
        hash,
      );
      const page = parseOwnedPlans(tokens, owner, config.collection);
      page.forEach((p) => ids.add(p));
      if (page.length < 20) break;
      if (offset === 980)
        throw new Error(
          "Plus de 1 000 positions : utilisez l’index de la collection pour poursuivre la lecture.",
        );
    }
  }
  const relevant = (listings as Listing[]).filter(
    (l) =>
      l.state === "Active" ||
      ["Settling", "Resolving", "AwaitingIndex"].includes(l.state),
  );
  relevant.forEach((l) => ids.add(l.position));
  const positions = await Promise.all(
    [...ids].map(async (position) => {
      const [s, n] = await Promise.all([
        view(position, "snapshot", {}, hash),
        view(config.collection, "nft_token", { token_id: position }, hash),
      ]);
      return verifyPair(config.collection, position, s, n, true);
    }),
  );
  const safeListings = await Promise.all(
    (listings as Listing[]).map(async (l) => {
      if (l.state === "Active") {
        const s = positions.find((s) => s.account_id === l.position);
        if (
          !s ||
          s.owner_id !== l.seller ||
          s.sale?.id !== l.id ||
          s.status !== "SaleLocked"
        )
          throw new Error(
            "Annonce incohérente avec le NFT et son propriétaire. Achat bloqué.",
          );
      }
      return {
        ...l,
        valuation_at: await view(
          l.position,
          "sale_valuation_at",
          { id: l.id },
          hash,
        ),
        claim: await view(
          config.collection,
          "sale_claim",
          { position: l.position, id: l.id },
          hash,
        ),
      };
    }),
  );
  const balance = owner
    ? await view(config.asset, "ft_balance_of", { account_id: owner }, hash)
    : null;
  const basketPositions = deployment.baskets
    ? await readBasketPositions(owner, hash)
    : [];
  return parseSeriesState({
    mode: "testnet",
    capabilities: [
      "testnet-subscription-v1",
      ...(deployment.baskets ? ["thematic-baskets-v1"] : []),
      ...(deployment.missions ? ["testnet-missions-v1"] : []),
    ],
    series,
    positions: [...positions, ...basketPositions],
    listings: safeListings,
    now: block.header.timestamp_nanosec,
    actors: {},
    balances: owner ? { [owner]: balance } : {},
    journal: [],
  });
}
