# Transmission du plan et compatibilité NFT

## Préparation

Bob génère lui-même une nouvelle clé ML-DSA et appelle `register_recipient` depuis son compte NEAR. Son consentement signé lie réseau, wallet, collection, identité, epoch, expiration et clé publique. Le stockage exige 0,1 NEAR de test. Alice ne peut pas associer sa propre clé au nom de Bob.

Alice signe l’enveloppe `Transfer` ou `TransferCall`. Bob signe une preuve de possession `EVERKEEP_POP_V1\0 || envelope_bytes`. Le wallet vérifie les deux signatures et le consentement encore valide, qu’il consomme. Aucun transfert ne commence avec une opération financière pendante.

## Transfert simple

1. Changer propriétaire et clé ; incrémenter epoch, versions de clé et de mandat ; supprimer la politique.
2. Geler le wallet et publier la nouvelle séquence à la collection.
3. La collection accepte uniquement un appel du wallet connu, avec une séquence monotone, et émet l’événement NFT.
4. L’accusé privé réactive le wallet. Un échec de synchronisation conserve le gel ; `sync` permet une nouvelle tentative.

L’adresse et les actifs demeurent identiques. Les signatures du vendeur et son ancien agent échouent. La collection n’accorde jamais de droit financier par elle-même.

## `nft_transfer_call`

Après publication du propriétaire temporaire, le wallet reste en `TransferPending`. La collection appelle le receiver via `nft_on_transfer`, une seule fois pour cette séquence. Même une signature valide de la clé temporaire ne permet aucun retrait pendant ce gel.

Le resolver privé applique la convention NFT : `false` accepte la réception, `true` demande le retour. Un hook en échec ou une réponse malformée demande le retour. Acceptation : lever le gel lorsque l’index déjà synchronisé correspond. Rejet : restaurer propriétaire et clé précédents, incrémenter encore les générations, supprimer tout mandat, synchroniser le retour puis réactiver. Les signatures de la génération temporaire restent invalides après retour. Le résultat de résolution est `true` pour une transmission conservée et `false` pour un retour.

Les callbacks doublés ou périmés sont ignorés. Si le résultat d’un callback indispensable est inconnu, le gel est conservé ; aucune clé administrateur ne peut le contourner. Le compte NEAR classique du propriétaire ne permet pas davantage de retirer.

## Interfaces et contraintes

`nft_transfer` et `nft_transfer_call` existent avec leurs paramètres standards et le dépôt de 1 yoctoNEAR. `memo` doit contenir le JSON d’autorisation `{message, signature, new_key_proof}` ; l’action signée doit correspondre exactement au destinataire et, pour le call, à `msg`. Le caller doit être le propriétaire NFT courant. Les approvals délégués ne sont pas implémentés. Limites : memo de 32 Kio, message receiver de 1 024 octets ; prévoir jusqu’à 300 Tgas à l’entrée du parcours avec hook.

Les vues NFT, métadonnées et énumération sont présentes, avec événements NEP-297. Une marketplace doit intégrer le consentement et les signatures supplémentaires : aucune interopérabilité immédiate avec les marketplaces ordinaires n’est annoncée. Aucun `nft_item_info` ni conformité au brouillon Sharded NFT Items n’est revendiqué. Les mécanismes House of Stake de lease, reclaim, sweep et recovery ne sont pas repris.

## Preuves exécutées

Le [rapport sandbox](results/sandbox.json) couvre le transfert signé, les deux méthodes NFT de collection, le hook accepté, le hook rejeté avec restitution, une tentative réellement signée de retrait du receiver temporaire et son refus `SYNC_REQUIRED`, puis le refus `STALE_GENERATION` après retour. Les doubles callbacks sont également testés nativement. Ces preuves concernent la sandbox ; aucune transaction testnet n’a été envoyée.
