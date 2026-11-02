# Autorisations ML-DSA-65

## Primitive réelle

`near_sdk::env::ml_dsa_verify` (SDK 5.30.0) vérifie une signature FIPS 204, contexte vide, sur le message brut. Aucun pré-hachage applicatif, aucun service de validation, aucun mock de signature. Clé publique : 1 952 octets ; signature : 3 309 octets. La primitive nécessite le protocole 87, livré dans nearcore 2.14. Testnet annonce le protocole 88 au contrôle consigné dans `results/testnet-capability.json`. Ce contrôle RPC ne constitue pas un déploiement ni une preuve d'exécution sur testnet.

La proposition NEP-645 décrit seulement la première étape des transactions natives ML-DSA : sa mention « pas de host function » ne décrit pas les ajouts ultérieurs de nearcore 2.14. Les sources d'implémentation et la version du runtime priment pour déterminer la primitive disponible.

Comparaison : une transaction native ML-DSA pourrait être utile à condition d'imposer une clé précise et un chemin direct de signature. Vérifier uniquement le propriétaire NEAR laisserait passer ses clés classiques et les appels indirects. Nous choisissons une signature applicative dans le wallet, indépendante du relais. Une bibliothèque de vérification ML-DSA compilée en WASM ajouterait du code et du coût sans nécessité sur le protocole ciblé ; pas d'algorithme cryptographique maison.

## Encodage normatif

UTF-8 du JSON compact d'un `Envelope`, ordre exact des champs Rust (voir `packages/shared/index.ts`). Le contrat désérialise, resérialise et exige l'égalité octet à octet avant vérification. Les champs inconnus, les espaces, les ordres alternatifs et les nombres non canoniques sont donc refusés. Les champs u64/u128 sont des chaînes décimales. Aucun montant en nombre flottant.

`protocol`, `version`, `network`, `verifier`, `collection`, `token_id`, `ownership_epoch`, `key_version`, `policy_version`, `nonce`, `expires_at`, `action`. L'action contient les paramètres exacts : par exemple `Withdraw: {asset, amount, beneficiary}`. Une seule action par enveloppe. Durée maximale d'une autorisation : 24 heures, vérifiée en nanosecondes contre le bloc. Taille maximale : 16 384 octets avant parsing.

Le nonce strict augmente pour chaque autorisation réussie. Un échec de réception FT après acceptation ne réactive pas le nonce. Un rejet du reçu de validation annule les écritures de ce reçu, conformément au runtime.

## Rotation

L'ancienne clé signe l'enveloppe `Rotate` contenant la nouvelle clé. La nouvelle clé signe `EVERKEEP_POP_V1\0 || envelope_bytes`. Le contrat vérifie les deux signatures, refuse une clé identique et incrémente uniquement `key_version`. Les signatures de l'ancienne génération échouent même si elles portent un nonce futur.

## Consentement du destinataire

Avant le transfert, Bob appelle lui-même `register_recipient` depuis son compte NEAR avec la nouvelle clé et sa signature du tableau JSON compact :

`["EVERKEEP_RECIPIENT_V1", network, wallet, collection, bob, ownership_epoch, expires_at, public_key_base64]`.

Le predecessor réel lie le consentement à Bob. Le vendeur ne peut pas enregistrer une clé pour l'identité de Bob. Le dépôt fixe de 0,1 NEAR de test couvre le stockage de ce consentement ; ce financement technique ne rejoint pas l'épargne. Le consentement expire en 24 heures au maximum. Le transfert exige aussi la signature actuelle d'Alice et la preuve de possession de la nouvelle clé sur l'enveloppe complète. Bob doit générer sa clé lui-même et ne pas accepter une clé privée fournie par le vendeur.

## Clés et limites

Noble post-quantum génère et signe localement ; le host NEAR fournit une implémentation indépendante de vérification. Le fixture de test ne contient que clé publique, message et signature. Les secrets de sandbox restent en mémoire. L'outil `scripts/signer.ts` chiffre le matériel local avec scrypt + AES-256-GCM, dans `.local/keys` exclu de Git. Aucun secret dans un VITE_, un log, un livrable frontend ou une transaction.

Le chiffrement local reste un prototype, pas une intégration hardware. Une compromission du signataire ou une perte de toutes les clés n'est pas résolue. Les FullAccess keys du relais n'accordent aucun droit sur le wallet. Le déployeur ne peut pas modifier le code d'un wallet sans access key. La démo ne simule aucune attaque quantique et ne prouve pas une sécurité post-quantique de bout en bout.

## Coûts

Coût documenté du host : 540 Ggas + 11 Mgas par octet de message. Ce n'est pas le coût de la transaction complète. Une rotation et un transfert demandent deux vérifications dans leur reçu ; le consentement est un reçu séparé. Les mesures réellement exécutées sont dans `results/sandbox.json` : gas du mandat, taille du message, du WASM et stockage du wallet. Ne pas confondre les tests natifs du host avec une mesure sur chaîne.
