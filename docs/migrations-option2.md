# Passage aux séries fixes

Il n'existe pas de migration en place : les contrats sont sans clé d'accès, sans upgrade, sans sweep ni recovery. Les nouveaux champs Borsh rendent les WASM incompatibles avec un ancien état. Ne jamais tenter de redéployer ces binaires sur un wallet ou une collection historique.

Pour une sandbox, `npm run demo:series` crée de nouvelles instances et une nouvelle chaîne. Aucun ancien fonds n'est repris. `scripts/series-demo.ts` est la référence exécutable d'initialisation et de configuration signée ; il vérifie la suppression effective des clés d'accès du token, de la stratégie, de la collection et du wallet.

Pour un futur testnet :

1. Construire le wallet puis la collection qui embarque son WASM, avec `bash scripts/build.sh`.
2. Déployer de nouveaux comptes token/stratégie/collection identifiés comme démonstration, séparés des anciens.
3. Initialiser la collection avec `network="testnet"`, `asset`, `strategy` et `admin_key` ML-DSA-65. Conserver le secret de signature hors dépôt et hors frontend.
4. Signer l'enveloppe canonique `EVERKEEP_ADMIN_V1`, réseau et adresse exacts, nonce `"0"`, expiration inférieure à24h, action `Configure{series}`. Respecter l'ordre des champs de `AdminEnvelope` et `Series` dans les sources Rust.
5. Choisir une fenêtre et une échéance absolue courtes clairement identifiées comme démonstration. La configuration doit être reçue avant l'ouverture. Lire et contrôler l'empreinte produite.
6. Enregistrer le stockage FT nécessaire, préfinancer uniquement des demoUSD et des réserves techniques de test. Supprimer et vérifier toutes les access keys des contrats avant de les présenter comme sans clé.
7. Exécuter les cas cryptographiques positifs/négatifs/rejeu et les tests intercontrats sur ces nouvelles adresses. Consigner hashes de WASM, transactions, bloc/protocole et gas. Un status RPC seul ne valide pas ML-DSA.
8. Configurer le lecteur `VITE_COLLECTION_ID` après validation. L'interface actuelle conserve ses opérations financières testnet désactivées ; leur activation nécessite un parcours de signature et la matrice de fautes documentée.

Le script de déploiement historique ne configure pas ces séries et ne doit pas servir à annoncer l'option2 testnet. Aucun déploiement externe n'a été exécuté dans cette passe.
