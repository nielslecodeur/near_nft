# Cas adversariaux à sélectionner selon le changement

Les chemins sont relatifs à la racine du dépôt. Ajouter un test qui démontre le comportement ou une régression réelle ; ne pas écrire un test qui vérifie seulement la présence d’un garde dans le source. Les valeurs 100/200 demoUSD ou l’objectif 4 % du scénario sont des exemples de mandat, pas des limites universelles.

## Transfert et révocation

| Déclencheur | Observation attendue |
|---|---|
| Alice transmet à Bob avec consentement et double preuve | Même compte, positions et historique ; propriétaire/clé changés, générations augmentées, ancien mandat absent ; collection cohérente avant activation |
| Alice tente retrait, rotation ou ancien mandat après transfert | Refus ; tester ancien message et nouveau message signé avec l’ancienne clé pour distinguer génération et validité cryptographique |
| Le vendeur enregistre une clé au nom de Bob, ou Bob utilise mauvais wallet/epoch/clé/expiration | Refus du consentement ou du transfert ; prouver l’identité par predecessor, pas par un champ fourni |
| Transfert pendant retrait, allocation ou rachat en cours | Refus avant changement de propriétaire ; réserve et principal inchangés par ce refus |
| `nft_transfer` ou `nft_transfer_call` avec destinataire/`msg` différent de l’enveloppe | Refus malgré une signature cryptographiquement valide ; absence d’approval ou de memo signé également refusée |
| Collection non synchronisée, mauvais namespace, faux item ou bloc de lecture divergent | Aucune autorisation fondée uniquement sur l’index ; client refuse la paire ; `sync` permet seulement la convergence attendue |
| Ancien propriétaire, factory ou relais tente de contourner par clé NEAR ou méthode privilégiée | Aucun accès de contrôle du wallet ; contrôler les access keys effectives et les actions de création/déploiement |

Points d’entrée utiles : `start_transfer`, `register_recipient`, `ready`, `sync`, `on_sync`, `forward_authorized`, `sync_item`, `verifyPair`. Observer owner, epoch, key_version, policy_version, nonce, sync_seq, status, policy, pending et soldes avant/après.

## Receiver et promesses

| Déclencheur | Observation attendue |
|---|---|
| Hook accepte (`false`) | Compte gelé pendant le hook, activation uniquement après résolution valide avec index déjà confirmé |
| Hook rejette (`true`), panique ou renvoie un format invalide | Retour à l’ancien propriétaire et clé avec nouvelles générations, aucun ancien mandat restauré, gel jusqu’à l’accusé du retour |
| Receiver temporaire émet un retrait signé avec la clé/génération temporaire | Refus pendant le hook pour indisponibilité du compte, même si signature valide ; après retour, cette génération reste invalide |
| Callback rejoué, mauvaise séquence, mauvais identifiant ou appelant externe | Pas de seconde mutation, de nouveau hook ou de double crédit ; les appels non autorisés sont refusés |
| Échec de synchronisation puis reprise | Aucun déblocage prématuré ; reprise ne réinitialise ni génération ni propriété et ne planifie pas deux hooks |
| Remboursement FT partiel, retrait/rachat échoué ou resolver inconnu | Fraction consommée seule finalisée ; échec connu restitué une fois ; résultat inconnu conservé réservé, pas assimilé à un échec connu |

Points d’entrée : `call_receiver`, `nft_resolve_transfer`, `resolve_nft_transfer`, `on_nft_resolution`, `on_payment`. Utiliser `contracts/test-receiver/src/lib.rs` et les transactions réelles de `scripts/sandbox.ts` pour les hooks et tentatives hostiles ; les tests natifs du wallet couvrent aussi doubles callbacks et résultats inconnus.

## Agent et signatures

| Déclencheur | Observation attendue |
|---|---|
| Agent sous plafonds puis dépassement d’opération, de jour UTC ou d’allocation | Seule l’allocation admissible passe ; contrôler les limites dans le wallet, y compris plusieurs opérations et changement de période |
| Mauvais agent, actif ou stratégie ; politique expirée ou ancienne epoch/version | Refus on-chain ; aucun fallback en appel arbitraire |
| Révocation ou transfert puis nouvelle tentative de l’ancien agent | Refus ; retrait du propriétaire encore disponible selon les contraintes de pending/synchronisation |
| Propriétaire classique pause puis tente de réactiver/élargir sans ML-DSA | Pause permise ; extension/réactivation non permise par ce chemin |
| Mandat hostile ou texte ambigu ; parseur propose malgré état périmé | Abstention côté agent lorsque possible ; refus on-chain demeure nécessaire si le client est contourné |
| Message altéré, ordre JSON différent, rejeu inter-réseau/NFT, nonce rejoué ou expiration | Refus pour le motif attendu, sans mutation des droits ; couvrir encodage Rust/TypeScript |
| Rotation sans preuve de nouvelle clé ou avec l’ancienne clé sur une enveloppe courante | Refus ; rotation légitime garde compte et actifs, augmente key_version et invalide les anciennes signatures |

Points d’entrée : `execute`, `SetPolicy`, `agent_allocate`, `pause_agent`, `revoke_inner`, `prove_new_key`, `interpret` et `propose`.

## Qualifier la preuve

Lire les [tests du projet](../../../../docs/testing.md) pour les commandes et mesures, et les [sources épinglées](../../../../docs/references.md) si le changement dépend d’un standard ou du host ML-DSA. Pour la primitive, vérifier la version SDK/runtime réellement ciblée : ne pas déduire l’absence d’un host actuel d’une ancienne étape de NEP-645.

Associer chaque constat au chemin exécuté et à l’état final. Les 21 tests Rust, 6 TypeScript et 41 vérifications sandbox consignés au point initial sont des résultats historiques, pas un quota à préserver ni une preuve après modification. Un refus générique, timeout ou trap WASM ne démontre pas à lui seul le contrôle attendu ; vérifier le motif quand il est disponible et distinguer panne d’environnement et rejet métier. Ne pas modifier les rapports pour simuler une exécution réussie.
