# Keepers — brief pour une revue d'améliorations

## Ce qu'on te demande

Tu relis un projet de hackathon NEAR et tu proposes des **améliorations concrètes, classées par impact pour les juges**, avec pour chacune :
- l'effort estimé ;
- les fichiers concernés ;
- les risques.

Respecte les contraintes de la section 7 : certaines idées sont impossibles ou ont déjà été écartées pour une raison donnée.

## 1. Le projet en une phrase

**Keepers** : des NFT NEAR (NEP-171) qui sont de petits comptes. Chaque carte :
- **contient de l'argent** : des NEAR plus un panier de vrais tokens ;
- **gagne ses propres royalties** : 10 % de chaque revente vont *dans la carte*, pas au créateur ;
- **évolue** : son cadre passe de matte à brushed, holographic puis animated selon son solde, calculé par le contrat ;
- **ouvre un accès** : la page `/vault` est réservée aux détenteurs.

Quand la carte est vendue, son argent, son panier, son tier et l'accès passent à l'acheteur.

## 2. Contexte

- **Hackathon :** NEAR Hackathon, track 10 « NFTs That Do Something » (*assets that own money, earn royalties, hold inventory, carry access rights*).
  - Fenêtre : du 1er au 14 novembre 2026, 23:59 UTC. Il reste environ 9 jours.
  - Les juges, y compris des IA, lisent le contrat et un README de type « do X, see Y ».
- **Livrables encore à faire :** dépôt public, README en anglais, vidéo de 2 à 3 minutes (achat, solde sur la carte, retrait, royalty créditée à la revente, changement de tier, accès débloqué), post sur X.
- **Origine :** le dépôt contenait avant « Everkeep », une marketplace de positions d'épargne en NFT (paniers d'actions simulés, agents, clés post-quantiques). Keepers est un **pivot** qui garde l'idée « l'argent vit dans le NFT » et le design system, mais avec un contrat neuf et lisible. Everkeep tourne encore sur `/`.

## 3. Ce qui est en ligne (NEAR testnet)

| Élément | Adresse |
|---|---|
| Contrat actuel (v2, avec panier) | `keepers-v2.everkeep-dev-mw0weth5.testnet` |
| Contrat précédent (v1, sans panier, toujours utilisable) | `keepers-v1.everkeep-dev-mw0weth5.testnet` |
| Créateur (reçoit le prix de mint) | `everkeep-dev-mw0weth5.testnet` |
| Tokens du panier (fixés à vie) | `wrap.testnet` (wNEAR), `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` (USDC Circle testnet), `demousd-v3.everkeep-dev-mw0weth5.testnet` (demoUSD), `usdt.fakes.testnet` (USDT.e) |

Les deux contrats sont **sans clé d'accès** : leur code ne peut plus changer. Toute modification du contrat se déploie sous un nouveau nom (`keepers-v3`, environ 3,7 NEAR testnet).

Le mint, les dépôts, la revente, le retrait, le Vault et le panier ont été **testés par l'auteur dans le navigateur sur testnet**, avec le wallet Intear.

## 4. Le contrat (`contracts/keepers`, Rust, near-sdk 5.30 + near-contract-standards)

- **Standards :** NEP-171, 177, 178 et 181 via near-contract-standards. Événements NEP-297 (`nep171`, plus un standard `keepers` 2.0.0).
- **Mint :** 1 NEAR va au créateur, 0,02 NEAR sont gardés pour le stockage, le surplus est remboursé. La carte reçoit un `dna` aléatoire, qui donne ses traits visuels.
- **Fonds NEAR :**
  - `deposit` est ouvert à tous ; `withdraw` est réservé au propriétaire, avec 1 yocto.
  - Ordre checks → effects → interactions ; si le transfert échoue, le callback recrédite **la carte**.
- **Marché intégré :** `list`, `delist`, `buy(token_id, listing_id)`.
  - Royalty de 10 % (`ROYALTY_BPS = 1000`, constante) créditée à la carte ; 90 % vont au vendeur, avec un repli `pending_payouts` si le paiement échoue.
  - Le `listing_id` change à chaque remise en vente. L'achat échoue si le vendeur a retiré la carte de la vente, l'a vidée puis remise en vente.
- **Tier :** il dépend **uniquement du solde NEAR**, avec des seuils à 0,5, 2 et 10 NEAR. C'est un choix documenté : sur testnet, sans source de prix fiable, on ne peut pas classer un panier.
- **Panier (v2) :**
  - 4 emplacements créés au mint, donc aucun stockage à payer lors d'un dépôt de token.
  - Les tokens entrent par `ft_transfer_call` avec `msg = {"token_id"}`. Un token hors liste, un message invalide ou une carte inconnue sont remboursés intégralement.
  - Ils sortent par `withdraw_token`, refusé tant que la carte est en vente ; un échec recrédite la carte.
- **Vues :** `card`, `cards`, `cards_for_owner`, `listings`, `inventory`, `tokens`, `is_holder`, `config`, et `stats` (pour vérifier la solvabilité en NEAR et par token).
- **Métadonnées dynamiques :** `nft_token` renvoie un titre qui inclut le tier, une image SVG générée on-chain (`art.rs`) et l'état complet de la carte dans `extra`.
- **Écarts aux standards (documentés) :**
  - NEP-199 (payout) n'est pas implémenté : la royalty n'est garantie que sur le marché intégré, car un transfert NEAR simple ne peut pas être attribué à une carte.
  - Une vente faite hors du contrat contourne la royalty.
- **Docs :** `docs/keepers-contract.md` (v1 : design, stockage, modèle de menace avec 9 attaques) et `docs/keepers-inventory.md` (v2 : 6 attaques en plus, résultats).

## 5. Le front (`src/keepers`, React 19 + TypeScript + Vite)

- **Routes :**
  - `/keepers` : collection, mint, stats, filtres ;
  - `/keepers/:id` : la carte (solde, progression vers le tier suivant, historique cumulé, panier, actions du propriétaire ou d'un visiteur, preuve on-chain) ;
  - `/keepers/v1[/:id]` : les pages héritées du v1 ;
  - `/vault` : la page réservée aux détenteurs.
- **Wallet :** `@hot-labs/near-connect` (Intear). Actions au format natif, sans les sérialiseurs `@near-js`, qui demandent `Buffer`. Le résultat est relu par RPC `tx`. La session Intear est reconnectée avant chaque signature.
- **Panier :** une seule demande de signature, avec une transaction `ft_transfer_call` par token. Pour le wNEAR, l'enregistrement et le wrap se font dans la même transaction. Des presets (Stable, Balanced…) sont proposés.
- **Vault :** le wallet signe un message NEP-413, vérifié dans le navigateur (WebCrypto Ed25519 + clé full-access vérifiée on-chain). Puis `is_holder` est relu toutes les 10 secondes : après une vente, la page affiche « Access revoked ».
- **Visuel :**
  - design system existant : tokens, `CardFrame` avec holo et tilt, thèmes JSON `keeper-*` ;
  - personnage original : un « vault-bot » au visage en forme de trou de serrure, généré en SVG à partir du DNA. Le front en dessine une version 4:3.
- **Code :** `chain.ts` (accès chain), `KeeperPage.tsx`, `CollectionPage.tsx`, `VaultPage.tsx`, `KeeperCard.tsx`, `art.ts`, `nep413.ts`, `keepers.css`.

## 6. Tests et outils

- **Rust :** `npm run test:contracts`, avec 54 tests unitaires Keepers.
- **Sandbox :** `npm run test:keepers`, 15 contrôles sur un vrai nœud local, avec de vrais transferts NEP-141 et des soldes vérifiés au yocto près.
- **JS :** `npm test`, 69 tests, dont la vérification NEP-413.
- **Preview :** `npm run preview:keepers` lance une sandbox avec des cartes de démo, à laquelle on branche le front.
- **Déploiement :** `npm run testnet:keepers`, en simulation par défaut et réel avec `--execute`.
- **Environnement :** tout tourne sous **WSL** (`node_modules` est installé pour Linux).

## 7. Contraintes et décisions déjà prises (ne pas les rouvrir sans raison forte)

- **Contrats immuables :** une amélioration du contrat veut dire un nouveau déploiement (v3) et une migration de l'UI. Le coût est d'environ 3,7 NEAR testnet et d'une journée de travail.
- **Pas de vrais noms d'actions ni de prix simulés.** C'était le point faible de l'ancien Everkeep.
- **Pas d'art dérivé de personnages existants.** L'ancienne grenouille ressemblait à Pepe et a été retirée.
- **Le tier reste basé sur le NEAR.**
- **Wallet :** near-connect reste, il fonctionne avec Intear.
- **Le README ne s'écrit qu'à la fin**, à la demande de l'auteur.
- **Délai :** environ 9 jours. Privilégier ce qui se voit dans une démo de 2 minutes et ce qu'un juge vérifie en lisant le contrat.

## 8. Faiblesses connues (pistes)

1. **`/` ouvre encore Everkeep**, pas Keepers. Les juges arrivent sur le mauvais produit.
2. **Pas d'historique par événement :** seulement des compteurs cumulés, pas de liste « qui a détenu la carte, quand, combien ». Le brief du track cite pourtant explicitement *« a history view per NFT »*.
3. **Le Vault est vérifié côté client :** il protège la page, mais pas un contenu secret.
4. **USDC et USDT demandent un faucet** dont l'accès n'a pas été vérifié pour NEAR testnet. Le demoUSD est distribué par un script de l'auteur.
5. **L'art SVG reste simple** : 6 fonds, 8 coques, 5 visières, 6 accessoires.
6. **Pas de démo publique hébergée.** Le SPA demande une redirection de toutes les routes vers `index.html`.
7. **Le dépôt contient beaucoup d'héritage Everkeep** : ~25 fichiers CSS, 6 autres contrats, ~100 fichiers de résultats. C'est du bruit pour un juge.
8. **Pas de vrai prix pour le panier** : aucune valeur totale n'est affichée.

## 9. Ce qu'on attend de toi

- Une liste priorisée : d'abord ce qui fait gagner des points devant les juges, puis la robustesse, puis le confort.
- Pour chaque idée : pourquoi, comment (fichiers et fonctions), l'effort, et si elle **demande un nouveau contrat** (v3) ou seulement du front.
- Les **bugs ou failles** que tu repères dans `contracts/keepers/src/lib.rs` et `src/keepers/chain.ts`, avec un scénario concret.
- Ce qu'il faudrait **montrer dans la vidéo** pour coller au brief du track.
