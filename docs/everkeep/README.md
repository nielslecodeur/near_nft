# Everkeep

**Parcours courant : paniers thématiques simulés.** AI Infrastructure, Space & Robotics et Energy Transition : découvrez les cinq entreprises, souscrivez en demoUSD et retrouvez votre position NFT individuelle. Prix fictifs déterministes, quantités fixes, valorisation informative et retrait des tokens réellement détenus après clôture de la simulation. **Simulation sur testnet — aucune action réelle détenue.** L’assistant prépare gratuitement ; les missions payantes et séries historiques restent séparées. [Calcul, sources, limites et démonstration](../thematic-baskets.md).

La collection dédiée est déployée sur testnet, sans modification des positions historiques. Souscription directe : deux validations dans Intear et coffre local chiffré, export facultatif. Pour vérifier cette tranche : `npm test`, `bash scripts/test-contracts.sh`, `npm run test:baskets`, `npm run test:baskets:browser`, `npm run build`. Les paragraphes suivants décrivent également les fonctionnalités historiques conservées.

Marketplace de positions NFT sur **NEAR testnet**. Choisir un modèle officiel, créer une position avec son compte et ses fonds, ou acheter une position proposée par un autre propriétaire. Trois agents proposent des analyses payées séparément en NEAR ; tout investissement exige une autre autorisation.

**Interface terminal :** les pages réutilisent les tokens, primitives et composants validés : recherche Cmd/Ctrl+K, filtres repliables, grille/liste, densité, cadres de cartes JSON et fiches avec provenance et conditions. [Guide des pages](../../design-system/terminal/PAGES.md). `npm run test:terminal:pages` vérifie cette interface sur le serveur de développement ; le scénario du catalogue précédent reste archivé sous `test:catalogue:legacy`.

**Positions et agents :** Positions propose une vue Actifs avec les soldes du wallet et les fonds des comptes NFT séparés, ainsi qu’une Collection des cartes réellement possédées. Agents expose trois expertises et leurs tarifs, puis la préparation de demande et son récapitulatif. [Guide des vues](../../design-system/terminal/WORKSPACES.md) · vérification navigateur : `npm run test:workspaces`.

**Agents : deux validations financières**, une pour devis et analyse, une pour la création groupée dans Intear. Coffre local chiffré avec export facultatif, proposition compacte et suivi technique replié. Une vraie position de 14 demoUSD a été créée avec deux appels au signataire QA, sans téléchargement ; la vérification des deux fenêtres réelles d’Intear reste à effectuer. La position utilisateur `nifelst.testnet` de 25 demoUSD est confirmée sur chaîne. Voir [le parcours et les preuves](../agent-ux-simple.md).

## Lancer

Node 24 ; utiliser le même environnement pour installer et exécuter.

```bash
npm ci
npm run dev
# Second terminal, credential opérateur hors dépôt :
npm run testnet:worker
```

Sur ce poste Windows/WSL : `wsl -e bash scripts/web.sh` et `wsl -e bash scripts/testnet-worker.sh`. Ouvrir [Everkeep](http://127.0.0.1:5173), choisir **Intear**, réseau **testnet**. [Guide courant](../agent-ux-simple.md), [contrats et preuves historiques](../testnet.md).

## Utiliser

- **Marketplace** : Actions thématiques (les trois paniers simulés), Crypto (modèle historique indisponible) et Liquidité (réserve historique à échéance). Créer sa position et acheter une position existante sont deux parcours distincts. Un modèle ne représente pas un NFT déjà émis.
- **Mes positions** : NFT réels, fonds détenus, engagés et réservés, échéance, permissions et activité. La création n’est pas une publication : il faut mettre sa position en vente.
- **Agents** : préparation thématique gratuite selon l’angle Diversification, Analyse thématique ou Liquidité, puis souscription autorisée par l’utilisateur. Les analyses historiques payantes (TradFi, Crypto, Liquidité) restent accessibles dans une section repliable, avec devis et paiement NEAR distincts du capital. Mode déterministe, sans IA par défaut.

Le header lit séparément les NEAR et demoUSD du wallet. Les réserves de stockage et de gas sont détaillées, sans total converti artificiellement.

## Vérifier

```bash
npm test
npm run build
npm run test:conversation:browser
npm run test:agents:ux
npm run testnet:check -- everkeep-niels-mw0wq5r0.testnet
node scripts/browser-testnet-check.mjs
```

Le contrôle navigateur accepte `EVERKEEP_BROWSER_PROFILE` pour tester une session connectée et `EVERKEEP_CHROME` pour choisir Chrome. Les vérifications financières testnet sont consignées séparément dans [docs/results](../results).

Contrats : [architecture](../architecture.md), [menaces](../threat-model.md), [cryptographie](../crypto-design.md), [tests intercontrats](../testing.md), [missions](../agent-missions.md). Contrats inchangés pendant cette tranche frontend/testnet : les résultats antérieurs de 58 tests Rust et 19 scénarios WASM missions restent des preuves sandbox datées, distinctes des nouveaux essais réseau.

## Démonstration locale

`npm run demo:agents` démarre une nouvelle sandbox avec personnages et API 8792. Ouvrir `http://127.0.0.1:5173/?mode=local`. Les sessions historiques sont séparées dans Options ; un redémarrage ne restaure pas leurs clés éphémères. Aucun fallback local silencieux en mode testnet.

## Identité et limites

[Orbite](../orbite-direction.md) : fond noir vert, accent vert, Space Grotesk/Inter, manège manuel avec clavier, tactile et alternative grille. `src/orbite.css` reste présente et importée ; les nouvelles surfaces prolongent cette direction.

demoUSD et NEAR testnet n’ont aucune valeur monétaire. Aucun mainnet, actions/ETF réels, rendement de marché garanti, dépôt multi-actifs actif ou sécurité post-quantique de bout en bout. Les positions conservent leurs échéances immuables. Le paiement d’une analyse ne donne pas de droit de retrait ou de revente à l’agent.

Clés natives et sauvegardes ML-DSA hors dépôt ; ne jamais envoyer une seed dans l’application ou la conversation. Le prototype n’est pas audité. L’achat de position entre deux utilisateurs reste le prochain parcours navigateur testnet à vérifier ; gel, séquestre et révocation disposent de preuves sandbox.
