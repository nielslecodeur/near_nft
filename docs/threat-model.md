# Modèle de menace

Les signatures sont vérifiées dans un vrai host NEAR. Cela ne protège ni un poste de signature compromis, ni une perte totale des clés, ni tous les composants classiques du réseau. Le prototype n’est pas audité et n’accueille aucun fonds réel.

| Menace | Protection et limite |
|---|---|
| Ancien propriétaire | Epoch et versions renouvelées, nonces, suppression du mandat et aucune access key du wallet |
| Vendeur qui conserve une clé | Bob doit générer sa propre clé et enregistrer lui-même son consentement ; le protocole ne peut pas prouver qu’une clé n’a jamais été copiée |
| Relais classique ou déployeur | Relayer ne remplace pas la preuve ML-DSA ; contrats sans clé, sans upgrade ni méthode d’ajout de clé |
| Agent compromis | Route FT/stratégie fixée, plafonds par opération/jour UTC/allocation, expiration, générations, révocation ; pause classique autorisée uniquement pour réduire les droits |
| Rejeu ou modification | Domaine réseau/wallet/collection/NFT, JSON canonique, nonce strict, expiration et paramètres exacts signés |
| Faux FT, item ou callback | Predecessor réel contrôlé, namespace immédiat et callbacks privés |
| Appels concurrents et remboursement double | Réservation avant promesse, identifiant de pending et callbacks idempotents ; résultat ambigu conservé bloqué |
| Receiver temporaire hostile | Gel maintenu pendant le hook ; retrait même valablement signé refusé ; retour avec nouvelles générations |
| Index NFT désynchronisé | Gel et accusé ; client lit wallet/collection au même bloc final et compare epoch/séquence |
| Faux rendement | Réserve de demoUSD préfinancée et transferts vérifiables ; objectif annuel et projection clairement séparés |
| Signataire local exposé | API sandbox en loopback avec Origin exact et JSON obligatoire ; seulement personnages de test. Signataire testnet hors frontend, scrypt + AES-256-GCM |

## Risques résiduels

Le FT et la stratégie sont des contrats explicitement choisis, pas un protocole DeFi indépendant. Le rejet d’un résultat inconnu privilégie la conservation comptable et peut bloquer durablement un plan. Pas de déblocage administrateur, récupération après perte totale, burn ou upgrade. Un envoi FT direct sans `ft_transfer_call` n’est pas crédité et n’a pas de mécanisme de rescue. L’agent est déterministe ; aucune inférence LLM n’est revendiquée.

Un dépôt technique NEAR couvre gas et stockage, distinct du capital demoUSD. Les consentements enregistrés occupent du stockage ; les montants fixes ont été mesurés pour ce prototype, pas pour une exploitation ouverte. Le chiffrement local n’est pas un portefeuille matériel. Les limites et alertes de dépendances figurent dans [les tests](testing.md).
