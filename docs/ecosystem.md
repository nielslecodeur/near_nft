# Ressources NEAR et direction NFT d’Everkeep

Consultation du 2 novembre 2026 à partir du [catalogue du hackathon](https://near.army/). Les sites et documentations publiques ont été examinés ; les liens Git sont conservés pour les études d’adaptateurs. Les révisions HEAD résolues sont dans [ecosystem-sources.json](results/ecosystem-sources.json) : ce relevé de références n’est pas une revue de leur code ni une validation de leurs produits.

## Le produit NFT

Everkeep possède déjà une collection/factory et un NFT par compte d’épargne. Le transfert du titre change le contrôle du wallet, invalide les anciennes générations et supprime le mandat agent ; compte, actifs et positions persistent. Voir [architecture](architecture.md) et [transfert](transfer-protocol.md).

L’espace **NFT du plan** rend maintenant cet usage visible : identité collection/token/compte, propriétaire de l’état chargé, soldes exacts, générations et permissions. Il exporte un passeport JSON par liste de champs autorisés, sans secret. Le passeport est un relevé d’un snapshot chargé, pas une preuve signée, un certificat de propriété en direct ou une mise à jour NEP-177. Son illustration appartient à l’interface, pas aux métadonnées on-chain. Les actions utilisent les modales et le protocole de signature existants ; aucune autorité nouvelle n’est accordée.

Ce n’est pas une nouvelle collection de JPEG, une marketplace, une vente atomique, un NFT cross-chain ni une succession automatique. La piste produit est le **NFT-compte d’épargne transmissible**. Le [track officiel](https://github.com/nearai/near-hackathon-prompt-examples/blob/78733430eac004f9ebca44cdb9f2bc72b403c057/tracks/10-nfts.md) est déjà aligné sur ce comportement.

## Carte des 15 ressources

Le catalogue typé utilisé par l’atelier est `packages/shared/ecosystem.ts`. Chaque entrée contient site, documentation, Git ou API effectivement fourni, usage envisagé et limite d’intégration. Les choix ci-dessous sont notre analyse pour Everkeep, pas des fonctionnalités revendiquées chez les fournisseurs.

| Ressource et documentation consultée | Usage envisagé | État dans Everkeep |
|---|---|---|
| [NEAR Intents](https://docs.near-intents.org/) | Entrée multi-chaînes vers un compte de plan | Catalogue public d’actifs consulté ; aucun swap ni dépôt |
| [Aurora](https://doc.aurora.dev/) | Interfaces/actifs EVM pour une version ultérieure | Documentation ; aucun ERC-721 ou wallet EVM intégré |
| [HOT](https://docs.hotdao.ai/) | Abstraction de chaîne et expérience de financement | Documentation ; aucun pont ni remplacement de clé propriétaire |
| [Rhea](https://guide.rhea.finance/) | Adaptateur de stratégie de prêt à route fixe | Candidat ; seul le rendement préfinancé de test fonctionne actuellement |
| [meme.cooking](https://docs.meme.cooking/) | Étude de mécanismes de lancement de jetons | Piste séparée ; pas d’allocation memecoin dans l’épargne |
| [HEX](https://hot-labs.gitbook.io/hex/concepts-and-systems/interactive-blocks) | Comparaison de règlement et d’ordres cross-chain | Le lien fourni décrit un OTC GNK ; aucun adaptateur branché |
| [NEAR.AI](https://docs.near.ai/cloud/quickstart) | Interprétation privée d’une intention en proposition bornée | Documentation ; agent actuel déterministe, aucune requête payante |
| [SVRN](https://svrn.net/research/near-protocol) | Recherche sur les hypothèses économiques NEAR | Document d’analyse, pas une API de contrôle NFT |
| [Trezu](https://github.com/NEAR-DevHub/trezu-docs) | Plans d’équipe/trésorerie collective | Étude du modèle ; aucun multisig Everkeep ajouté |
| [SputnikDAO](https://github.com/near-daos/sputnik-dao-contract) | Propositions et permissions d’un futur propriétaire collectif | Source repérée ; aucune gouvernance externe ajoutée au wallet |
| [OutLayer](https://app.outlayer.ai/docs/getting-started) | Exécution attestée des calculs de l’agent | Documentation ; aucune attestation ni custody intégrée |
| [GoMining](https://docs.gomining.com/en/product/miners/about) | Comparaison de collectibles liés à une activité productive | Référence produit ; aucun mineur ni rendement BTC ajouté |
| [Agent Market](https://docs.market.near.ai/) | Distribution future d’un agent de suivi/analyse | Documentation et [référence API](https://market.near.ai/docs/) repérées ; aucun agent engagé, payé ou publié |
| [NEAR Builders](https://nearbuilders.org/build) | Guides et repérage des outils de construction | Utilisé pour la recherche et le choix des prochaines briques |
| [Gulf Labs](https://gulf-labs.com/) | Contexte d’infrastructure et d’écosystème | Aucune documentation d’API ou référence Git fournie par le catalogue ; aucun partenariat revendiqué |

HEX, SVRN et GoMining n’ont pas de lien Git fourni dans ce catalogue ; cela ne prouve pas qu’aucun dépôt public n’existe. Le lien X de SputnikDAO a renvoyé 403, mais son dépôt officiel est accessible. Le premier accès à la documentation HEX a expiré ; sa lecture a réussi ensuite. Les pages Swagger de meme.cooking et Agent Market ont peu de contenu textuel exploitable ; aucun schéma d’API métier non lu n’est inventé.

## Contrainte déterminante : Intents et les actifs

La [documentation du vérificateur](https://docs.near-intents.org/integration/verifier-contract/introduction) indique un déploiement `intents.near` et **aucun déploiement testnet**. Cette découverte ne permet pas de convertir une démo sandbox/demoUSD en financement cross-chain opérationnel. Aucun fonds réel ni transaction mainnet n’est utilisé dans ce travail.

`npm run check:ecosystem` appelle seulement `GET https://1click.chaindefuser.com/v0/tokens`, suivant la documentation officielle 1Click. Le relevé [ecosystem-capabilities.json](results/ecosystem-capabilities.json) a retourné 210 actifs à son horodatage. Ce résultat prouve l’accès aux métadonnées publiques uniquement : pas de quote, création d’adresse de dépôt, financement, signature ou règlement. L’atelier affiche le relevé daté et ne le présente pas comme une cotation en direct. Un échec futur est enregistré comme indisponible, sans bascule vers une exécution réelle.

Le wallet courant accepte uniquement le FT et la stratégie fixés à son initialisation. Il n’a pas d’upgrade ni d’appel arbitraire : un adaptateur Rhea ou un nouveau FT exige une version de contrats dédiée, ses tests et un déploiement séparé, pas un simple bouton d’interface.

## Ordre d’intégration proposé

1. **Livré :** passeport NFT et atelier des 15 ressources ; observation réelle de métadonnées Intents.
2. **Étape suivante :** spécifier une entrée multi-chaînes, avec actif admis, destinataire exact, reçu de dépôt, délais, remboursement et vérification du crédit effectif du plan. Choisir un seul chemin initial parmi Intents/HOT/HEX ; Aurora répond à un besoin EVM distinct.
3. **Stratégie réelle :** adaptateur Rhea isolé, actif et méthodes en liste blanche, liquidité de rachat et résultats asynchrones contrôlés. L’[interface future](../packages/shared/strategy.ts) ne donne aucun droit on-chain. La [documentation de dépôt](https://guide.rhea.finance/near-chain-guides/lending-and-borrowing/supplying) explique la variabilité des taux et les contraintes de liquidité ; aucune garantie n’en est déduite.
4. **Agent privé/vérifiable :** NEAR.AI pour proposer une intention structurée ; OutLayer pour attester une exécution hors chaîne si ce besoin est démontré. Les contrôles contractuels restent obligatoires. Les clés API restent côté serveur ; jamais de clé ML-DSA propriétaire dans un prompt ou un coffre tiers à droits d’upgrade. Le [quickstart NEAR AI](https://docs.near.ai/cloud/quickstart) exige compte, crédits et clé API ; aucun de ces achats n’a été fait ici.
5. **Épargne collective/distribution :** Trezu/SputnikDAO pour le parcours d’un propriétaire collectif et Agent Market pour la distribution d’un agent, après définition de la signature et du consentement. SVRN, NEAR Builders et Gulf Labs servent la recherche/construction ; meme.cooking et GoMining restent des pistes séparées du mandat d’épargne actuel.

## Vérification de cette tranche

`npm test` couvre export sans secrets, identité, conservation exacte des chaînes de montants, état de transfert indisponible et catalogue de liens. Avec sandbox/Vite actifs, `npm run test:nft` consulte le plan, compare l’export à l’état API, ouvre puis annule une préparation de transfert, filtre les 15 ressources et vérifie les deux vues sur six largeurs. Le snapshot final doit être identique au snapshot initial. Rapport : [nft-workspace.json](results/nft-workspace.json).
