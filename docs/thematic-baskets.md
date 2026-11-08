# Paniers thématiques simulés

État : MVP de simulation, NEAR testnet uniquement. **Simulation sur testnet — aucune action réelle détenue.** Aucun courtier, titre tokenisé, ETF réel, dividende, levier, change ou rééquilibrage automatique.

## Modèles et positions

Les trois modèles officiels sont versionnés dans [`packages/shared/baskets.v1.json`](../packages/shared/baskets.v1.json). Les cinq pondérations de chaque modèle totalisent exactement 10 000 points de base. Elles sont illustratives, pas des recommandations. Les limites d’exposition pure et les raisons de chaque composante figurent dans la configuration et l’interface.

Chaque souscription crée un compte NFT individuel avec une clé ML-DSA dans le coffre local chiffré, jamais dans le serveur. Une collection dédiée embarque le nouveau wallet ; les anciens contrats keyless ne sont ni mis à jour ni migrés. La position conserve une copie complète du modèle, sa version, le capital, la date, les prix initiaux, les quantités et le reliquat. Une autre souscription reçoit un autre compte. Une modification éditoriale ne réécrit pas cette copie ; une modification financière exige une nouvelle version et un nouveau déploiement compatible.

Dans cette collection sans série historique, l’index NFT technique existe dès la création du compte, avant le dépôt. Il n’atteste donc pas à lui seul un financement. L’application n’affiche une carte possédée comme position financée qu’après vérification du crédit exact (`funded`, `deposits`) et du couple compte/NFT. Un compte créé puis abandonné reste non financé ; il n’est pas ajouté à la collection des investissements.

## Politique de prix explicite

Mode livré : **Démonstration avec prix fictifs**, source `everkeep-fictional-v1`. Aucun flux réel ni oracle décentralisé. Le mode **Simulation avec cours historiques** n’est pas disponible. Il ne bascule jamais silencieusement vers les fixtures.

Le fournisseur envisagé est [Alpha Vantage, documentation officielle](https://www.alphavantage.co/documentation/#dailyadj). Sa série `TIME_SERIES_DAILY_ADJUSTED` est présentée comme premium, nécessite une clé et donne notamment une clôture ajustée. Ses [conditions d’utilisation](https://www.alphavantage.co/terms_of_service/) prévoient un usage personnel non commercial sauf accord écrit différent. Nous n’avons ni abonnement ni autorisation de redistribution validée pour cette application : aucune intégration réelle n’est activée, aucune clé n’est recherchée ou exposée au frontend. La disponibilité effective des quinze symboles dans cet abonnement reste **non vérifiée** ; ils ne sont pas annoncés comme disponibles chez ce fournisseur. Aucune entreprise n’est remplacée.

Les identifiants ont été contrôlés sur les fiches officielles Nasdaq (vérification du 5 novembre 2026). Cela vérifie le couple nom/ticker, pas le droit de redistribuer ses prix :

| Panier | Fiches de référence |
|---|---|
| AI Infrastructure | [NVIDIA/NVDA](https://www.nasdaq.com/market-activity/stocks/nvda), [Microsoft/MSFT](https://www.nasdaq.com/market-activity/stocks/msft), [Amazon/AMZN](https://www.nasdaq.com/market-activity/stocks/amzn), [Alphabet classe A/GOOGL](https://www.nasdaq.com/market-activity/stocks/googl), [Broadcom/AVGO](https://www.nasdaq.com/market-activity/stocks/avgo) |
| Space & Robotics | [Rocket Lab/RKLB](https://www.nasdaq.com/market-activity/stocks/rklb), [Iridium/IRDM](https://www.nasdaq.com/market-activity/stocks/irdm), [Teradyne/TER](https://www.nasdaq.com/market-activity/stocks/ter), [Intuitive Surgical/ISRG](https://www.nasdaq.com/market-activity/stocks/isrg), [Rockwell Automation/ROK](https://www.nasdaq.com/market-activity/stocks/rok) |
| Energy Transition | [NextEra/NEE](https://www.nasdaq.com/market-activity/stocks/nee), [First Solar/FSLR](https://www.nasdaq.com/market-activity/stocks/fslr), [GE Vernova/GEV](https://www.nasdaq.com/market-activity/stocks/gev), [Enphase/ENPH](https://www.nasdaq.com/market-activity/stocks/enph), [Tesla/TSLA](https://www.nasdaq.com/market-activity/stocks/tsla) |

Les fixtures connaissent exactement ces quinze identifiants. Les prix de base du JSON sont **inventés**, même si leur ordre de grandeur semble plausible. À un jour UTC `d` (jours depuis Unix), la composante d’indice `i` a le prix entier `floor(base × (9200 + ((d + 3i) mod 17) × 100) / 10000)`. Toutes les composantes utilisent le même jour. Une observation est disponible à 00:00 UTC, du lundi au vendredi ; samedi et dimanche reprennent vendredi. Ce calendrier fictif n’est pas celui du NYSE/Nasdaq et ne prétend pas gérer leurs jours fériés. Plage bornée : jours Unix 20454 à 30000. En dehors, erreur explicite. En mode historique futur, les séances, jours fériés, fuseau et disponibilité des clôtures ajustées devront être validés côté serveur avant activation.

Prix manquant, nul, incohérent, mode incorrect ou date différente du dernier jour fictif disponible : refus. Aucune combinaison intraday/clôture. Les unités de prix ne sont pas des dollars réels.

## Calcul exact

- demoUSD : 6 décimales ; 1 demoUSD déposé initialise **1 unité de simulation**, simple convention comptable, sans conversion monétaire garantie.
- Prix : entiers à 6 décimales d’unités de simulation ; quantités : entiers à 8 décimales.
- Budget de la composante : `floor(capital_brut × poids_bps / 10000)`.
- Quantité : `floor(budget × 100000000 / prix_brut)`.
- Coût : `floor(quantité × prix_brut / 100000000)`.
- Reliquat : capital moins la somme des coûts. Il inclut les arrondis d’allocation et de quantité.
- Valeur : somme de `floor(quantité_initiale × prix_retenu / 100000000)` + reliquat.

Rust u128 vérifiés et TypeScript BigInt exécutent les mêmes conventions ; les trois modèles sont comparés en sandbox. Aucun flottant ne décide d’un montant autorisé ou payable. Les quantités restent fixes, les poids dérivent. À l’entrée la valeur calculée égale le capital : le dépôt ne fabrique aucune performance.

L’historique est reconstruit depuis les quantités immuables et la formule de prix versionnée, pas lu comme un historique de cotations réelles. Il est affiché comme fictif, dates UTC explicites. Moins de deux observations : aucune performance. La variation depuis la souscription initiale n’est pas un résultat personnel du propriétaire secondaire. Son prix d’acquisition n’est pas actuellement indexé ; aucun P&L personnel de l’acheteur n’est inventé.

## Fonds, clôture et retrait

**La valorisation est informative. Aucun règlement des gains/pertes fictifs n’est implémenté.** Il n’y a donc pas de réserve de gains à administrer ni de service qui puisse créditer ou réclamer une variation. Capital demoUSD versé, tokens détenus, valeur simulée et montant retirable sont affichés séparément. Le capital reste en demoUSD dans le compte, sans allocation dans la stratégie historique.

Le propriétaire signe `CloseBasket` : le contrat fige le dernier jour fictif et exige absence d’opération ou de vente en cours. Cela ferme l’exposition, sans transférer de tokens et sans nouvelle échéance. Une autre autorisation `Withdraw` retire le disponible réel vers le propriétaire courant. Les réservations avant transfert et callbacks idempotents préexistants empêchent un double paiement. Un résultat inconnu reste bloqué : jamais assimilé à un échec remboursable. Les anciennes séries gardent leur maturité et leur dénouement.

Une hausse n’ajoute aucun token, une baisse n’en brûle aucun. Le montant retiré peut donc différer de la valeur simulée ; l’interface l’explique. Implémenter ultérieurement un règlement demandera un protocole séparé : réserve préfinancée, règles de plafonnement et d’exposition, comptabilité exacte, autorité et cas d’insolvabilité. Il ne suffira pas d’ajouter un montant proposé par le navigateur.

## Autorités et signatures

| Autorité | Pouvoir et limite |
|---|---|
| Propriétaire | Autorise le panier et son montant via ML-DSA, clôture, retrait vers lui-même et transmission selon le protocole existant. |
| Agent thématique | Préparation déterministe gratuite : entreprises et poids du registre, questions bloquantes, proposition structurée. Aucun secret, retrait, paiement ni rééquilibrage autonome. Les trois explications sont Diversification, Analyse thématique et Liquidité. |
| Missions payantes existantes | Restent séparées du capital ; contrats et compétences historiques conservés, dont le spécialiste crypto. Elles ne peuvent pas exécuter une souscription thématique. |
| Administrateur des modèles | Pas de méthode de mutation sur la collection keyless dédiée. Le code compilé fixe la version ; un changement exige une nouvelle publication vérifiable. |
| Valorisation | Formule déterministe dans le contrat et client, aucune clé serveur de prix. Ce n’est pas un oracle de marché. |
| Gestionnaire de réserve | Aucun pour la variation thématique, puisqu’elle n’est pas réglée. L’ancienne stratégie préfinancée reste séparée. |

`BindBasket` signe panier, version, montant et jour d’observation. L’enveloppe existante signe réseau, compte, collection/NFT, nonce, expiration, epoch de propriété et versions de clé/politique. Le contrat calcule lui-même prix et quantités ; le LLM/frontend ne choisit ni valeur ni gain à retirer. La signature n’atteste pas la pertinence d’un thème ou l’exactitude d’un prix de marché.

La création marque le compte `basket_required` dès l’initialisation. Si l’autorisation de panier échoue dans un groupe, le dépôt non autorisé est refusé et remboursé par le resolver FT. Une fois lié, un seul dépôt initial, exact, du propriétaire et au même jour de prix est accepté. Aucun versement complémentaire, yield ou mandat d’allocation autonome. Le flag et la position vivent dans des clés de stockage séparées : le layout Borsh historique est préservé.

Les access keys des comptes et de la collection doivent être absentes ; les code hashes sont vérifiés. La transmission garde les quantités, version et fonds ; les générations et clés changent, l’agent est révoqué. La revente historique reste disponible dans son parcours initial ; la nouvelle collection thématique n’élargit pas ce marché dans cette tranche. Aucun élargissement ni promesse d’atomicité globale NEAR.

## Démonstration reproductible

```bash
npm test
bash scripts/test-contracts.sh
npm run build:contracts
npm run test:baskets
npm run build
```

La sandbox utilise de vrais WASM, vérifications ML-DSA et transferts FT. Elle vérifie notamment la correspondance Rust/TypeScript, les signatures altérées/rejouées, l’échec de financement, le transfert sans ancien accès et la clôture/retrait unique. Les tests de revente historique restent `npm run test:series`.

Pour une **nouvelle** collection testnet, après compilation :

```bash
npm run testnet:baskets                # inspection, aucun envoi
npm run testnet:baskets -- --execute   # création d’un nouveau compte, 6,8 NEAR de test
```

La clé native vient du mécanisme de credentials existant, hors dépôt. Le script refuse de remplacer un code existant différent, conserve le déploiement historique et ajoute seulement `deployment.baskets` à `public/testnet.json`. Aucun compte utilisateur, dépôt ou signature propriétaire n’est créé par ce script.

Dans Explorer : Actions thématiques → AI Infrastructure → composition → 100 demoUSD → récapitulatif → connecter Intear testnet → création du compte (validation 1) → panier et dépôt exact (validation 2 groupée). Le coffre chiffré reste obligatoire sur l’appareil ; l’export est facultatif. Mes positions → collection → position → historique/quantités → clôturer → retirer les tokens réellement disponibles. Agents accepte « Je veux créer une position de 100 demoUSD sur le thème IA » et mène à la même souscription directe, sans mission payante.

Après une fermeture de wallet, relire la création et le journal des transactions. Un résultat inconnu n’est pas rejoué. Si un financement est connu non abouti et aucun envoi n’est encore en attente, « Actualiser les prix et préparer une reprise » conserve le compte et renouvelle explicitement le récapitulatif. La signature ML-DSA périmée ou un rollover de date doit être renouvelé avant dépôt. Une création de compte sans hash ni état final demande une vérification du journal/explorateur ; aucune nouvelle provision automatique.

Risques résiduels : code non audité ; confiance dans les contrats demoUSD et le code publié ; XSS/appareil compromis pendant déverrouillage ; perte du coffre et du mot de passe ; indisponibilité RPC et états asynchrones inconnus. Aucun rendement ou sécurité post-quantique de bout en bout revendiqué.
