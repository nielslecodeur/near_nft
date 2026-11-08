import {
  baskets,
  basketById,
  fictionalPrices,
  subscribeBasket,
  PRICE_MODE,
  type BasketPosition,
} from "../shared/baskets.js";
import { units } from "../shared/index.js";
export type ThematicExpert = "diversification" | "thematic" | "liquidity";
export type ThematicDraft = { basketId?: string; amount?: string };
export function prepareThematic(
  text: string,
  now: bigint,
  previous: ThematicDraft = {},
  expert: ThematicExpert = "thematic",
) {
  if (
    !text.trim() ||
    text.length > 2000 ||
    /ed25519:|seed phrase|private key/i.test(text)
  )
    throw Error("Décrivez votre demande sans clé ni phrase de récupération.");
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const matches = baskets.filter((b) =>
    b.id === "ai-infrastructure"
      ? /\bia\b|\bai\b|nvidia|infrastructure/.test(normalized)
      : b.id === "space-robotics"
        ? /space|spatial|robot|espace/.test(normalized)
        : /energy|energie|transition|solaire/.test(normalized),
  );
  const amount = normalized.match(/(\d+(?:[.,]\d{1,6})?)\s*demousd\b/);
  const draft = {
    ...previous,
    ...(matches.length === 1 ? { basketId: matches[0].id } : {}),
    ...(amount ? { amount: amount[1].replace(",", ".") } : {}),
  };
  let message = "",
    proposal: BasketPosition | undefined;
  if (
    /garanti|sans risque|actions reelles|levier|dividende|mainnet/.test(
      normalized,
    )
  )
    message =
      "Ce prototype simule des quantités d’actions sur testnet, sans achat réel, dividende, levier ou capital garanti. Je ne prépare pas cette demande.";
  else if (/\d+\s*(eur|usd\b|usdc|usdt|near|eth|btc)/.test(normalized))
    message =
      "Seul un montant en demoUSD de test est accepté. Aucun change n’est préparé.";
  else if (matches.length > 1)
    message =
      "Quel panier souhaitez-vous souscrire : AI Infrastructure, Space & Robotics ou Energy Transition ? Une proposition crée une seule position.";
  else if (!draft.basketId)
    message =
      "Quel thème choisissez-vous : IA, espace et robotique, ou transition énergétique ?";
  else if (!draft.amount)
    message = "Quel montant souhaitez-vous souscrire, en demoUSD ?";
  else {
    try {
      const model = basketById(draft.basketId);
      proposal = subscribeBasket(
        model,
        units(draft.amount).toString(),
        fictionalPrices(model, now),
        now,
      );
      const detail =
        expert === "liquidity"
          ? "Le capital reste dans le compte en demoUSD. Clôturez la simulation puis retirez le solde réel ; aucune hausse fictive n’est payable."
          : expert === "diversification"
            ? "Cinq entreprises ne suppriment pas la concentration sectorielle ni leurs expositions communes. Les pondérations restent celles du modèle."
            : model.components
                .map((c) => `${c.name} (${c.weight_bps / 100} %) : ${c.reason}`)
                .join(" ");
      message = `Proposition : ${draft.amount} demoUSD sur ${model.name}, version ${model.version}. ${detail} ${model.limits} ${PRICE_MODE}. Cette préparation gratuite n’envoie aucun fonds.`;
    } catch {
      message =
        "Saisissez un montant de 1 à 100 000 demoUSD, avec six décimales au plus.";
    }
  }
  return { draft, message, proposal };
}
