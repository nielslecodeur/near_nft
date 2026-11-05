import { units, type Snapshot } from "./index.js";
import { interpret } from "../agent/index.js";

export function displayAmount(raw = "0", decimals = 6) {
  if(!Number.isInteger(decimals)||decimals<0||decimals>24)throw new Error("Décimales invalides.");
  const value = BigInt(raw);
  const scale=10n**BigInt(decimals);
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return (
    new Intl.NumberFormat("fr-FR").format(value / scale) +
    (fraction ? "," + fraction : "")
  );
}

/** Three significant digits, rounded using integers; no lossy Number conversion. */
export function compactAmount(raw: string) {
  const value = BigInt(raw);
  const digits = value.toString();
  if (digits.length < 4) return displayAmount(raw);
  const divisor = 10n ** BigInt(digits.length - 3);
  let coefficient = (value + divisor / 2n) / divisor;
  let exponent = digits.length - 7;
  if (coefficient === 1000n) {
    coefficient = 100n;
    exponent++;
  }
  const text = coefficient.toString();
  return `≈ ${text[0]},${text.slice(1)}e${exponent}`;
}

export type AppRoute =
  | "presentation"
  | "overview"
  | "portfolio"
  | "nft"
  | "security"
  | "history"
  | "ecosystem";
export function routeFromHash(hash: string): AppRoute {
  if (["#app", "#plan-dashboard"].includes(hash)) return "overview";
  const name = hash.replace(/^#/, "");
  return ["portfolio", "nft", "security", "history", "ecosystem"].includes(name)
    ? (name as AppRoute)
    : "presentation";
}
export const routeHash = (route: AppRoute) =>
  route === "overview" ? "#app" : `#${route}`;

/** Parsing guard only; ownership and operation authorization stay on-chain. */
export function requireSnapshot(value: unknown): Snapshot {
  const invalid = () =>
    new Error(
      "État du plan incomplet ou invalide. Rechargez le compte avant d’agir.",
    );
  if (!value || typeof value !== "object") throw invalid();
  const s = value as Record<string, unknown>;
  for (const name of [
    "account_id",
    "collection_id",
    "owner_id",
    "network",
    "asset",
    "strategy",
    "status",
    "public_key",
  ])
    if (typeof s[name] !== "string" || !s[name]) throw invalid();
  for (const name of [
    "available",
    "reserved",
    "principal",
    "deposits",
    "withdrawals",
    "realized_gains",
    "ownership_epoch",
    "key_version",
    "policy_version",
    "nonce",
    "sync_seq",
  ])
    if (
      typeof s[name] !== "string" ||
      !/^\d+$/.test(s[name] as string) ||
      BigInt(s[name] as string) > (1n << 128n) - 1n
    )
      throw invalid();
  if (
    !("pending" in s) ||
    !("policy" in s) ||
    typeof s.agent_paused !== "boolean" ||
    typeof s.horizon_years !== "number" ||
    typeof s.target_bps !== "number"
  )
    throw invalid();
  if (s.policy !== null) {
    if (typeof s.policy !== "object") throw invalid();
    const policy = s.policy as Record<string, unknown>;
    for (const name of [
      "max_operation",
      "max_period",
      "expires_at",
      "ownership_epoch",
      "policy_version",
    ])
      if (
        typeof policy[name] !== "string" ||
        !/^\d+$/.test(policy[name] as string)
      )
        throw invalid();
    if (
      typeof policy.allocation_bps !== "number" ||
      typeof policy.agent !== "string"
    )
      throw invalid();
  }
  return value as Snapshot;
}

export function actionSummary(input: {
  action: string;
  mode: "local" | "testnet";
  snapshot: Snapshot | null;
  amount: string;
  beneficiary: string;
  natural: string;
}) {
  const { action, mode, snapshot: s, amount, beneficiary, natural } = input;
  const rows: [string, string][] = [];
  let error = "";
  if (["deposit", "withdraw", "redeem", "policy"].includes(action)) {
    try {
      const parsed = units(amount);
      if (parsed <= 0n)
        throw new Error("Saisissez un montant supérieur à zéro.");
      rows.push([
        action === "policy" ? "Plafond par opération" : "Montant",
        `${displayAmount(parsed.toString())} demoUSD`,
      ]);
      if (action === "withdraw" && s && parsed > BigInt(s.available))
        error =
          "Le montant dépasse le solde disponible. Réduisez-le ou récupérez d’abord une partie de la position.";
      if (action === "redeem" && s && parsed > BigInt(s.principal))
        error = "Le montant dépasse le principal placé dans la stratégie.";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (action === "withdraw")
    rows.push([
      "Destinataire",
      beneficiary.trim() || s?.owner_id || "À renseigner",
    ]);
  if (action === "transfer")
    rows.push([
      "Nouveau propriétaire",
      beneficiary.trim() ||
        (mode === "local"
          ? s?.owner_id === "bob.sandbox"
            ? "alice.sandbox"
            : "bob.sandbox"
          : "À renseigner"),
    ]);
  if (action === "deposit")
    rows.push(["Compte crédité", s?.account_id || "Plan chargé"]);
  if (
    ["withdraw", "transfer"].includes(action) &&
    beneficiary &&
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(beneficiary)
  )
    error = "Utilisez une adresse NEAR valide, sans espace ni majuscule.";
  if (action === "transfer" && mode === "testnet" && !beneficiary)
    error = "Renseignez le compte NEAR du destinataire.";
  if (action === "policy") {
    try {
      const intention = interpret(natural);
      rows.push(
        [
          "Objectif indicatif",
          `${intention.target_bps / 100} % par an, sans garantie`,
        ],
        ["Horizon", `${intention.horizon_years} ans`],
        ["Allocation maximale", `${intention.allocation_bps / 100} %`],
        ["Budget du jour UTC", "200 demoUSD"],
      );
      if (units(amount) > units("200"))
        error =
          "Le plafond par opération ne peut pas dépasser le budget du jour de cette démo (200 demoUSD).";
    } catch (e) {
      if (!error) error = e instanceof Error ? e.message : String(e);
    }
  }
  const effects: Record<string, string> = {
    deposit:
      "Le dépôt augmente le disponible après confirmation du crédit. demoUSD est un jeton de test, sans valeur en dollars.",
    withdraw:
      "Le montant sera réservé, puis envoyé au destinataire. L’interface attend le résultat avant de confirmer le retrait.",
    redeem:
      "Le montant passe de la stratégie au disponible après confirmation du rachat. Il n’est pas envoyé à un compte externe.",
    policy:
      "Ce mandat autorise uniquement la route de démonstration et ces plafonds. Sa durée est d’environ 22 heures ; le contrat reste décisionnaire.",
    revoke:
      "Le mandat sera supprimé. L’ancien agent ne pourra plus allouer ; vos fonds restent dans le plan.",
    rotate:
      "Le compte et les fonds restent identiques. Les signatures de l’ancienne génération deviennent invalides ; le mandat existant n’est pas automatiquement révoqué.",
    transfer:
      "Le compte et les positions restent à la même adresse. Le mandat est supprimé, les anciennes générations sont invalidées et le compte attend la synchronisation.",
    create:
      "Un nouveau compte de plan et son titre NFT seront créés. En sandbox, seuls les fonds et clés des personnages de test sont utilisés.",
    receive:
      "Ce consentement associe votre identité NEAR à votre clé de réception. Il ne transfère pas encore la propriété du plan.",
  };
  return {
    rows,
    error,
    effect: effects[action] || "Vérifiez les paramètres avant de confirmer.",
  };
}
