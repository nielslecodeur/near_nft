import { units } from "../shared/index.js";
import type { SeriesRules } from "../shared/series.js";
export type InvestmentRequest = {
  amount: string;
  asset: string;
  horizonDays: number;
  liquidity: "at-maturity" | "immediate";
  excluded: string;
  maxInvestment: string;
  notes: string;
};
export type InvestmentProposal = {
  status: "proposed" | "abstain";
  allocations: { strategy: string; amount: string }[];
  remaining: string;
  reasons: string[];
  risks: string[];
  permissions: string[];
  observedAt: string;
  mandateHash: string;
  beneficiary: string;
};
/** Pure deterministic preparation: no network, signer, chat-to-action or secret. */
export function prepareInvestment(
  request: InvestmentRequest,
  rules: SeriesRules | null,
  available: string,
  now: bigint,
  owner: string,
  remainingCapacity?:string,
): InvestmentProposal {
  const reasons: string[] = [];
  let budget = 0n,
    limit = 0n;
  try {
    budget = units(request.amount);
    limit = units(request.maxInvestment);
    if (budget <= 0n || limit <= 0n)
      reasons.push("Montant et plafond doivent être positifs.");
  } catch {
    reasons.push("Montant ou plafond invalide (six décimales au plus).");
  }
  const base = {
    remaining: budget.toString(),
    observedAt: now.toString(),
    mandateHash: rules?.mandate_hash || "",
    beneficiary: owner,
    risks: [
      "Capital et rendement non garantis.",
      "Le capital reste verrouillé jusqu’à l’échéance ; une revente nécessite un acheteur.",
    ],
    permissions: [
      "Une seule souscription, montant exact, actif et stratégie fixés.",
      "Le NFT reste attribué au propriétaire signataire. Aucun droit de retrait ou de marché secondaire pour l’agent.",
    ],
  };
  if (!rules)
    reasons.push("Aucune stratégie opérationnelle vérifiée disponible.");
  if (!owner)
    reasons.push("Choisissez un compte avant de préparer l’investissement.");
  if (budget > BigInt(available))
    reasons.push("Le montant dépasse les demoUSD disponibles dans le compte.");
  const validHorizon =
    Number.isFinite(request.horizonDays) &&
    request.horizonDays >= 0 &&
    request.horizonDays <= 36500;
  if (!validHorizon) reasons.push("Horizon indicatif invalide.");
  if (request.liquidity === "immediate")
    reasons.push(
      "Aucune stratégie disponible ne permet une liquidité immédiate.",
    );
  if (request.asset !== "demoUSD")
    reasons.push("Seul demoUSD est pris en charge dans cette démonstration.");
  const terms = rules?.terms;
  if (terms) {
    if (now < BigInt(terms.opens_at) || now >= BigInt(terms.closes_at))
      reasons.push("La fenêtre de souscription est fermée.");
    if (
      validHorizon &&
      BigInt(terms.matures_at) >
        now + BigInt(Math.floor(request.horizonDays * 86400)) * 1_000_000_000n
    )
      reasons.push(
        "L’échéance de la stratégie dépasse votre horizon indicatif.",
      );
    if (
      request.excluded.split(/[,;\n]/).some((s) => {
        const x = s.trim().toLowerCase();
        return (
          x &&
          [terms.id, terms.name, terms.asset, "demoUSD", "Réserve demoUSD"].some((v) =>
            v.toLowerCase().includes(x),
          )
        );
      })
    )
      reasons.push("La stratégie ou son actif figure dans vos exclusions.");
  }
  const allocated = budget < limit ? budget : limit;
  if(terms&&allocated>BigInt(remainingCapacity??terms.capacity))reasons.push("La capacité restante ne permet pas cette souscription.");
  if (terms && allocated < BigInt(terms.minimum))
    reasons.push(
      "Le montant autorisé est inférieur au minimum de souscription.",
    );
  if (reasons.length)
    return { ...base, status: "abstain", allocations: [], reasons };
  return {
    ...base,
    status: "proposed",
    allocations: [{ strategy: terms!.id, amount: allocated.toString() }],
    remaining: (budget - allocated).toString(),
    reasons: [
      "Une seule stratégie de démonstration est disponible ; elle respecte l’actif, l’horizon et le plafond demandés.",
      "Les liquidités restantes restent dans le compte du propriétaire, hors de la nouvelle position.",
    ],
  };
}
