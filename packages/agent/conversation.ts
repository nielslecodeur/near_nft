import {
  parseBudget,
  validateRequest,
  type MissionRequest,
  type ProfileId,
} from "./missions.js";
export type ConversationDraft = Partial<MissionRequest> & {
  category?: "crypto" | "diversification" | "liquidity";
};
export type ConversationResult = {
  draft: ConversationDraft;
  expert: ProfileId;
  status: "question" | "ready" | "incompatible";
  message: string;
  request?: MissionRequest;
};
const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .toLowerCase();
export function understand(
  text: string,
  previous: ConversationDraft = {},
  expert: ProfileId = "liquidity",
  manualExpert = false,
): ConversationResult {
  if (!text.trim() || text.length > 2000 || /ed25519:[a-z0-9]+/i.test(text))
    throw new Error("Décrivez une demande de placement, sans clé privée.");
  const t = normalize(text),
    draft = { ...previous },
    amount = t.match(
      /(?:j'ai|budget(?: de)?|dispose(?: de)?|avec|investir)\s*(\d+(?:[.,]\d{1,6})?)\s*(demousd)?/,
    ),
    token = t.match(/(\d+(?:[.,]\d{1,6})?)\s*demousd/),
    reserve = t.match(
      /(?:garder|garde|conserver|conserve|reserve(?: de)?)\s*(\d+(?:[.,]\d{1,6})?)/,
    ),
    horizon = t.match(/(\d+)\s*(jours?|semaines?|mois|ans?|annees?)/);
  const reserveToken =
    token &&
    reserve &&
    token.index! >= reserve.index! &&
    token.index! < reserve.index! + reserve[0].length;
  if (amount || (token && !reserveToken))
    draft.amount = (amount?.[1] || token![1]).replace(",", ".");
  if (reserve) draft.reserveMinimum = reserve[1].replace(",", ".");
  if (horizon)
    draft.horizonDays =
      Number(horizon[1]) *
      ({
        jour: 1,
        jours: 1,
        semaine: 7,
        semaines: 7,
        mois: 30,
        an: 365,
        ans: 365,
        annee: 365,
        annees: 365,
      }[horizon[2]] || 1);
  if (
    /immediat|sans verrou|eviter.*verrou|pas.*bloqu|toujours disponible/.test(t)
  )
    draft.liquidity = "immediate";
  else if (
    /echeance|terme|peu(?:x|t) attendre|peuvent rester|accepte.*bloqu/.test(t)
  )
    draft.liquidity = "at-maturity";
  if (/sans (?:aucun )?risque|aucune perte|capital garanti/.test(t))
    draft.avoid = "loss";
  if (/eviter.*concentration|plusieurs actifs/.test(t))
    draft.avoid = "concentration";
  if (/(?:position|modele|exposition)\s+(?:en\s+)?crypto/.test(t))
    draft.category = "crypto";
  else if (/position.*diversifi|modele.*diversifi/.test(t))
    draft.category = "diversification";
  else if (/position.*liquidite|reserve demousd/.test(t))
    draft.category = "liquidity";
  if (!manualExpert) {
    if (/crypto/.test(t)) expert = "crypto";
    else if (/diversifi|concentration|tradfi/.test(t)) expert = "tradfi";
    else if (/liquid|disponib|reserve/.test(t)) expert = "liquidity";
  }
  const result = (
    status: ConversationResult["status"],
    message: string,
    request?: MissionRequest,
  ): ConversationResult => ({
    draft,
    expert,
    status,
    message,
    ...(request ? { request } : {}),
  });
  if (/\d+\s*(?:near|usdt|usdc|eth|btc)\b/.test(t) && !token)
    return result(
      "incompatible",
      "Le dépôt disponible est uniquement en demoUSD de test. Je ne convertis pas un budget dans un autre actif.",
    );
  if (draft.category && draft.category !== "liquidity")
    return result(
      "incompatible",
      "Ce modèle n’a pas encore d’adaptateur opérationnel. La Réserve demoUSD à échéance est actuellement le seul modèle exécutable ; je ne la remplace pas par une exposition crypto ou diversifiée.",
    );
  if (draft.liquidity === "immediate")
    return result(
      "incompatible",
      "Le modèle disponible verrouille le capital jusqu’à son échéance. Il ne répond pas à votre besoin de disponibilité immédiate ; aucune allocation ni mission payante préparée.",
    );
  if (draft.avoid === "loss")
    return result(
      "incompatible",
      "Aucun modèle disponible ne garantit le capital. Je m’abstiens plutôt que de préparer un placement incompatible.",
    );
  if (!draft.amount)
    return result(
      "question",
      "Quel budget souhaitez-vous consacrer à cette demande, en demoUSD ?",
    );
  try {
    parseBudget(draft.amount);
  } catch {
    return result(
      "question",
      "Quel montant positif en demoUSD souhaitez-vous utiliser, avec six décimales au plus ?",
    );
  }
  if (draft.horizonDays === undefined)
    return result(
      "question",
      "Pendant combien de jours ou de mois pouvez-vous conserver cette position ?",
    );
  if (draft.liquidity === undefined)
    return result(
      "question",
      "Acceptez-vous de conserver les fonds jusqu’à l’échéance du modèle, ou faut-il un retrait immédiat ?",
    );
  try {
    const request = validateRequest({
      amount: draft.amount,
      asset: "demoUSD",
      horizonDays: draft.horizonDays,
      liquidity: draft.liquidity,
      avoid: draft.avoid || "none",
      excluded: draft.excluded || "",
      notes: draft.notes || "",
      ...(draft.reserveMinimum ? { reserveMinimum: draft.reserveMinimum } : {}),
    });
    return result(
      "ready",
      "Votre demande est comprise. Examinez le tarif et les contraintes avant d’enregistrer le devis. La proposition d’investissement sera livrée après paiement.",
      request,
    );
  } catch (e) {
    return result("question", String(e));
  }
}
