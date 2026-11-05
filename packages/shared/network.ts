export const TESTNET = {
  id: "testnet",
  rpc: "https://test.rpc.fastnear.com",
  explorer: "https://testnet.nearblocks.io",
  faucet: "https://docs.near.org/getting-started/faucet",
  storageByteCost: "10000000000000000000",
  gasReserve: "100000000000000000000000",
} as const;
export type Category = "diversification" | "crypto" | "liquidity";
export const categories: Record<Category, string> = {
  diversification: "Diversification — approche TradFi",
  crypto: "Crypto",
  liquidity: "Liquidité",
};
export type Deployment = {
  baskets?: {
    collection: string;
    code_hash: string;
    wallet_code_hash: string;
    protocol: "everkeep-fictional-v1";
  };
  network: "testnet";
  rpc: string;
  parent: string;
  collection: string;
  asset: string;
  strategy: string;
  missions?: string;
  mandate_hash: string;
  series_id: string;
  category: "liquidity";
  code_hashes: Record<string, string>;
  deployed_at: string;
};
export type OfficialModel = {
  id: string;
  name: string;
  category: Category;
  version: string;
  description: string;
  rules: Record<string, string | number | boolean>;
  status: "unavailable" | "demonstration";
  reason: string;
  exit: string;
  risks: string[];
  collection?: string;
  mandate_hash?: string;
};
export function officialModels(
  deployment?: Deployment | null,
): OfficialModel[] {
  return [
    {
      id: "diversified-v1",
      name: "Panier diversifié",
      category: "diversification",
      version: "1",
      description:
        "Répartir entre plusieurs actifs et limiter leur concentration.",
      rules: {
        minimumAssets: 3,
        maxAssetBps: 4000,
        reserveBps: 2000,
        requiresMultiAssetAdapter: true,
      },
      status: "unavailable",
      reason:
        "Adaptateur multi-actifs non implémenté. Aucune souscription disponible.",
      exit: "Conditions de rachat à définir avant activation.",
      risks: [
        "Capital et rendement non garantis.",
        "TradFi décrit une méthode, sans accès à des actions ou ETF réels.",
      ],
    },
    {
      id: "crypto-v1",
      name: "Exposition crypto",
      category: "crypto",
      version: "1",
      description:
        "Sélectionner des protocoles documentés avec une exposition plafonnée.",
      rules: {
        maxAssetBps: 6000,
        maxOperationBps: 1000,
        requiresProtocolFacts: true,
        requiresCryptoAdapter: true,
      },
      status: "unavailable",
      reason:
        "Adaptateur crypto et sources de risques non disponibles. Aucune souscription possible.",
      exit: "Dépend des protocoles ; aucun délai de rachat validé.",
      risks: [
        "Volatilité, protocole et risque de perte.",
        "Aucun contrat tiers arbitraire n’est autorisé.",
      ],
    },
    {
      id: deployment?.series_id || "liquidity-v1",
      name: "Réserve demoUSD",
      category: "liquidity",
      version: "1",
      description:
        "Créer une position individuelle en demoUSD de test à échéance fixe.",
      rules: {
        singleInitialDeposit: true,
        allocationBps: 2000,
        maxOperationUnits: "10000000",
        maxPeriodUnits: "20000000",
        immediateRedemption: false,
      },
      status: deployment ? "demonstration" : "unavailable",
      reason: deployment
        ? "Démonstration sur NEAR testnet, jeton sans valeur monétaire."
        : "Contrats testnet non configurés ou non vérifiés.",
      exit: "Retrait à l’échéance après dénouement. Revente sans garantie d’acheteur.",
      risks: [
        "Capital et rendement non garantis.",
        "demoUSD est un jeton de test, sans valeur dollar garantie.",
        "La stratégie de démonstration est préfinancée, sans rendement de marché.",
      ],
      collection: deployment?.collection,
      mandate_hash: deployment?.mandate_hash,
    },
  ];
}
export type WalletBalances = {
  account: string;
  nearBalance: string;
  storageReserved: string;
  gasReserve: string;
  spendableEstimate: string;
  demoUSD: string;
  observedAt: string;
  blockHash: string;
  asset: string | null;
};
export function calculateWalletBalances(
  account: string,
  amount: string,
  storageUsage: number,
  locked: string,
  storageCost: string,
  tokenBalance: string,
  observedAt: string,
  blockHash: string,
  asset: string | null,
): WalletBalances {
  for (const v of [amount, locked, storageCost, tokenBalance])
    if (!/^(0|[1-9][0-9]*)$/.test(v)) throw new Error("Solde réseau invalide.");
  if (!Number.isSafeInteger(storageUsage) || storageUsage < 0)
    throw new Error("Stockage réseau invalide.");
  const required = BigInt(storageUsage) * BigInt(storageCost),
    storage = required > BigInt(locked) ? required - BigInt(locked) : 0n,
    gas = BigInt(TESTNET.gasReserve),
    spendable = BigInt(amount) - storage - gas;
  return {
    account,
    nearBalance: amount,
    storageReserved: storage.toString(),
    gasReserve: gas.toString(),
    spendableEstimate: (spendable > 0n ? spendable : 0n).toString(),
    demoUSD: tokenBalance,
    observedAt,
    blockHash,
    asset,
  };
}
