# Option 2 — état réel

Le brief utilisateur du 2 novembre 2026 remplace le produit précédent d’épargne libre avec objectif et projections. L’implémentation réutilise le wallet, le host ML-DSA, les nonces/générations, le consentement de réception, la collection NFT, demoUSD, la stratégie de démonstration et l’agent déterministe. Pas de reconstruction des contrats depuis zéro.

## Implémenté

- Série unique : dates absolues, asset/stratégie fixes, capacité, minimum, limites agent, version et empreinte. Configuration initiale puis fermeture seulement par véritable signature ML-DSA administrative.
- Préparation technique sans mint, dépôt initial unique via collection, réservation de capacité avant promesse, crédit exact et mint après réception. Fonds bloqués jusqu’à échéance ; dénouement puis retrait par le propriétaire courant.
- Mandat de série immuable conservé par transfert ; délégation du propriétaire facultative, plus étroite et révoquée à la transmission. Aucune allocation nouvelle après maturité.
- Vente locale à prix fixe avec gel préalable, termes signés, séquestre, commit de contrôle, accusé NFT, paiement/créance fixe, annulation et expiration clôturant les commits tardifs. Résultat inconnu conservé verrouillé. Le prix n’est jamais ajouté au capital de position.
- Trois écrans réels : Séries, Mes positions, Marché. Mandats, allocations, refus du contrat et journal de session visibles ; wallet testnet conservé en connexion/lecture. Anciennes projections et catalogue retirés du rendu ; ressources conservées dans la documentation.
- Commandes API locales idempotentes, validations des montants/dates avant rendu, confirmations financières avec montant/destinataire et vérification de leur stabilité avant signature.

## Vérifications exécutées

Audit initial :21 tests natifs,41 contrôles de référence en véritables WASM. Suite étendue :40 tests Rust et20 TypeScript. Build officiel des cinq WASM et build Vite ; Clippy exécutable avec avertissements (aucune certification de sécurité). Le scénario historique41 contrôles passe encore après modification.

`scripts/settlement-proof.sh` prouve réellement le paiement en séquestre, la transmission et l’échec/reprise de paiement vendeur. `scripts/series-demo.sh` couvre souscription100, mandat, allocation/refus, vente97, ancienne clé/agent révoqués, même maturité et retrait100 après fast-forward. Les rapports JSON datés détaillent chaque assertion réellement exécutée.

Le parcours navigateur utilise Chrome et les vrais contrats locaux, quatre largeurs et trois routes. La revue indépendante a imposé des corrections d’idempotence après réponse perdue, de validation avant rendu et d’accessibilité. Son verdict final est ship au scope de ces correctifs UI, pas un audit exhaustif des contrats.

## Limites et étapes restantes

Voir docs/option2-validation.md : matrice d’injection de fautes non exhaustive, certaines courses seulement testées nativement, reprise automatique de Funding ambigu non fournie, testnet non exécuté faute de signataire configuré. Les opérations financières testnet sont désactivées ; ne pas annoncer leur validation.

Le format Borsh a changé. Nouvelle collection et nouveaux wallets obligatoires ; aucune migration administrative des fonds, access key, upgrade ou récupération ajoutés. Les anciennes instances sans série conservent leur comportement historique et ne deviennent pas implicitement des positions à échéance. Voir docs/migrations-option2.md.
