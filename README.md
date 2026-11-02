# Everkeep

Une épargne programmable et transmissible sur NEAR, avec des autorisations ML-DSA-65 et des clés renouvelables. Prototype pour le track **NFTs That Do Something**, dans le workspace indépendant `near_hack`.

Chaque plan possède un vrai compte NEAR sans access key, un contrat wallet, un titre NFT, un solde demoUSD et un mandat d’agent. **Sandbox et testnet uniquement : jetons sans valeur réelle, rendement de démonstration, prototype non audité.**

## Démarrer

Depuis ce dossier, sous Linux x86_64 ou Ubuntu/WSL, avec Node 24, Rust 1.98.1 et un compilateur C sous WSL :

```bash
bash scripts/setup.sh
bash scripts/build.sh
bash scripts/test-contracts.sh
npm test
npm run build
```

Puis, dans deux terminaux :

```bash
# Terminal A : scénario complet puis API locale
bash scripts/local-demo.sh
# Terminal B : interface
bash scripts/web.sh
```

Ouvrir [http://127.0.0.1:5173](http://127.0.0.1:5173), puis « Charger le compte ». Sous PowerShell, préfixer chaque commande Bash par `wsl -e`, par exemple `wsl -e bash scripts/local-demo.sh`. Installer et lancer les dépendances Node dans le même environnement Linux. Les tâches VS Code sont disponibles dans `.vscode/tasks.json`.

## Qui contrôle les fonds ?

Le **wallet du plan** est l’autorité. Retrait, rachat, mandat, révocation, rotation et transmission exigent la signature ML-DSA courante. Une transaction classique du propriétaire peut seulement suspendre l’agent. L’agent possède une route fixe, un plafond par opération et jour UTC, une allocation maximale, une expiration et des générations vérifiées sur chaîne.

Le NFT indexe cette autorité. Le destinataire enregistre lui-même sa clé ; la transmission exige la signature du propriétaire et une preuve de possession de la nouvelle clé. Le compte, les tokens, les positions et les compteurs persistent à la même adresse. Le transfert invalide les anciennes générations et supprime le mandat. Les opérations restent bloquées tant que la collection et le wallet ne sont pas synchronisés.

Les comptes wallet n’ont aucune access key. Le déploiement testnet préparé crée également collection, token et stratégie sans clé, avec initialisation dans le même reçu. Aucun upgrade, ajout de clé, recovery, sweep ou appel arbitraire n’est exposé. En sandbox, les clés de déploiement sont retirées avant les vérifications. Une FullAccess key résiduelle permettrait de remplacer le code : sa suppression fait partie des contrôles.

## Résultats et limites

**21 tests Rust, 6 tests TypeScript, 41 vérifications sandbox et les parcours Chromium desktop/mobile ont réussi.** Les rapports réellement exécutés et leurs limites figurent dans [les tests](docs/testing.md).

| Élément | Périmètre |
|---|---|
| Réel en sandbox | Vérification ML-DSA dans le host NEAR, dépôts/retraits FT, allocation et rachat, rotation, révocation, transfert NFT et `nft_transfer_call` accepté/rejeté, refus d’un retrait signé par le destinataire temporaire |
| NFT conditionnel | Interfaces NEP-171 avec autorisation signée dans `memo` et consentement du destinataire. Les marketplaces doivent intégrer ce protocole ; pas de compatibilité universelle annoncée. Pas d’extension approvals ni de conformité au brouillon Sharded NFT Items. |
| Simulé explicitement | Distribution de vrais jetons de test depuis une réserve préfinancée : 1 % du principal par période de démonstration. L’objectif annuel de 4 % et les projections sont distincts, hypothétiques. |
| Différé | DeFi externe, LLM, récupération après perte totale des clés, burn, upgrade, multi-actifs, cross-chain, application mobile native et sécurité post-quantique de bout en bout |
| Testnet | Capacité RPC contrôlée en lecture ; script de déploiement préparé. Aucun déploiement ni transaction testnet effectué dans cette session. |

Seul demoUSD configuré est accepté. Un `ft_transfer` direct sans callback ne crédite pas la comptabilité du plan : utiliser `ft_transfer_call`, comme l’interface. Les résultats asynchrones inconnus conservent les fonds réservés ; aucun déblocage administrateur n’est prévu.

## Documentation

- [Guide de démo et signataire](docs/demo.md), [progression et prochaines étapes](PROGRESS.md).
- [Architecture](docs/architecture.md), [menaces](docs/threat-model.md), [crypto](docs/crypto-design.md), [transfert NFT](docs/transfer-protocol.md).
- [Sources et versions](docs/references.md), [tests et mesures](docs/testing.md).

`contracts/` contient les cinq contrats Rust, `packages/` les messages et l’agent déterministe, `src/` l’interface française et `scripts/` les outils. `Cargo.lock` et `package-lock.json` verrouillent les dépendances. Les fichiers de recherche, secrets locaux et builds frontend sont exclus de Git. Aucun site n’est publié.
