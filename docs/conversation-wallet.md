> Historique de la première intégration navigateur : les instructions de fichier obligatoire et de signatures successives ci-dessous sont remplacées par [le guide courant](agent-ux-simple.md). Coffre chiffré local et export facultatif ont été explicitement approuvés ensuite.

# Conversation, wallet et reprise

Parcours courant : Marketplace / Mes positions / Agents, direction Orbite conservée. En testnet, le sélecteur masque NEAR CLI. L’ancien parcours demandait une commande Ubuntu parce que le wallet NEAR CLI Connect était sélectionné ; la signature ML-DSA était déjà exécutée dans le navigateur. Ce sont deux signatures différentes.

## Tester sans terminal

1. Ouvrir `http://127.0.0.1:5173/#agent`, connecter **Intear** avec un compte réellement créé en `.testnet`. Aucun compte `.near` n’est converti automatiquement.
2. Consulter les soldes réels dans le header. L’accueil de Marketplace et Mes positions propose le faucet NEAR externe et la distribution demoUSD du projet. Le retour au site actualise les soldes.
3. Décrire un budget demoUSD, un horizon, une disponibilité et éventuellement une réserve minimale. Exemple : « J’ai 50 demoUSD, garder 15 disponibles, je peux attendre 30 jours jusqu’à l’échéance ». Examiner les paramètres et les coûts avant le devis.
4. Conserver la sauvegarde chiffrée avec un mot de passe dédié, puis signer le devis de **0,05 NEAR** de stockage. L’analyse est un paiement distinct : tarif lu du contrat, actuellement TradFi **0,015**, Crypto **0,02**, Liquidité **0,01 NEAR** de test, plus gas.
5. Examiner la proposition livrée, son capital, sa réserve, son échéance et ses risques. « Confirmer et continuer » enregistre l’examen sans transférer de capital.
6. « Autoriser et créer ma position » prépare une position par allocation, avec jusqu’à **sept transactions distinctes** : réservation, création du compte (**6 NEAR**), enregistrement stratégie (**0,02 NEAR**), deux consentements, dépôt demoUSD exact, réconciliation. Chaque demande apparaît dans Intear avec le libellé de l’étape sur le site. Les transactions ne sont pas atomiques.
7. Conserver la nouvelle sauvegarde avant de financer la position. Après confirmation du NFT, ouvrir Mes positions. « Mettre en vente » reste une action séparée avec prix, expiration, signature et gel vérifiés ; aucune annonce automatique.

La réserve de la proposition porte sur le budget demandé. Par exemple, TradFi peut investir 25 sur un budget de 50 et conserver 25 de ce budget ; si le compte détenait 100 au départ, son solde extérieur devient 75. Une projection ou le hash d’une transaction ne prouve pas le crédit final du NFT.

## Fermer le wallet ou recharger

Fermer Intear refuse la signature en cours ; les étapes déjà confirmées persistent sur chaîne. Utiliser **Reprendre la création de cette position**, sans créer une autre mission. Après rechargement, **Retrouver mon suivi** puis **Restaurer une sauvegarde chiffrée existante**, avec la dernière sauvegarde et son mot de passe. Une proposition expirée ne permet plus de nouvelle autorisation ; les réconciliations après dépôt restent possibles.

Le journal local contient uniquement les identifiants, paramètres et références publics. Un paiement final confirmé est relu, jamais envoyé une seconde fois pour la même opération. Un résultat inconnu sans hash reste bloqué en lecture : aucun renvoi spéculatif. Les retours wallet sont associés à l’opération connue et leurs reçus finaux sont vérifiés (signataire, contrat, méthode, arguments, dépôt, gas et échecs intercontrats). Les remboursements conservent les créances prévues par les contrats.

## Signatures et données privées

Intear signe la transaction NEAR. Les autorisations ML-DSA sont générées et signées dans le navigateur avec `@noble/post-quantum`, puis vérifiées réellement par le runtime NEAR. La clé native de l’utilisateur reste dans son wallet ; le worker ne reçoit aucune clé propriétaire.

Les nouvelles clés ML-DSA, capacités privées et documents chiffrés vivent seulement en mémoire de l’onglet. L’export AES-GCM/PBKDF2 chiffré est un fichier local à conserver hors dépôt. Après rechargement, il faut le restaurer. La compatibilité lit les anciens enregistrements IndexedDB chiffrés sans les supprimer ; aucune nouvelle écriture privée n’y est faite. Les anciens secrets ne sont pas effacés sans sauvegarde.

Le connecteur Intear crée également une clé d’authentification applicative, sans pouvoir signer seul une transaction NEAR. Son emplacement `intear-wallet:appPrivateKey` est redirigé vers la mémoire pour éviter sa persistance dans localStorage. Après rechargement, une reconnexion Intear peut être demandée, avec vérification du même compte avant toute transaction. Les préférences et adresses publiques restent persistantes.

## Opérateur et fonds de démonstration

Le worker écoute uniquement sur localhost:8793 ; Origin autorisée `http://127.0.0.1:5173`. Il analyse les données et relaie les seules opérations autorisées par les contrats. Ce service local et ses credentials opérateur distincts sont nécessaires ; ce n’est pas un service de signature arbitraire.

```bash
npm run dev
# second terminal, avec le credential opérateur hors dépôt
npm run testnet:worker
npm test
npm run build
npm run test:conversation:browser
```

Sous Windows, les lanceurs `wsl -e bash scripts/web.sh` et `wsl -e bash scripts/testnet-worker.sh` utilisent le Node WSL installé. Ces commandes sont destinées au développeur, aucune commande utilisateur n’est à copier pour signer.

`POST /faucet` distribue uniquement le demoUSD configuré, complète vers 100 demoUSD, au plus une distribution par compte et jour UTC et dix comptes par jour. Un journal durable hors dépôt interdit de rejouer un transfert inconnu. Le faucet NEAR externe a ses propres quotas ; il ne distribue pas de demoUSD.

```bash
# Inspection uniquement, sans --execute
npm run testnet:seed
# Comptes dédiés, positions réelles et annonce explicitement de démonstration
npm run testnet:seed -- --execute
# Complément de 5 NEAR via le faucet officiel, pour un compte existant
npm run testnet:topup -- votre-compte.testnet --execute
```

Le seed conserve comptes, clés et état hors dépôt, vérifie le réseau avant les transactions, relit les souscriptions et ne republie pas une annonce déjà créée. `public/testnet-demo.json` ne crée aucun NFT : il marque l’origine des positions confirmées par RPC. Rapports publics dans `docs/results/testnet-seed.json` et `testnet-browser-wallet-funding.json`.

## Limites

Sans fournisseur IA configuré, la conversation est un parseur français déterministe explicitement annoncé. Les paramètres reconnus doivent être examinés ; ce n’est pas une compréhension universelle du langage. Les trois expertises sont conservées, mais un seul modèle est exécutable : Réserve demoUSD Liquidité. Diversification et Crypto sont indisponibles ; six variantes artificielles n’ont pas été publiées. Les contrats, capacités, signatures et règles de sortie restent inchangés.

Sources officielles vérifiées : [NEAR wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login), [NEAR Connect](https://docs.near.org/tools/near-connect), [Intear Wallet](https://github.com/INTEARnear/wallet), [manifeste des intégrations](https://raw.githubusercontent.com/azbang/near-connect/main/repository/manifest.json), [faucet NEAR](https://docs.near.org/getting-started/faucet). Meteor déclare testnet et signature mais son site a bloqué ici avec Cloudflare ; ce parcours n’y est pas validé.
