> Parcours courant (4 novembre 2026) : [Agents, deux validations financières](agent-ux-simple.md). Avec l’accord explicite de l’utilisateur, les clés ML-DSA et capacités sont désormais conservées uniquement sous forme chiffrée dans un coffre IndexedDB local ; le mot de passe et les clés déchiffrées restent en mémoire. Export externe facultatif. Devis/paiement combinés puis création groupée dans Intear ; résultats finaux vérifiés et inconnus non rejoués. Les passages historiques ci-dessous décrivent les étapes antérieures. Contrats inchangés dans cette tranche.

> Signataire testnet du 4 novembre 2026 : ML-DSA-65 réel dans le navigateur, enveloppes canoniques inchangées, clés AES-GCM dans IndexedDB avec PBKDF2-SHA256 à 310 000 itérations et sauvegarde chiffrée avant financement. La connexion classique reste distincte. Le module packages/shared/mission-authority.ts partage la même enveloppe navigateur/service. Voir [testnet.md](testnet.md).

## Souscription autorisée par agent

`AuthorizeSubscription{agent,asset,strategy,amount,expires_at,beneficiary}` et `CancelSubscription` utilisent l’enveloppe canonique existante et la vérification host ML-DSA réelle. L’autorisation incrémente policy_version et est liée à la génération courante. Le wallet préparé reste bloqué pour les autres opérations sensibles jusqu’au crédit ou à l’annulation confirmée. La collection n’accepte la copie du mandat que depuis ce wallet connu, puis vérifie le predecessor réel de l’agent lors de son exécution.

La preuve WASM est dans `agent-subscription.json`. Elle ne prouve pas un login externe ou une exécution testnet. La rotation dans le menu Sécurité utilise les deux signatures déjà exigées, ancienne clé et preuve de possession de la nouvelle ; elle ne révoque pas automatiquement les délégations existantes.

## Extensions séries et annonces

`List` et `CancelListing` sont des actions de l’enveloppe ML-DSA existante. La première lie séquence, prix, token, expiration et hash de valorisation. Le hash lie réseau, wallet, collection, propriétaire, générations, actif, montants comptabilisés et termes/empreinte immuables de série. Un acheteur enregistre lui-même son consentement ML-DSA ; `commit_sale` consomme cette clé et révoque le mandat de propriétaire. Aucun nouveau droit de cession n’est donné à une clé classique d’administrateur.

La collection possède une enveloppe administrative canonique distincte : `protocol=EVERKEEP_ADMIN_V1`, `network`, `verifier`, `nonce`, `expires_at`, `action`. Seules `Configure{series}` avant ouverture/sans position et `Close{mandate_hash}` existent. Vérification `env::ml_dsa_verify`, clé1952octets, signature3309octets ; nonce strict et expiration de24h au plus. La clé admin est fixée à l’initialisation par le déployeur, puis les access keys sont supprimées dans les preuves WASM.

La primitive s’exécute dans le host du runtime NEAR, pas dans un service serveur et pas dans une implémentation ML-DSA maison compilée en WASM. Le transport des transactions reste classique : aucune protection postquantique de bout en bout n’est revendiquée.

Les rapports settlement-feasibility.json et series-demo.json contiennent le gas total transactions+reçus mesuré en sandbox : délégation environ4Tgas, annonce environ7Tgas, achat environ25Tgas sur les premières exécutions. Cela inclut logique et appels externes ; ce n’est pas un benchmark isolé de la primitive, ni une mesure testnet. Les replays admin, mauvaises clés admin/annonce, anciennes générations et ancienne clé propriétaire sont réellement refusés dans le scénario série.

L’exécution cryptographique testnet reste à faire après configuration d’un compte de déploiement. Une interrogation RPC de version de protocole n’est pas une preuve de signature exécutée.

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
