/** Analysis boundary: pure data in/out. This module has no signer or transaction capability. */
export type ProfileId = "tradfi" | "crypto" | "liquidity";
export type Profile = {
  id: ProfileId;
  version: string;
  price: string;
  processing_ns: string;
  enabled: boolean;
};
export const identities: Record<
  ProfileId,
  { name: string; method: string; needs: string; deliverable: string }
> = {
  tradfi: {
    name: "Analyste TradFi",
    method:
      "Mesurer la concentration par actif et stratégie. Limiter chaque stratégie à 50 % du budget.",
    needs: "Budget, horizon, exclusions et positions existantes.",
    deliverable:
      "Répartition, concentrations observées et limites de diversification. Aucun accès à des actions ou ETF.",
  },
  crypto: {
    name: "Spécialiste crypto",
    method:
      "Vérifier contrats et risques documentés. Investir au plus 80 % du budget sur les routes autorisées.",
    needs:
      "Actif, risques à éviter, exclusions et documentation des protocoles.",
    deliverable:
      "Contrats vérifiés, allocation et risques propres au catalogue. Abstention si les données manquent.",
  },
  liquidity: {
    name: "Analyste liquidité",
    method:
      "Comparer l’échéance au besoin de disponibilité et conserver au moins 30 % du budget disponible.",
    needs: "Budget, date de disponibilité et besoin de retrait immédiat.",
    deliverable:
      "Réserve, échéances et conditions de sortie. Une revente ne garantit aucune liquidité.",
  },
};
export type MissionRequest = {
  reserveMinimum?: string;
  amount: string;
  asset: "demoUSD";
  horizonDays: number;
  liquidity: "at-maturity" | "immediate";
  avoid: "none" | "loss" | "concentration" | "protocol";
  excluded: string;
  notes: string;
};
export type Allocation = {
  collection: string;
  strategy_id: string;
  strategy_version: string;
  asset: string;
  strategy: string;
  amount: string;
  mandate_hash: string;
};
export type CatalogueEntry = {
  collection: string;
  terms: import("../shared/series.js").SeriesTerms;
  mandate_hash: string;
  remaining: string;
  closed: boolean;
  observed_at: string;
  risks: string[];
  risk_document: string;
  redemption: "at-maturity";
};
export type Exposure = { asset: string; strategy: string; amount: string };
export type AnalysisInput = {
  mission_id: string;
  profile: Profile;
  request: MissionRequest;
  request_hash: string;
  now: string;
  catalogue: CatalogueEntry[];
  exposures: Exposure[];
};
export type Proposal = {
  mission_id: string;
  agent: ProfileId;
  agent_version: string;
  mode: "demonstration" | "server-adapter";
  request_hash: string;
  created_at: string;
  expires_at: string;
  status: "proposed" | "abstain";
  allocations: Allocation[];
  reserve: string;
  reasons: string[];
  risks: string[];
  exits: string[];
  operations: string[];
  sources: {
    collection: string;
    observed_at: string;
    version: string;
    document: string;
    limits: string;
  }[];
};
const NS = 1_000_000_000n;
const integer = (v: unknown): v is string =>
  typeof v === "string" &&
  /^(0|[1-9][0-9]{0,38})$/.test(v) &&
  BigInt(v) <= (1n << 128n) - 1n;
export function parseBudget(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,24})(\.[0-9]{1,6})?$/.test(value))
    throw new Error("Montant invalide : six décimales au plus.");
  const [a, b = ""] = value.split(".");
  const n = BigInt(a) * 1_000_000n + BigInt(b.padEnd(6, "0"));
  if (n <= 0n || n > (1n << 128n) - 1n) throw new Error("Budget invalide.");
  return n;
}
export function validateRequest(value: unknown): MissionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Demande invalide.");
  const r = value as MissionRequest;
  if (
    Object.keys(r)
      .filter((k) => k !== "reserveMinimum")
      .sort()
      .join(",") !==
      "amount,asset,avoid,excluded,horizonDays,liquidity,notes" ||
    typeof r.amount !== "string" ||
    r.asset !== "demoUSD" ||
    !Number.isInteger(r.horizonDays) ||
    r.horizonDays < 0 ||
    r.horizonDays > 36500 ||
    !["immediate", "at-maturity"].includes(r.liquidity) ||
    !["none", "loss", "concentration", "protocol"].includes(r.avoid) ||
    typeof r.excluded !== "string" ||
    r.excluded.length > 500 ||
    typeof r.notes !== "string" ||
    r.notes.length > 2000
  )
    throw new Error("Champs de mission invalides.");
  parseBudget(r.amount);
  if (
    r.reserveMinimum !== undefined &&
    (typeof r.reserveMinimum !== "string" ||
      !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(r.reserveMinimum) ||
      (!/^0(?:\.0+)?$/.test(r.reserveMinimum) &&
        parseBudget(r.reserveMinimum) > parseBudget(r.amount)))
  )
    throw new Error("Réserve demandée invalide.");
  return { ...r };
}
const requestedReserve = (r: MissionRequest) =>
  !r.reserveMinimum || /^0(?:\.0+)?$/.test(r.reserveMinimum)
    ? 0n
    : parseBudget(r.reserveMinimum);
export function excluded(r: MissionRequest, c: CatalogueEntry) {
  return r.excluded
    .split(/[,;\n]/)
    .some(
      (x) =>
        x.trim() &&
        [
          c.collection,
          c.terms.id,
          c.terms.name,
          c.terms.asset,
          c.terms.strategy,
          "demoUSD",
        ].some((v) => v.toLowerCase().includes(x.trim().toLowerCase())),
    );
}
function eligible(input: AnalysisInput) {
  const { request: r } = input,
    now = BigInt(input.now);
  return input.catalogue.filter(
    (c) =>
      !c.closed &&
      !excluded(r, c) &&
      now >= BigInt(c.terms.opens_at) &&
      now < BigInt(c.terms.closes_at) &&
      BigInt(c.terms.matures_at) <= now + BigInt(r.horizonDays) * 86400n * NS &&
      BigInt(c.remaining) >= BigInt(c.terms.minimum) &&
      now - BigInt(c.observed_at) <= 60n * NS,
  );
}
interface Analyst {
  analyze(input: AnalysisInput): {
    fraction: bigint;
    reasons: string[];
    candidates: CatalogueEntry[];
  };
}
const analysts: Record<ProfileId, Analyst> = {
  tradfi: {
    analyze(i) {
      const totals = new Map<string, bigint>();
      for (const e of i.exposures) {
        totals.set(e.asset, (totals.get(e.asset) || 0n) + BigInt(e.amount));
      }
      const sum = [...totals.values()].reduce((a, b) => a + b, 0n);
      const concentration = [...totals].map(
        ([a, n]) =>
          `${a} : ${sum ? (n * 10000n) / sum : 0n} points de base de l’exposition observée`,
      );
      const routes = eligible(i).sort((a, b) => {
        const amount = (c: CatalogueEntry) =>
          i.exposures
            .filter((e) => e.strategy === c.terms.strategy)
            .reduce((n, e) => n + BigInt(e.amount), 0n);
        return amount(a) < amount(b)
          ? -1
          : amount(a) > amount(b)
            ? 1
            : a.collection.localeCompare(b.collection);
      });
      return {
        fraction: 50n,
        candidates:
          i.request.avoid === "concentration" &&
          new Set(routes.map((c) => c.terms.asset)).size < 2
            ? []
            : routes,
        reasons: [
          "Méthode de concentration : plafond de 50 % du budget par stratégie, priorité aux moins exposées.",
          ...(concentration.length
            ? concentration
            : ["Aucune position financée observée pour ce compte."]),
          "Les routes demoUSD partagent le même actif ; aucune diversification entre actifs ne peut être affirmée. Les expositions sous-jacentes non documentées ne sont pas inférées.",
        ],
      };
    },
  },
  crypto: {
    analyze(i) {
      return {
        fraction: 80n,
        candidates:
          i.request.avoid === "protocol"
            ? []
            : eligible(i).filter(
                (c) => c.risks.length > 0 && c.risk_document.length > 0,
              ),
        reasons: [
          "Méthode crypto : contrats issus du catalogue vérifié et risques documentés ; plafond de 80 % du budget.",
          "La démonstration emploie un jeton de test et une stratégie préfinancée, sans bridge, cours externe ni rendement prédit.",
          "Une route sans documentation de risques est écartée.",
        ],
      };
    },
  },
  liquidity: {
    analyze(i) {
      return {
        fraction: 70n,
        candidates: eligible(i).sort((a, b) =>
          BigInt(a.terms.matures_at) < BigInt(b.terms.matures_at) ? -1 : 1,
        ),
        reasons: [
          "Méthode liquidité : échéances les plus proches d’abord et réserve minimale de 30 %.",
          "La réserve reste dans votre compte. Chaque position est verrouillée jusqu’à son échéance ; aucune revente n’est garantie.",
        ],
      };
    },
  },
};
export function analyzeMission(input: AnalysisInput): Proposal {
  const r = validateRequest(input.request),
    budget = parseBudget(r.amount),
    { fraction, candidates, reasons } =
      analysts[input.profile.id].analyze(input);
  const allocations: Allocation[] = [];
  const byStrategy = new Map<string, bigint>();
  const defaultFloor =
    input.profile.id === "tradfi" ? 0n : budget - (budget * fraction) / 100n;
  const reserveFloor =
    requestedReserve(r) > defaultFloor ? requestedReserve(r) : defaultFloor;
  let reserve = budget;
  if (
    r.liquidity !== "immediate" &&
    r.avoid !== "loss" &&
    r.avoid !== "protocol" &&
    !(
      r.avoid === "concentration" &&
      new Set(candidates.map((c) => c.terms.asset)).size < 2
    )
  )
    for (const c of candidates.slice(0, 4)) {
      const cap = (budget * fraction) / 100n;
      const amount = [
        cap - (byStrategy.get(c.terms.strategy) || 0n),
        reserve - reserveFloor,
        BigInt(c.remaining),
      ].reduce((a, b) => (a < b ? a : b));
      if (amount < BigInt(c.terms.minimum)) continue;
      allocations.push({
        collection: c.collection,
        strategy_id: c.terms.id,
        strategy_version: c.terms.version,
        asset: c.terms.asset,
        strategy: c.terms.strategy,
        amount: amount.toString(),
        mandate_hash: c.mandate_hash,
      });
      reserve -= amount;
      byStrategy.set(
        c.terms.strategy,
        (byStrategy.get(c.terms.strategy) || 0n) + amount,
      );
    }
  const p: Proposal = {
    mission_id: input.mission_id,
    agent: input.profile.id,
    agent_version: input.profile.version,
    mode: "demonstration",
    request_hash: input.request_hash,
    created_at: input.now,
    expires_at: (BigInt(input.now) + 900n * NS).toString(),
    status: allocations.length ? "proposed" : "abstain",
    allocations,
    reserve: reserve.toString(),
    reasons: [
      ...reasons,
      ...(!allocations.length
        ? [
            r.avoid === "loss"
              ? "L’absence de perte ne peut pas être garantie. Aucun placement proposé."
              : "Aucune allocation ne satisfait l’ensemble des contraintes. Le budget reste disponible.",
          ]
        : []),
    ],
    risks: [
      "Capital et rendement non garantis.",
      ...new Set(candidates.flatMap((c) => c.risks)),
    ],
    exits: [
      "Rachat à l’échéance du contrat, sans garantie de revente préalable.",
    ],
    operations: allocations.map(
      (a) =>
        `Créer une position distincte dans ${a.collection}, autoriser exactement ${a.amount} unités puis souscrire.`,
    ),
    sources: input.catalogue.map((c) => ({
      collection: c.collection,
      observed_at: c.observed_at,
      version: c.terms.version,
      document: c.risk_document,
      limits:
        "Lecture on-chain et configuration locale de démonstration ; pas de prix de marché ni d’audit externe.",
    })),
  };
  return validateProposal(p, input, input.now);
}
/** Enforced again after every adapter response AND immediately before owner authorization. */
export function validateProposal(
  value: unknown,
  input: AnalysisInput,
  nowValue: string,
): Proposal {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Proposition structurée requise.");
  const p = value as Proposal,
    now = BigInt(nowValue),
    r = validateRequest(input.request),
    budget = parseBudget(r.amount);
  const keys =
    "agent,agent_version,allocations,created_at,exits,expires_at,mission_id,mode,operations,reasons,request_hash,reserve,risks,sources,status";
  if (
    Object.keys(p).sort().join(",") !== keys ||
    p.mission_id !== input.mission_id ||
    p.agent !== input.profile.id ||
    p.agent_version !== input.profile.version ||
    p.request_hash !== input.request_hash ||
    !["demonstration", "server-adapter"].includes(p.mode) ||
    !integer(p.created_at) ||
    !integer(p.expires_at) ||
    BigInt(p.created_at) > now ||
    now - BigInt(p.created_at) > 86400n * NS ||
    BigInt(p.expires_at) <= now ||
    BigInt(p.expires_at) > BigInt(p.created_at) + 86400n * NS ||
    !["proposed", "abstain"].includes(p.status) ||
    !Array.isArray(p.allocations) ||
    p.allocations.length > 4 ||
    !integer(p.reserve)
  )
    throw new Error("Identité, dates ou schéma de proposition invalide.");
  for (const k of ["reasons", "risks", "exits", "operations"] as const)
    if (
      !Array.isArray(p[k]) ||
      p[k].length > 20 ||
      p[k].some((s) => typeof s !== "string" || s.length > 2000)
    )
      throw new Error("Explications invalides.");
  if (!Array.isArray(p.sources) || p.sources.length !== input.catalogue.length)
    throw new Error("Sources manquantes.");
  for (const c of input.catalogue) {
    const source = p.sources.find((s) => s && s.collection === c.collection);
    if (
      !source ||
      source.version !== c.terms.version ||
      !integer(source.observed_at) ||
      BigInt(source.observed_at) > BigInt(c.observed_at) ||
      now - BigInt(source.observed_at) > 900n * NS ||
      source.document !== c.risk_document ||
      typeof source.limits !== "string" ||
      source.limits.length > 1000 ||
      BigInt(c.observed_at) > now ||
      now - BigInt(c.observed_at) > 60n * NS
    )
      throw new Error("Sources périmées ou non vérifiées.");
  }
  let total = BigInt(p.reserve);
  if (BigInt(p.reserve) < requestedReserve(r))
    throw new Error("La proposition ne conserve pas la réserve demandée.");
  const byStrategy = new Map<string, bigint>();
  const seen = new Set<string>();
  for (const a of p.allocations) {
    if (
      !a ||
      Object.keys(a).sort().join(",") !==
        "amount,asset,collection,mandate_hash,strategy,strategy_id,strategy_version" ||
      !integer(a.amount) ||
      BigInt(a.amount) <= 0n ||
      seen.has(a.collection)
    )
      throw new Error("Allocation invalide ou dupliquée.");
    seen.add(a.collection);
    const c = input.catalogue.find((c) => c.collection === a.collection);
    if (
      !c ||
      !eligible({ ...input, now: nowValue }).includes(c) ||
      a.strategy_id !== c.terms.id ||
      a.strategy_version !== c.terms.version ||
      a.asset !== c.terms.asset ||
      a.strategy !== c.terms.strategy ||
      a.mandate_hash !== c.mandate_hash ||
      BigInt(a.amount) < BigInt(c.terms.minimum) ||
      BigInt(a.amount) > BigInt(c.remaining)
    )
      throw new Error(
        "Route, version, exclusion, liquidité ou capacité incompatible.",
      );
    if (
      r.liquidity === "immediate" ||
      r.avoid === "loss" ||
      r.avoid === "protocol" ||
      (p.agent === "crypto" && (!c.risk_document || !c.risks.length)) ||
      BigInt(a.amount) >
        (budget * { tradfi: 50n, crypto: 80n, liquidity: 70n }[p.agent]) / 100n
    )
      throw new Error("Allocation contraire aux limites de la mission.");
    total += BigInt(a.amount);
    byStrategy.set(
      a.strategy,
      (byStrategy.get(a.strategy) || 0n) + BigInt(a.amount),
    );
  }
  if (
    [...byStrategy.values()].some(
      (v) =>
        v >
        (budget * { tradfi: 50n, crypto: 80n, liquidity: 70n }[p.agent]) / 100n,
    )
  )
    throw new Error("Concentration par stratégie excessive.");
  if (
    p.agent === "crypto" &&
    BigInt(p.reserve) < budget - (budget * 80n) / 100n
  )
    throw new Error("Réserve crypto insuffisante.");
  if (
    r.avoid === "concentration" &&
    p.allocations.length &&
    new Set(p.allocations.map((a) => a.asset)).size < 2
  )
    throw new Error("Diversification demandée impossible.");
  if (
    total !== budget ||
    (p.status === "proposed") !== !!p.allocations.length ||
    (p.agent === "liquidity" && BigInt(p.reserve) < (budget * 30n) / 100n)
  )
    throw new Error("Budget, réserve ou statut incohérent.");
  return JSON.parse(JSON.stringify(p)) as Proposal;
}
