# Vérifications exécutées

État du 2 novembre 2026. Les rapports JSON proviennent des exécutions, sans substitution cryptographique ni mock du runtime.

| Contrôle | Résultat |
|---|---|
| `bash scripts/test-contracts.sh` | 21 tests Rust : signature indépendante Noble/host, refus, réservations, remboursements partiels, callbacks doubles/obsolètes, budgets, transferts et rachat |
| `npm test` | 6 tests TypeScript : messages, montants exacts, cohérence d’index, interprétation et restrictions de l’agent |
| `npm run build` | TypeScript et bundle Vite réussis |
| `bash scripts/build.sh` | 5 WASM construits par cargo-near, `--cfg near`, wasm-opt ; wallet embarqué avant build collection |
| `bash scripts/demo.sh` | **41 vérifications** réelles, détails dans [sandbox.json](results/sandbox.json) |
| `npm run test:browser` | Chromium réel, sandbox vivante, 12 parcours desktop/mobile ; [browser.json](results/browser.json), aucune erreur JS |
| Lecture RPC testnet | Protocole 88 annoncé ; [testnet-capability.json](results/testnet-capability.json). Aucun déploiement ni test d’intégration testnet |

Les 41 vérifications couvrent dépôts, rendement préfinancé, allocation, limites, rotation, retraits, transmission, collection, receivers acceptant/refusant, tentative hostile signée, rachat et conservation des soldes. Les refus attendus vérifient leur code de raison, pas seulement un échec générique. Le navigateur crée un nouveau plan puis dépose 1 000, confirme un mandat français, alloue 100, constate le refus du plafond, révoque, renouvelle, transmet Alice → Bob, retire 25 et rachète 25.

Un contrôle UI complémentaire confirme l’initialisation réelle du module Wallet Selector en mode testnet non connecté, les libellés français sans doublons et l’absence de débordement desktop : `results/ui-smoke.json`. Il ne connecte aucun compte et ne signe aucune transaction testnet.

## Mesures de la sandbox

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

L’audit npm du lockfile final signale **11 alertes faibles, aucune modérée, élevée ou critique**, dans la chaîne Wallet Selector / near-js / elliptic. Le détail est conservé dans `results/audit.json`. Aucun downgrade majeur automatique n’a été appliqué ; une migration doit être testée séparément avant usage hors démo.

Vite signale un import Node `util` externalisé dans une dépendance transitive et l’usage de `eval` dans `js-sha256`. Le build et les parcours sandbox du navigateur passent ; la connexion/signature avec un véritable compte testnet reste à valider. Ces avertissements ne sont pas assimilés à un test de connexion testnet réussi.
