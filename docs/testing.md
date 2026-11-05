> Missions payées : 58 tests Rust (26 wallet + 20 collection + 12 missions), 30 TypeScript, build réussi ; 19 contrôles supplémentaires sur vrais WASM dans `agent-missions.json`. Chrome 390/768/1440 : frais NEAR, consentements ML-DSA, dépôt demoUSD, NFT, remboursement et abstention dans `agent-missions-ui.json`. États historiques partiels/privés vérifiés séparément par fixtures sans dépense (`agent-missions-states.json`). Ancien parcours Orbite revérifié en lecture seule, ainsi que chargement, erreur réseau et capacité. Rapports historiques : WASM série33 + transfert41 + agent11, `mvp-flow.json`, `mvp-ui.json`, `marketplace-states.json`, `mvp-carousel.json`. Voir [le protocole des missions](agent-missions.md). Les descriptions de galeries/carrousels ci-dessous sont des étapes historiques.

# Vérifications exécutées

Mise à jour Explorer NFT du 3 novembre 2026 : 23 tests TypeScript et build TypeScript/Vite réussis. Chrome à 320/390/768/1440 px, clavier/Escape/focus et réduction des animations : [marketplace-ui.json](results/marketplace-ui.json). Parcours réel sandbox achat Alice 20 demoUSD → annonce 19 → achat Bob, anciens NFT préservés : [marketplace-flow.json](results/marketplace-flow.json). Cinq états de rendu avec réponses HTTP de test et aucune commande : [marketplace-states.json](results/marketplace-states.json). Commandes actuelles : `npm run test:browser` et `npm run test:marketplace:states`. Le parcours financier optionnel est décrit dans [Explorer NFT](explorer-marketplace.md). Aucune modification des contrats dans cette passe ; les résultats ci-dessous sont historiques.

État du 2 novembre 2026. Les rapports JSON proviennent des exécutions, sans substitution cryptographique ni mock du runtime.

| Contrôle | Résultat |
|---|---|
| `bash scripts/test-contracts.sh` | 21 tests Rust : signature indépendante Noble/host, refus, réservations, remboursements partiels, callbacks doubles/obsolètes, budgets, transferts et rachat |
| `npm test` | 9 tests TypeScript : messages, montants exacts, cohérence d’index, restrictions de l’agent, passeport NFT sans secret et catalogue de ressources |
| `npm run build` | TypeScript et bundle Vite réussis |
| `bash scripts/build.sh` | 5 WASM construits par cargo-near, `--cfg near`, wasm-opt ; wallet embarqué avant build collection |
| `bash scripts/demo.sh` | **41 vérifications** réelles, détails dans [sandbox.json](results/sandbox.json) |
| `npm run test:browser` | Chromium réel, sandbox vivante, 12 parcours desktop/mobile ; [browser.json](results/browser.json), aucune erreur JS |
| Lecture RPC testnet | Protocole 88 annoncé ; [testnet-capability.json](results/testnet-capability.json). Aucun déploiement ni test d’intégration testnet |

Les 41 vérifications couvrent dépôts, rendement préfinancé, allocation, limites, rotation, retraits, transmission, collection, receivers acceptant/refusant, tentative hostile signée, rachat et conservation des soldes. Les refus attendus vérifient leur code de raison, pas seulement un échec générique. Le navigateur crée un nouveau plan puis dépose 1 000, confirme un mandat français, alloue 100, constate le refus du plafond, révoque, renouvelle, transmet Alice → Bob, retire 25 et rachète 25.

Un contrôle UI complémentaire confirme l’initialisation réelle du module Wallet Selector en mode testnet non connecté, les libellés français sans doublons et l’absence de débordement desktop : `results/ui-smoke.json`. Il ne connecte aucun compte et ne signe aucune transaction testnet.

## Mesures de la sandbox

Le thème vert forêt et la scène interactive sont contrôlés avec `npm run test:forest` : palette, pause, rotation clavier/pointeur, explications des permissions et de la transmission, réduction des mouvements et accès clavier au tableau. Aucun POST de mutation durant ce contrôle ; six largeurs sans débordement. Rapport : [forest-ui.json](results/forest-ui.json). Aucun contrat modifié par cette tranche UI.

La tranche NFT/écosystème ajoute `npm run test:nft` : identité et export comparés au snapshot chargé, préparation de transfert annulée, filtres des 15 ressources et deux vues vérifiées de 320 à 1440 px, avec état wallet inchangé. Rapport : [nft-workspace.json](results/nft-workspace.json). `npm run check:ecosystem` consulte uniquement les métadonnées publiques Intents ; [l’analyse des ressources](ecosystem.md) distingue cela d’un swap ou d’un protocole externe connecté aux fonds.

La refonte frontend ajoute `npm run test:design` (serveurs actifs) : chargement réel, exploration clavier de la projection, focus des fenêtres, réduction des animations, polices locales et six largeurs de 320 à 1440 px. Rapport : [frontend-design.json](results/frontend-design.json). Le scénario métier vérifie également l’état d’attente, le blocage de fermeture pendant une opération et le succès avec mouvement observé. Voir [la direction visuelle](frontend-design.md). Les contrats Rust ne sont pas modifiés par cette refonte.

| Mesure | Valeur |
|---|---|
| Runtime | nearcore 2.14.0, protocole 88 |
| Transaction de mandat complète | 3 837 911 028 044 gas, soit environ 3,84 Tgas |
| Message de mandat | 574 octets |
| Clé / signature ML-DSA-65 | 1 952 / 3 309 octets |
| Wallet WASM | 221 782 octets |
| Stockage wallet du scénario | 224 158 octets, dont 2 376 de surcoût au-delà du WASM |

Bornes testées : mandat < 15 Tgas, wallet < 1 Mio, surcoût de stockage du scénario < 64 Kio. Ce sont des mesures du scénario et du build courant, pas des maximums universels. La paire wallet/collection est relue au même bloc final dont le hash figure dans le rapport. Les empreintes des WASM sont dans `results/build.json`.

## Reproduction et diagnostic

Utiliser les commandes du [guide](demo.md), sans changer d’environnement Node entre installation et exécution. Le build officiel cargo-near est indispensable : un build cargo brut omettait `--cfg near` et masquait les motifs de rejet par des traps WASM. Les builds sont locaux `non-reproducible-wasm` ; aucune reproductibilité Docker n’est annoncée.

Sous WSL, Vite surveille les changements par polling pour détecter les écritures effectuées depuis Windows. Les répertoires de recherche et artefacts sont exclus de cette surveillance ; le port est strictement 5173, conforme à l’Origin autorisé par l’API.

Les sauts de l’horloge civile WSL ont provoqué des timeouts de finalisation. `sandbox-env.sh` charge sous WSL une correction de l’horloge **uniquement dans le processus sandbox**, ancrée sur l’horloge monotone (`support/stable-clock.c`). Elle ne modifie ni l’horloge système ni la cryptographie. Le rapport indique `stable_clock: true`. Désactivation possible avec `EVERKEEP_STABLE_CLOCK=0` ; un compilateur C est requis pour cette correction.

Les journaux et captures de travail sont dans `.research/`, exclus de Git. `test-receiver` n’est utilisé qu’en sandbox. Ces tests ne constituent pas un audit, une preuve formelle, ni une validation testnet.

## Dépendances et bundle

La refonte éditoriale actuelle ajoute `npm run test:art` (sept routes, mécanisme interactif, confirmations, focus, réduction des mouvements et contrastes ciblés) et `npm run test:portfolio` (positions, proposition, commandes et journal). `npm run test:forest` est un alias du nouveau contrôle de présentation. Voir results/art-direction-v2.json, results/portfolio-ui.json et docs/art-direction-v2.md. Les anciens rapports restent datés ; ils ne décrivent pas nécessairement la direction visuelle actuelle.

L’audit npm du lockfile final signale **11 alertes faibles, aucune modérée, élevée ou critique**, dans la chaîne Wallet Selector / near-js / elliptic. Le détail est conservé dans `results/audit.json`. Aucun downgrade majeur automatique n’a été appliqué ; une migration doit être testée séparément avant usage hors démo.

Vite signale un import Node `util` externalisé dans une dépendance transitive et l’usage de `eval` dans `js-sha256`. Le build et les parcours sandbox du navigateur passent ; la connexion/signature avec un véritable compte testnet reste à valider. Ces avertissements ne sont pas assimilés à un test de connexion testnet réussi.


## Passe UI/UX du 2 novembre 2026

16 tests TypeScript et build TypeScript/Vite réussis. `npm run test:quality` couvre les routes et leur focus, état vide/chargement, transport refusé sans mutation, conservation des champs, copie d'adresse, API incomplète refusée, u128 maximal avec copie exacte et projection protégée, opérations en attente et six largeurs. Les états de transport et d'extrême sont des fixtures explicitement injectées, distinctes du parcours de transactions réelles dans browser.json. Résultats : results/ui-quality.json et docs/ui-review.md. Six rôles de contraste mesurés, au minimum 5,02 : results/ui-contrast.json. Aucun lint configuré. Aucun nouveau test Rust nécessaire : aucun contrat modifié dans cette passe.
