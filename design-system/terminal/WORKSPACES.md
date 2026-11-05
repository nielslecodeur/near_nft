# Positions, collection et agents

Extension du terminal approuvé, avec les mêmes 106 variables, Inter, IBM Plex Mono et cadres JSON. Les documents de système `DESIGN.md` et `.impeccable/design.json` restent inchangés : cette passe ajoute des vues opérationnelles sans changer la direction visuelle.

## Positions

`#positions` propose deux onglets accessibles au clavier, Actifs et Collection. Le choix de vue est public ; changer de vue ferme le panneau de gestion courant.

Actifs sépare les soldes NEAR/demoUSD du wallet et les actifs des comptes NFT. Il n’existe aucun total en dollars ou prix de marché supposé. L’aperçu NEAR tronqué à quatre décimales porte le signe ≈ lorsque nécessaire ; le détail expose le montant exact à 24 décimales. Les montants de confirmation restent exacts.

Recevoir affiche uniquement l’adresse publique du compte et le contexte NEAR testnet. Les boutons de copie et d’explorateur utilisent cette adresse. Il n’y a pas de nouvelle fonction d’envoi de jetons ou de swap dans cette passe.

Les positions financées du propriétaire sont regroupées par contrat de jeton avec des sommes bigint. Un actif historique différent ne reçoit ni les décimales demoUSD ni une conversion de prix. Le montant retirable vient des règles existantes : échéance, gel, annonce, fonds engagés, réserves et opérations en attente. Le tableau desktop devient des lignes libellé/valeur sur mobile.

## Collection

La vue Collection présente les cartes de positions financées dont le wallet connecté est propriétaire. Des NFT distincts d’un même modèle restent des cartes distinctes. La vue n’invente aucune carte à débloquer, rareté contractuelle ou progression de collection.

Recherche par nom/compte/collection, insensible aux accents, et filtres Toutes, Retrait possible, En vente. Les cartes présentent illustration orbitale, état actuel, identifiant, actifs et échéance. Consulter une carte ouvre le panneau existant de retrait, permissions et vente ; le focus rejoint ce panneau, y compris lorsqu’on inspecte à nouveau la même carte.

Les modèles inconnus sont nommés historiques et leurs quantités restent en unités brutes. Les cadres métalliques sont un traitement éditorial issu de `card-themes.json`.

## Agents

`#agent` présente les trois expertises du catalogue, leurs tarifs NEAR réels et leur sélection. Le panneau latéral desktop devient trois choix compacts sur mobile. La préparation de demande, la méthode et le mode déterministe ou serveur restent lisibles dans l’espace de travail.

Les handlers d’analyse, le devis, le coffre, les confirmations et le transport de signature sont conservés. Choisir un agent ne donne aucun droit de gestion. Le récapitulatif distingue budget, réserve souhaitée, analyse, stockage et gas, puis demande une confirmation avant le parcours de signature existant. La démonstration déterministe ne se présente pas comme une IA autonome.

## Sources et contrôles

- `src/terminal/PositionsWallet.tsx` : soldes, onglets et collection.
- `src/terminal/owned-positions.ts` : propriété, agrégats exacts et présentation des états.
- `src/TestnetPositions.tsx` : gestion financière existante, intégrée aux deux vues.
- `src/AgentConversation.tsx` : expertises et espace de demande.
- `design-system/terminal/workspace.css` : CSS canonique, généré vers `src/terminal/workspace.css`.
- `npm run test:workspaces` : navigateur sur le serveur de développement, 1440/390, RPC réels en lecture et adaptateur wallet QA refusant toute signature. Scénario séparé de lecture lente, erreur HTTP503 et reprise des soldes.
- `npm test` sous l’environnement WSL du projet : 53 tests, dont propriété/financement, séparation des actifs, sommes u128 exactes et retraits verrouillés.

Rapports : `docs/results/workspaces-browser.json` et `workspaces-build-smoke.json`. Les captures sont dans `docs/screenshots/workspaces`. Ces contrôles ne sont ni une signature réelle dans Intear, ni une validation des contrats, ni une mesure sur téléphone physique.
