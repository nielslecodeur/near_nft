# Marketplace de positions : état des lieux et périmètre

Brief appliqué le 3 novembre 2026. Ce document remplace les descriptions du catalogue « Nouveaux NFT » et du carrousel à concepts indisponibles.

## État des lieux avant modification

À conserver : wallet sans access keys, enveloppes ML-DSA-65 vérifiées par le host NEAR, nonces/générations/rotation, collection NEP-171, série immuable, dépôt initial unique, séquestre de vente, annulation clôturant les commits tardifs, créances fixes et reprise idempotente ; moteur déterministe, mandats de souscription et allocation bornée ; lecteur testnet, composant de montants exacts, confirmations et verrous UI.

Écarts : le catalogue présentait l’émission comme un NFT déjà disponible, Agent n’était plus dans la navigation principale, les annonces manquaient de provenance/valorisation/historique, certaines identités étaient seulement des concepts. Le sélecteur fiable existe mais n’est plus monté. Les informations individuelles des positions et la réclamation d’un paiement de vente doivent être rendues accessibles. Les anciens composants de planification ne sont plus montés par `src/main.tsx` ; aucune projection ne sera réintroduite.

Risques bloquant le testnet financier : fautes asynchrones pas toutes injectées en vrais WASM, aucune intégration de signataire de déploiement testnet, reprise ambiguë d’un financement non automatisée. Ces limites ne bloquent pas les contrats et parcours de démonstration sandbox ; elles interdisent de revendiquer un produit prêt pour l’argent réel. Aucun déploiement externe demandé.

## Modèle

Une **stratégie** est un mandat de règles versionné. La souscription dépose des demoUSD et crée une **position NFT** individuelle, dont le compte conserve les actifs. Une **annonce** vend à prix fixe le contrôle de cette position existante. Le prix va au vendeur ; il ne crédite pas le capital de la position. Compte, stratégie, contraintes et échéance sont conservés ; propriétaire, clé et générations changent et l’ancien agent est révoqué. Le code des contrats n’est pas vendu.

Une seule stratégie de démonstration est opérationnelle. Le sélecteur contient donc une seule carte, sans voisins fictifs, et une vue grille alternative. Les commandes de déplacement sont inactives avec une carte. Il sait afficher un catalogue plus grand lorsque de nouvelles stratégies réelles existent ; ses tests de gestes utilisent des fixtures explicitement séparées du catalogue.

## Étapes

1. Clarifier catalogue/fiche, navigation et identité héritée des positions.
2. Rendre les données individuelles, annonces et créances consultables, avec les dates effectivement disponibles.
3. Vérifier les chemins de contrôle et compléter les preuves utiles en WASM sans réinitialiser les sessions existantes.
4. Vérifier Chrome, types, build, tests et mettre à jour les rapports, le README et les limites.

Références de présentation consultées : [NEAR Hackathon](https://nearhackathon.com/) pour la hiérarchie typographique et l’interaction ; [OpenSea](https://opensea.io/) pour la séparation découverte/collection/actif/activité. Aucun contrat, marque, illustration ou volume de ces services n’est copié.

## Implémentation livrée

`StrategyMarketplace.tsx` rend catalogue, souscription et annonces. `StrategyCarousel.tsx` conserve un seul exemplaire de chaque stratégie, sans autoplay. `PositionArtwork.tsx` partage la géométrie entre stratégie et positions. `SeriesApp.tsx` conserve les confirmations, UUID, verrous et commandes existants, avec trois routes sur la même surface blanche/verte. Les anciens composants de planification ne sont pas montés.

Les positions montrent propriétaire, version, création du compte, fonds, mandat et activité de session. Les fiches de vente séparent prix, disponible/principal au gel, date de gel, observation des données et montant récupérable non garanti. Elles conservent échéance et contraintes et donnent accès aux annonces enregistrées et à l’activité indexée. Le journal API associe maintenant position et acteur lorsque disponibles ; les anciens événements manquants ne sont pas inventés.

La vue wallet `sale_valuation_at(id)` lit la date enregistrée au gel dans un espace de stockage séparé, borné par les 16 annonces maximales déjà autorisées. Aucun changement de racine Borsh, d’autorité ou d’enveloppe signée. La date reste inchangée après annulation, paiement ou transmission. Les anciens déploiements immuables sans cette vue renvoient une date absente, jamais l’heure du polling.

Les créances `sale_claim` sont exposées et réclamables dans Mes positions par leur bénéficiaire. Une créance Paying ne peut pas être relancée dans l’interface. L’API compare montant et bénéficiaire au récapitulatif ; le contrat impose le paiement fixe, réservé avant promesse. Aucun nouveau droit de redirection n’est introduit.

## Surface et mouvement

Mode Operate : consulter, comparer, créer et gérer. Le sélecteur porte l’identité ; les détails financiers restent stables sous celui-ci. Navigation pointeur : transition transform de 260 ms, cubic-bezier(.23,1,.32,1). Clavier et prefers-reduced-motion : réponse immédiate.

| Rôle | Valeur actuelle |
| --- | --- |
| Fond / surface secondaire | `#ffffff` / `#f5f5f1` |
| Texte / secondaire | `#18251f` / `#59635e` |
| Action / survol | `#174b39` / `#103c2c` |
| Séparateur | `#dedfd9` |
| Police | Public Sans locale ; IBM Plex Mono pour identifiants et données techniques |
| Contrôles / panneaux | rayons 6 px / 12 px |

`marketplace.css` et `marketplace-mvp.css` étendent l’identité existante aux trois routes. DESIGN.md et son sidecar papier/bleu restent conservés pour les surfaces historiques. Le détecteur ne signale que des différences consultatives de type/couleurs/arrondis avec cette ancienne description ; aucune erreur primaire dans les cibles modifiées. Le reviewer indépendant a ouvert les 21 captures et rendu **ship sur le frontend fourni**, sans audit exhaustif de sécurité.

## Preuves

| Vérification exécutée | Portée |
| --- | --- |
| 46 tests Rust | contrôle, comptabilité, callbacks, marché et financement ; date de gel persistante |
| 24 tests TypeScript | crypto, montants, données, agent ; date future et créance incohérente refusées |
| TypeScript / Vite | build réussi ; avertissements transitifs util/eval préexistants |
| series-demo.json, 33 contrôles | vrais WASM : dépôt 100, allocation, vente 97, ancienne autorité refusée et retrait à échéance ; deux achats concurrents, auto-achat, mauvais prédécesseur FT, création invalide et remboursement du dépôt suivant |
| sandbox.json, 41 contrôles | vrais WASM des chemins NFT historiques, hooks, refus/retours et anciennes générations |
| agent-subscription.json, 11 contrôles | vrais WASM des mandats, séquestre exact, agent désigné, révocation/remboursement et rejeu |
| mvp-flow.json | Chrome et chaîne réels, 21 captures à 390/768/1440 ; création, plafond refusé, rotation, annulation, vente et agent |
| mvp-ui.json | passe navigateur de lecture sans commande après les transactions |
| marketplace-states.json | cinq états avec réponses HTTP de test ; zéro commande de dépense |
| mvp-carousel.json | trois fixtures isolées pour cercle, glissement, clavier, grille et mobile ; aucune offre fictive dans le catalogue |

Les fixtures ne sont pas des preuves financières. La concurrence utilise deux comptes signataires distincts et deux appels FT réellement simultanés : un transfert de contrôle, un paiement vendeur et remboursement exact de l’autre acheteur. Le test de création invalide démontre le refus d’accepter le dépôt avant préparation, pas une panne arbitraire du runtime après acceptation.

## Limites et exploitation locale

L’API actuelle est 8791 ; les sources 8790/8789/8788 restent distinctes. Elles étaient arrêtées à la reprise. Leurs données sur disque n’ont été ni supprimées ni migrées ; leurs clés de démonstration éphémères ne sont pas récupérables en relançant une nouvelle chaîne. Les positions testnet ne sont pas modifiées.

Après fast-forward, `settleSandboxFinality` attend des blocs ordinaires pour disposer d’un ancrage de transaction finalisé récent. Il ne rejoue aucune transaction possiblement acceptée. La preuve a d’abord rencontré une expiration de transaction de transport, puis a passé les 33 contrôles après cet ajustement. Ubuntu a ensuite été relancé après blocage même d’une commande echo ; la validation navigateur actuelle utilise une session distincte.

Restent à valider : signataire/déploiement et opérations financières testnet, login externe, pertes d’accusés/callbacks, course achat/annulation, échéance pendant règlement, reprise automatique d’un Funding ambigu. Un timeout ne libère pas spéculativement des fonds. Aucun fonds réel ni publication externe.
