export type EcosystemResource = {
  name: string;
  group: "Financement" | "Agent" | "Collectif" | "Recherche";
  priority: boolean;
  website: string;
  docs?: string;
  code?: string;
  api?: string;
  use: string;
  boundary: string;
};
/** Documentation inventory, not installed adapters or endorsements. Reviewed 2026-11-02. */
export const ecosystem: EcosystemResource[] = [
  {
    name: "NEAR Intents",
    group: "Financement",
    priority: true,
    website: "https://intents.near.org/",
    docs: "https://docs.near-intents.org/",
    code: "https://github.com/near/intents",
    use: "Étudier l’alimentation multi-chaînes d’un NFT-compte ; catalogue d’actifs consulté en lecture seule.",
    boundary:
      "Aucun swap branché. Vérificateur sans testnet documenté ; demoUSD n’est pas un actif cross-chain pris en charge.",
  },
  {
    name: "Aurora",
    group: "Financement",
    priority: false,
    website: "https://aurora.dev/",
    docs: "https://doc.aurora.dev/",
    code: "https://github.com/aurora-is-near",
    use: "Explorer des actifs et interfaces EVM pour une future version du plan.",
    boundary:
      "Pas de wallet EVM ni de transfert ERC-721 intégré ; un NFT NEAR n’est pas automatiquement un NFT Ethereum.",
  },
  {
    name: "HOT",
    group: "Financement",
    priority: false,
    website: "https://hot-labs.org/",
    docs: "https://docs.hotdao.ai/",
    code: "https://github.com/hot-dao",
    use: "Étudier l’abstraction de chaîne et l’expérience d’entrée multi-chaînes.",
    boundary:
      "Ne remplace pas la clé ML-DSA du propriétaire ; pont et modèle MPC à examiner séparément.",
  },
  {
    name: "Rhea",
    group: "Financement",
    priority: true,
    website: "https://rhea.finance/",
    docs: "https://guide.rhea.finance/",
    code: "https://github.com/rhea-finance",
    use: "Candidat pour une vraie stratégie de prêt, via un adaptateur à actif et route fixes.",
    boundary:
      "Aucun dépôt Rhea. Liquidité de rachat, contrats et risques à valider ; aucun taux garanti.",
  },
  {
    name: "meme.cooking",
    group: "Recherche",
    priority: false,
    website: "https://meme.cooking/",
    docs: "https://docs.meme.cooking/",
    api: "https://api.meme.cooking/",
    use: "Référence de lancement et de mécanique de jetons, pour une extension expérimentale distincte.",
    boundary:
      "Memecoins exclus de la stratégie d’épargne actuelle ; ce launchpad ne remplace pas la collection NFT.",
  },
  {
    name: "HEX",
    group: "Financement",
    priority: false,
    website: "https://hex.exchange/",
    docs: "https://hot-labs.gitbook.io/hex/concepts-and-systems/interactive-blocks",
    use: "Comparer les mécanismes d’ordres et de règlement cross-chain.",
    boundary:
      "Le lien documentaire fourni décrit un marché OTC GNK. Aucun SDK universel ni Git fourni par le catalogue n’est supposé.",
  },
  {
    name: "NEAR.AI",
    group: "Agent",
    priority: true,
    website: "https://near.ai/",
    docs: "https://docs.near.ai/",
    code: "https://github.com/nearai/cloud-api",
    use: "Interpréter une intention d’épargne avec inférence privée, puis produire une proposition bornée.",
    boundary:
      "Agent actuel déterministe. API payante non appelée ; aucune clé propriétaire ou décision d’autorisation confiée au modèle.",
  },
  {
    name: "SVRN",
    group: "Recherche",
    priority: false,
    website: "https://svrn.net/",
    docs: "https://svrn.net/research/near-protocol",
    use: "Source de recherche pour documenter les hypothèses économiques du projet.",
    boundary:
      "Le lien fourni est une analyse de NEAR, pas une documentation d’API de souveraineté ou de gestion NFT.",
  },
  {
    name: "Trezu",
    group: "Collectif",
    priority: false,
    website: "https://trezu.org/",
    docs: "https://github.com/NEAR-DevHub/trezu-docs",
    code: "https://github.com/NEAR-DevHub/trezu",
    use: "Explorer un plan détenu par une équipe ou une trésorerie collective.",
    boundary:
      "Pas de multisig Everkeep intégré. La décision collective doit rester compatible avec le consentement et les signatures du wallet.",
  },
  {
    name: "SputnikDAO",
    group: "Collectif",
    priority: false,
    website: "https://x.com/SputnikDao",
    docs: "https://github.com/near-daos/sputnik-dao-contract",
    code: "https://github.com/near-daos/sputnik-dao-contract",
    use: "Étudier les propositions et politiques DAO pour un futur propriétaire collectif.",
    boundary:
      "Pas de remplacement implicite de l’autorité du wallet par un vote ou un rôle administrateur.",
  },
  {
    name: "OutLayer",
    group: "Agent",
    priority: true,
    website: "https://outlayer.ai/",
    docs: "https://app.outlayer.ai/docs/getting-started",
    code: "https://github.com/out-layer/outlayer",
    use: "Étudier l’exécution attestée de l’agent et de ses calculs hors chaîne.",
    boundary:
      "Aucune attestation intégrée. L’attestation ne remplace ni les plafonds on-chain ni la révocation ; pas de clé propriétaire dans un coffre tiers.",
  },
  {
    name: "GoMining",
    group: "Recherche",
    priority: false,
    website: "https://gomining.com/",
    docs: "https://docs.gomining.com/en/product/miners/about",
    use: "Exemple de collectibles numériques associés à une activité réelle, utile pour comparer la promesse NFT.",
    boundary:
      "Collections sur d’autres chaînes et risques de service/minage. Aucun mineur ni rendement BTC ajouté à Everkeep.",
  },
  {
    name: "Agent Market",
    group: "Agent",
    priority: false,
    website: "https://market.near.ai/",
    docs: "https://docs.market.near.ai/",
    api: "https://market.near.ai/docs/",
    use: "Explorer la distribution future d’un agent d’analyse ou de suivi du plan.",
    boundary:
      "Aucun agent engagé, publié ou payé. La réponse d’un prestataire ne donne aucun droit sur le compte.",
  },
  {
    name: "NEAR Builders",
    group: "Recherche",
    priority: true,
    website: "https://nearbuilders.org/",
    docs: "https://nearbuilders.org/build",
    code: "https://github.com/nearbuilders",
    use: "Guides de construction et repérage des outils NEAR, Intents et agents.",
    boundary:
      "Ressource de développement, pas un protocole détenant les fonds du plan.",
  },
  {
    name: "Gulf Labs",
    group: "Recherche",
    priority: false,
    website: "https://gulf-labs.com/",
    use: "Contexte d’infrastructure et de soutien à l’écosystème.",
    boundary:
      "Aucune documentation d’API ou référence Git fournie par le catalogue ; aucun partenariat revendiqué.",
  },
];
