# Démonstration locale et préparation testnet

Le scénario utilise une vraie sandbox NEAR avec ML-DSA-65 vérifiée dans le WASM. Les transactions de relais utilisent des comptes de test classiques ; elles ne remplacent jamais la signature exigée par le wallet.

## Installation

Depuis la racine sous Linux x86_64 ou Ubuntu/WSL, installer Node 24, Rust/rustup et un compilateur C. Le toolchain Rust épinglé est 1.98.1. Puis :

```bash
bash scripts/setup.sh
bash scripts/build.sh
bash scripts/test-contracts.sh
npm test
npm run build
bash scripts/demo.sh
```

`setup.sh` installe les outils NEAR manquants et les dépendances verrouillées. Ne pas alterner installation Windows et lancement Linux des dépendances Node. Sous PowerShell, utiliser `wsl -e bash scripts/…`. Le build exécute cargo-near dans l’ordre wallet, token, stratégie, collection, receiver de test. La collection embarque le wallet compilé.

## Parcours à montrer

Dans un premier terminal, lancer `bash scripts/local-demo.sh`. Après les 41 vérifications, l’API/signataire de test écoute sur `127.0.0.1:8787`. Dans un second, lancer `bash scripts/web.sh`, puis ouvrir `http://127.0.0.1:5173` et « Charger le compte ».

1. Le plan préchargé appartient à Bob, après le scénario intercontrats. « Nouveau plan » crée un nouveau compte réel de sandbox appartenant à Alice.
2. Déposer 1 000 demoUSD ; confirmer « Je vise 4 % par an sur dix ans, avec au maximum 20 % par stratégie », avec un plafond par opération de 100.
3. Lancer l’agent : 100 demoUSD passent du disponible au principal. Tester le plafond : le contrat refuse réellement le dépassement.
4. Révoquer le mandat ; renouveler la clé avec double preuve. L’agent ne peut plus allouer.
5. Transmettre le plan à Bob : consentement enregistré par Bob, signature d’Alice et preuve de Bob, changement de générations et synchronisation. Le compte et ses positions restent identiques.
6. Retirer 25 demoUSD disponibles ; récupérer 25 de principal. Afficher l’historique, les soldes et la lecture de propriété vérifiée.

La sandbox automatisée vérifie aussi le rendement de 1 demoUSD depuis une réserve réellement préfinancée, son double versement refusé, les anciennes signatures, les faux appels, `nft_transfer_call` accepté/rejeté et le retrait hostile du destinataire temporaire. L’objectif annuel de 4 % n’est pas le rendement de cette réserve : elle distribue 1 % du principal par jour UTC de démonstration, au plus une fois par période.

`node scripts/browser-check.mjs` exécute les parcours UI avec les deux serveurs actifs ; il utilise Chrome installé sous Windows ou `CHROMIUM_PATH` sous Linux. Les captures sont dans `.research/screenshots`. Arrêt par Ctrl+C dans les deux terminaux ; vérifier qu’aucun processus sandbox enfant ne reste après une interruption WSL.

L’API accepte uniquement les mutations JSON depuis les Origins locaux exacts. Elle contient seulement des clés éphémères de personnages sandbox ; ne pas l’exposer sur Internet. Le serveur Vite du script écoute sur les interfaces locales pour le forwarding WSL.

## Préparation testnet

`npm run check:testnet` ne fait qu’une lecture RPC. Aucun déploiement ou transaction testnet n’a été effectué pendant cette réalisation. Préparer les noms et le financement sans signer :

```bash
npx tsx scripts/deploy-testnet.ts votre-compte.testnet
```

Le mode d’exécution explicite est la même commande avec `--execute`. Il crée trois contrats sans access key, initialisés dans le même reçu, consomme 20 NEAR de test et écrit `.env.local` sans secret. Les noms doivent être libres. Le credential du parent est lu seulement en mode exécution, depuis `~/.near-credentials/testnet/votre-compte.testnet.json` (JSON historique contenant `account_id` et `private_key`) ou le chemin `NEAR_CREDENTIAL_FILE`. Ne jamais placer une clé dans une variable `VITE_`.

L’interface utilise Wallet Selector pour le relais testnet et exige la preuve ML-DSA locale pour les opérations protégées. Le dépôt prépare le stockage du wallet dans le FT et sa position dans la stratégie. Préparer aussi le stockage FT d’un bénéficiaire avant retrait (bouton dédié). Financer la réserve de stratégie séparément par `ft_transfer_call` avec `msg: "reserve"`. Les frais techniques NEAR et cette réserve ne sont pas le capital du plan.

## Signataire ML-DSA local

Définir `EVERKEEP_PASSPHRASE` hors dépôt, au moins 16 caractères. `npm run sign -- generate alice` crée `.local/keys/alice.json` chiffré avec scrypt et AES-256-GCM, sans clé privée en sortie. Un label existant n’est pas écrasé.

L’interface exporte `everkeep-request.json`. Pour créer un plan : `npm run sign -- init alice everkeep-request.json`, puis importer la preuve. Pour une opération : vérifier les paramètres et lancer `npm run sign -- sign alice everkeep-request.json`.

Pour une rotation, générer soi-même la nouvelle clé, renseigner sa clé publique avant d’exporter l’enveloppe ; signer avec l’ancienne clé et exécuter `npm run sign -- pop nouvelle-cle everkeep-request.json` avec la nouvelle. Ajouter `new_key_proof` à l’autorisation existante sans modifier `message` ni `signature`.

Pour recevoir, Bob génère sa propre clé et se connecte avec son compte NEAR. Charger le plan, utiliser « Préparer ma réception », exporter et signer avec `npm run sign -- recipient bob everkeep-request.json`, puis confirmer l’enregistrement. Alice peut alors préparer la transmission vers la clé de Bob. Bob produit aussi la preuve `pop` sur cette enveloppe exacte. Ne jamais utiliser une clé privée fournie par le vendeur. La perte totale des clés n’est pas récupérable dans ce prototype.
