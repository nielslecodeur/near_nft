> Parcours actuel : NEAR Connect 0.12.0 et NEAR CLI Connect, vérifiés dans le navigateur avec transactions signées sur testnet. Meteor déclare testnet mais son accès a été bloqué par Cloudflare pendant l’essai. Ce document conserve le parcours Wallet Selector historique ; lire [testnet.md](testnet.md).

# Connexion wallet NEAR

Le bouton « Connecter mon wallet » est disponible dans la navigation de l'accueil et de l'application. Le réseau pris en charge est **testnet**. La sandbox locale et ses personnages sont indiqués séparément ; leur adresse n'est pas présentée comme celle d'un wallet utilisateur connecté.

La connexion utilise les dépendances existantes NEAR Wallet Selector et MyNearWallet. L'ouverture du sélecteur n'exige plus de collection déployée. La demande est une connexion de compte sans `contractId`, donc aucune function-call access key n'est demandée par cette étape. Le SDK gère la session et les retours du wallet ; aucun formulaire de clé privée n'est ajouté.

La session est observée via le store du sélecteur. Son compte actif est restauré, les changements de compte et la déconnexion mettent à jour l'interface. En mode testnet, ils effacent le plan chargé, les événements et les demandes de signature préparées. L'utilisateur peut conserver une connexion testnet tout en consultant la démo locale, mais le passage aux commandes du wallet utilise explicitement le mode testnet.

## Retrouver ses NFT-comptes

Après déploiement de la collection, renseigner l'adresse publique `VITE_COLLECTION_ID` et redémarrer Vite. Sans cette valeur, la connexion reste disponible ; le panneau indique que la recherche des NFT attend la configuration. Il ne prétend pas qu'un wallet ne possède aucun NFT.

Le panneau interroge `nft_tokens_for_owner` dans cette collection, par pages de 20 à un bloc final. Il affiche uniquement les enfants immédiats de la collection appartenant au compte connecté. Les doublons et réponses malformées sont refusés. Ce n'est pas une recherche de tous les NFT de toutes les collections NEAR.

« Ouvrir le plan » relit le wallet et son NFT au même bloc final via `verified`/`verifyPair`, puis vérifie que le propriétaire correspond toujours au compte connecté. Une vente/transmission concurrente ou un changement de compte interdit l'ouverture. Les réponses de listes devenues obsolètes sont écartées.

Le NFT représente le contrôle du compte ; les fonds restent dans le compte du plan. Une connexion NEAR classique ne remplace pas les signatures ML-DSA, les preuves de possession, le consentement ou les contrôles imposés par les contrats.

## Vérifications

`npm run test:wallet` ouvre réellement le sélecteur MyNearWallet sans collection configurée. Il n'effectue aucune connexion externe ni signature. Les cas de session restaurée, découverte de NFT, changement de propriétaire, déconnexion, réponse obsolète et absence de configuration sont vérifiés avec des fixtures explicites de session/RPC. Le parseur et la vérification wallet/NFT réelle du client restent exécutés, sans acceptation cryptographique simulée.

Rapport : docs/results/wallet-ui.json. Deux tests de frontières de découverte ajoutés, soit 18 tests TypeScript. Clavier, modales, présentation, Portfolio et largeurs 320/390/768/1440 vérifiés dans les scripts navigateur complémentaires. Les anciennes règles `.sidebar` de l'application sont limitées à `.app > .sidebar` pour éviter une collision avec les options du sélecteur de wallet.

Limites : aucune collection déployée dans cette passe, aucun NFT réel découvert sur testnet, aucune authentification ou transaction avec un wallet externe validée. Pas de mainnet. Aucun changement de contrat ni d'autorité.

Référence SDK : [NEAR Wallet Selector](https://github.com/near/wallet-selector). Implémentation fondée sur les types et modules 10.1.4 installés et vérifiés localement.
