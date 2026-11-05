# Terminal Everkeep — pages réelles

L’étape 4 conserve les tokens, primitives et composants approuvés aux étapes 1–3 et les applique au point d’entrée existant `SeriesApp`. Les routes restent `#explorer`, `#positions` et `#agent` ; les liens conservent les paramètres de l’environnement courant.

## Catalogue et détails

La recherche globale Cmd/Ctrl+K indexe les modèles officiels et les annonces renvoyées par `activeCatalogueListings`. Elle ouvre la fiche correspondante et restitue le focus. Le catalogue conserve ses deux intentions : créer une position ou acheter une position existante. Recherche accent-insensible, catégories, thèmes et disponibilité filtrent les mêmes données qu’avant. Tri des montants exact par unités `bigint`, grille/liste et densité sont des choix de présentation.

Les filtres commencent ouverts sur desktop, repliés jusqu’à 960 px, et restent modifiables. La liste compacte conserve images, noms, montants et action. Les montants de création sont des minimums, les prix de revente vont au vendeur : les deux sont étiquetés. Les modèles inactifs restent consultables sans autoriser de dépôt.

Une fiche présente illustration `CardFrame`, état, provenance des données, conditions et panneau d’action. Composition distingue cible du modèle et actifs comptabilisés de la position. Activité renvoie au contrat identifié ; historique montre explicitement son indisponibilité, aucun point n’est extrapolé. Les cadres sont éditoriaux, sans rareté contractuelle ni note de risque. Les offres et métriques de marché sans source indexée ne deviennent pas des fonctionnalités financières.

## Wallet, positions et agents

`WalletConnection`, `PositionCreation`, `TestnetPositions` et `AgentMissions` conservent leurs handlers, transports et confirmations. Le terminal fournit navigation, surfaces, typographie, contrôles et adaptation mobile. Le menu wallet mobile est contenu dans le viewport avec défilement interne ; les montants exacts restent sélectionnables. Les rôles des anciens accès, les autorisations et le coffre ne changent pas.

Le récapitulatif de création présente capital, provision, enregistrement, gas et conséquence de l’autorisation avant signature. Les états financiers en attente/succès/erreur restent gérés par les composants existants ; cette passe ne prétend pas avoir signé ces états dans Intear.

## Sources et vérification

- Tokens : `tokens.json` et `card-themes.json`, sans nouvelle palette ni police.
- CSS des pages : `design-system/terminal/pages.css`, généré vers `src/terminal/pages.css` par `npm run design:tokens`. Les seuils responsives viennent des tokens ; modifier la source canonique.
- Adaptateur de présentation : `src/terminal/catalogue-presentation.ts`. Il reçoit un `CatalogueItem` validé ; les spécimens ne sont jamais importés dans les pages.
- Matrice : `node scripts/browser-terminal-pages.mjs`, Chrome à 1440/390, données RPC réelles en lecture et connecteur wallet QA qui refuse toute signature. Le test ne signe aucune opération.
- Rapports : `docs/results/terminal-pages-browser.json`, captures `docs/screenshots/terminal-pages/`. Le contrôle du build est séparé de celui du serveur de développement.

Les données demoUSD/NEAR de test n’ont pas de valeur réelle. Le bandeau utilise les annonces lues, pas un flux de cours simulé. Aucune nouvelle transaction, signature réelle, publication ou migration de contrat n’est nécessaire pour vérifier ce changement d’interface.
