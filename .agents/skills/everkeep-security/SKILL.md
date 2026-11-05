---
name: everkeep-security
description: "Implémenter ou revoir la sécurité des NFT-comptes NEAR d’Everkeep : transfert et retour, révocation des anciens accès, signatures et permissions des agents. À utiliser pour ces chemins de contrôle, pas pour une retouche visuelle ou une revue générale sans lien avec eux."
---

# Everkeep Security

Préserver la transmission du contrôle du plan sans accès résiduel du vendeur ni droits supplémentaires pour l’agent. Ce skill guide l’implémentation et la revue ; il ne constitue pas un audit et n’autorise ni déploiement ni publication supplémentaires.

## S’orienter dans ce projet

Résoudre les chemins ci-dessous depuis la racine du dépôt, trois niveaux au-dessus de ce dossier. Lire les instructions AGENTS.md applicables. Pour une revue, inspecter le diff et ses appelants sans modifier le code sauf demande ; pour une implémentation, corriger dans le périmètre demandé et vérifier le comportement.

- Lire [l’architecture](../../../docs/architecture.md) et le [modèle de menace](../../../docs/threat-model.md) pour établir l’autorité et les risques du changement.
- Transfert/receiver/synchronisation : [protocole](../../../docs/transfer-protocol.md), `contracts/wallet/src/lib.rs`, `contracts/collection/src/lib.rs` et `contracts/test-receiver/src/lib.rs`.
- Signature/rotation/consentement : [crypto](../../../docs/crypto-design.md), `packages/shared/index.ts` et `scripts/signer.ts`.
- Agent/mandat/allocation : `agent_allocate`, `pause_agent`, `revoke_inner`, `SetPolicy` dans le wallet ; `packages/agent/index.ts` et la stratégie si sa route change.
- Client : `verifyPair` dans le package partagé et `verified` dans `src/client.ts` ; ne pas confondre affichage et autorisation.

Les [références épinglées](../../../docs/references.md) identifient les sources étudiées : compétence NEAR, House of Stake, Sharded NFT Items, NEPs et SDK/runtime. Consulter la source pertinente lorsqu’une API ou une exigence de standard est en question ; ne pas supposer que les copies `.research/` existent après clone. Si code et documents divergent, signaler la divergence avant de conclure ; une implémentation observée n’est pas à elle seule une preuve de sécurité.

## Invariants de contrôle

**Autorité.** Le wallet porte propriétaire, clé ML-DSA et générations ; la collection est un index. Un compte nommé doit être un enfant immédiat de la collection configurée et un item connu. Vérifier l’identité réelle du predecessor à chaque frontière. Un parent, un relais ou le détenteur NFT classique ne doit pas obtenir de chemin de retrait, d’upgrade, d’ajout de clé ou d’appel arbitraire. Vérifier l’absence effective d’access keys, pas seulement l’absence de méthodes d’administration. L’exception actuelle est `pause_agent`, accessible au propriétaire NEAR pour réduire les droits uniquement.

**Autorisation.** Les actions protégées passent par la vérification ML-DSA réelle du wallet. Préserver le JSON canonique, les domaines réseau/wallet/collection/token, les versions, nonce, expiration et paramètres exacts. Comparer l’encodage Rust/TypeScript. Une rotation exige signature de l’ancienne clé et preuve de possession de la nouvelle sur `EVERKEEP_POP_V1` suivi d’un octet NUL puis des octets de l’enveloppe. La rotation incrémente `key_version` ; elle ne révoque pas automatiquement un mandat dans l’implémentation actuelle.

**Consentement.** Le destinataire génère sa propre clé et enregistre lui-même un consentement signé, lié à son compte NEAR, au wallet, à la collection, à l’epoch et à une expiration. Vérifier correspondance de clé, preuve de possession sur l’enveloppe complète et consommation du consentement. Le vendeur ne peut pas enregistrer une clé au nom de Bob ; aucune preuve logicielle ne garantit qu’un secret n’a jamais été copié.

**Transfert et retour.** Refuser le transfert si une opération financière est pendante. Le transfert conserve adresse, actifs, positions et compteurs, renouvelle propriétaire/clé, incrémente epoch et versions clé/politique, supprime le mandat et gèle le wallet jusqu’à l’accusé de collection. Pour `nft_transfer_call`, maintenir ce gel pendant le hook, même face à un retrait valablement signé par la clé temporaire. Le booléen du hook `false` accepte, `true` demande le retour ; hook échoué ou malformé demande aussi le retour. Ne pas confondre ce booléen avec le résultat final du transfert, `true` si conservé.

En cas de retour, restaurer propriétaire et clé précédents avec de nouvelles générations, sans restaurer l’ancien mandat ; attendre l’accusé du retour avant réactivation. Ne jamais réutiliser l’epoch temporaire. Une reprise `sync` ne change pas l’autorité et ne rejoue pas le hook. Les résolutions contrôlent l’appelant, la séquence et l’état attendu ; les callbacks privés ne doivent pas devenir des entrées publiques.

**Asynchronisme et fonds.** Réserver les montants avant l’appel externe ; finaliser une seule fois, avec identifiant d’opération et génération attendus. Un échec connu et un résultat inconnu ne sont pas équivalents : ne pas restituer spéculativement une réserve ni lever le gel lorsque le résultat est inconnu. Conserver l’invariant `available + reserved + principal = deposits + realized_gains − withdrawals`. Ne pas proposer un déblocage administrateur pour masquer un problème de callback.

**Permissions agent.** La décision finale appartient au contrat : agent réel, actif et stratégie autorisés, epoch et version du mandat, expiration, plafond par opération/jour UTC et allocation maximale. Préserver la consommation du budget avant promesse et examiner les interactions avec les échecs/remboursements. `Revoke` supprime la politique, pause l’agent et incrémente `policy_version` ; un transfert fait de même. Une pause classique ne doit ni élargir ni réactiver un mandat. Les propositions du parseur français ne doivent jamais servir d’autorisation ni lui donner une clé propriétaire.

## Compatibilité et preuves

Les méthodes NFT de collection exigent actuellement 1 yoctoNEAR, le propriétaire courant, un `memo` contenant l’autorisation signée et une correspondance exacte destinataire/`msg`. Pas d’approvals délégués ni de compatibilité universelle marketplace. NEP-171 est final ; Sharded NFT Items est un brouillon non implémenté ici. Ne pas importer les mécanismes House of Stake de location, reclaim, sweep ou recovery dans une épargne durable.

Choisir les cas pertinents dans [la matrice adversariale](references/adversarial-cases.md). Pour un changement de contrat, utiliser les tests natifs puis le build officiel et la sandbox pour les chemins intercontrats modifiés :

```bash
bash scripts/test-contracts.sh
bash scripts/build.sh
bash scripts/demo.sh
```

Le build compile le wallet avant la collection qui l’embarque, via cargo-near avec `--cfg near`. Pour types/agent/client : `npm test` et `npm run build` ; si le parcours UI change, suivre [les vérifications navigateur](../../../docs/testing.md). Sous PowerShell utiliser WSL et conserver le même environnement Node pour installation/exécution. Ne pas remplacer la crypto ou le resolver par un mock qui accepte tout.

Une revue seule ne nécessite pas de relancer toute la démo si l’inspection suffit à établir un défaut. Citer fichier/ligne, déclencheur, invariant violé, impact et correction proposée ; séparer défaut démontré et risque non vérifié. Pour une implémentation, rapporter les tests réellement exécutés, motifs précis des refus, état final et limites restantes. Un ancien rapport sandbox ou une lecture RPC testnet n’est pas une validation du code modifié sur testnet. Ne pas annoncer audit, rendement garanti, récupération totale des clés ou sécurité post-quantique de bout en bout.
