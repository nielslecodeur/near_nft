> Actualisation : 33 contrôles WASM de série/marché, dont deux achats concurrents réels avec un transfert, un paiement vendeur et remboursement du perdant. La course achat/annulation et toutes les pertes de callbacks restent à compléter. `sale_valuation_at` enregistre le timestamp du gel sans modifier les termes signés ni la racine Borsh ; les anciennes instances sans cette vue n’ont pas de date inventée. Voir [preuves et limites actuelles](marketplace-mvp.md).

# Règlement de revente — protocole et preuves de sandbox

**Statut : protocole implémenté et scénario principal validé en vrais WASM locaux.** Ce document a été écrit avant l'interface de marché ; la première preuve de règlement a précédé cette interface. Le marché interactif reste limité à la sandbox. La matrice complète d'injection de fautes et l'exécution testnet ne sont pas encore validées. Les tests historiques de transfert ne constituent pas une preuve de vente.

## Topologie minimale retenue

Réutiliser le wallet de position et la collection. La collection hébergera l'index NFT, la série et le séquestre demoUSD : aucun nouveau dépositaire administrable n'est nécessaire. La collection et chaque wallet restent sans access key, sans upgrade, recovery ou sweep. La stratégie et le token demeurent des contrats distincts.

Le wallet reste l'autorité sur le propriétaire, la clé ML-DSA, les délégations et les fonds de la position. La collection maintient l'état du marché et conserve le prix d'achat. Une preuve ML-DSA de mise en vente autorise une cession sous conditions fixes, pas un transfert arbitraire par l'administrateur.

## Termes acceptés

L'autorisation signée lie domaine réseau, contrat, position, action, nonce, expiration et générations existantes, plus identifiant de vente monotone, prix positif exact, token de paiement et expiration de l'annonce. L'empreinte des termes inclut également le propriétaire et les générations au gel, les actifs comptabilisés, l'échéance absolue et l'empreinte/version du mandat de série.

L'acheteur transmet l'identifiant et cette empreinte avec le paiement exact. Il enregistre lui-même au préalable une clé de réception dont il prouve la possession. L'enregistrement de consentement ne déplace aucun fonds et n'autorise pas le vendeur à choisir la clé de Bob.

## Machines à états

Wallet : `Active → FrozenForSale → ControlCommitted → Released`. Une branche `FrozenForSale → Aborted → Released` conserve l'ancien propriétaire. Un identifiant monotone et un reçu terminal empêchent une ancienne commande de commit/abort de toucher une vente suivante.

Collection : `Freezing → Active → Settling → AwaitingIndex → Settled`. Autres branches : `Active → Cancelled`, `Settling → Resolving → RefundClaimable` seulement après résultat d'abandon durable du wallet. Une créance de paiement possède son propre état `Claimable → Paying → Paid` ; un échec connu de transfert remet `Paying → Claimable`.

Les noms définitifs pourront suivre les types du code ; les états et garanties ne doivent pas être supprimés pour simplifier la démo.

### Mise en vente

1. Le wallet vérifie la signature courante et refuse toute opération financière, transfert ou synchronisation en vol. L'expiration doit précéder l'échéance de série.
2. Il enregistre le gel AVANT l'appel à la collection. Allocations, rachats, retraits, changement de délégation, transfert direct et nouvelle annonce sont alors refusés.
3. La collection n'active l'annonce que sur appel du wallet connu, avec un index/propriétaire/génération concordants. Le wallet est déjà effectivement gelé dans son reçu précédent.
4. Une issue incertaine laisse le wallet gelé. Une reprise consulte l'état durable ; elle ne considère pas un timeout comme preuve d'échec.

### Achat et séquestre

1. `ft_transfer_call` apporte le prix au séquestre de la collection. `ft_on_transfer` refuse le mauvais token, prix incorrect, auto-achat, annonce expirée/obsolète ou empreinte différente.
2. Avant tout appel externe, l'annonce devient indisponible (`Settling`) et enregistre l'acheteur et la dette de séquestre. Deux achats concurrents ne peuvent pas être acceptés.
3. Le hook retourne **immédiatement zéro montant inutilisé après acceptation durable**, sans retourner la promesse de transmission. Les traitements suivants sont planifiés séparément. Un échec ultérieur de synchronisation ne doit jamais provoquer un remboursement automatique du resolver NEP-141 après changement de propriétaire.
4. La collection demande au wallet de commettre le transfert sous l'identifiant fixé. Le wallet vérifie l'annonce, les échéances, le consentement et la nouvelle clé, change le propriétaire, invalide les générations/signatures et efface la délégation. Le mandat de série, le compte et son échéance restent identiques.
5. Le wallet conserve un résultat de commit durable et reste gelé. La synchronisation NFT est distincte ; un retour d'erreur ne signifie pas que le contrôle n'a pas changé.
6. La collection observe le résultat durable du wallet et son propre index concordant. Seulement alors elle inscrit la vente comme commise, crée la créance vendeur et programme la libération sûre du wallet. La libération est une finalisation idempotente, pas un droit de rembourser l'acheteur.

### Résolution et abandon clôturant les commandes tardives

Une simple lecture montrant encore le vendeur n'autorise pas un remboursement : la demande initiale de transfert peut toujours être en vol. Pour abandonner un règlement incertain, la collection doit envoyer une commande d'abandon au wallet sous le même identifiant.

- Si le commit a déjà eu lieu, le wallet répond `ControlCommitted` ; aucun remboursement acheteur n'est créé.
- Si l'abandon arrive d'abord, le wallet mémorise `Aborted` de façon durable. Une demande de commit tardive avec cet identifiant ne peut plus changer le propriétaire. Alors seulement une créance de remboursement acheteur peut être créée.
- Les callbacks d'un identifiant passé sont sans effet sur une nouvelle annonce.

Le temps peut autoriser une demande de résolution/abandon, jamais prouver à lui seul que le transfert a échoué. Les échecs de callbacks ou résultats malformés doivent rester explicitement non résolus.

### Annulation d'annonce

L'annulation est une action ML-DSA du propriétaire courant. La collection ne l'accepte que pour une annonce active sans règlement engagé. Si achat et annulation se croisent, l'ordre des reçus de la collection choisit l'unique transition ; le wallet ne se libère qu'après confirmation durable d'annulation. Un callback perdu laisse le gel en place jusqu'à reprise sûre.

### Versement et réclamation

La créance fixe définitivement bénéficiaire, token et montant. Avant un `ft_transfer`, elle devient `Paying`, avec identifiant de tentative. Un callback privé valide cette tentative et finalise une seule fois.

- Succès connu : `Paid`.
- Échec connu du transfert FT : `Claimable`, réclamable après correction de l'enregistrement de stockage du bénéficiaire.
- Callback absent ou résultat incertain : reste `Paying` ; aucun second paiement fondé sur un timeout.

Un échec de versement après transmission laisse une créance au vendeur. Il ne restaure jamais une dette remboursable à l'acheteur. Les permissions de réclamation ne permettent pas de choisir un autre bénéficiaire.

## Gel, valorisation et échéance

La valorisation est indicative : disponible + principal comptabilisé + éventuel montant réservé identifiable, à l'instant du gel ; les gains déjà reçus sont distingués, pas additionnés deux fois. La mise en vente exige l'absence de réservations en vol. Prix demandé et actifs comptabilisés sont deux valeurs différentes.

La stratégie de démo n'a pas d'oracle : son principal comptabilisé est la référence. Pendant le gel, les callbacks de nouveaux revenus sont refusés, donc remboursés à leur source selon NEP-141. Un transfert FT direct non sollicité peut augmenter le solde brut sans modifier les actifs comptabilisés. Le gel ne promet pas de figer une valeur de marché, une solvabilité externe ou une appréciation passive ; les futurs adaptateurs DeFi ne sont pas implémentés.

L'échéance absolue ne change jamais lors d'un transfert. Une annonce non engagée est périmée au plus tard à son expiration, strictement antérieure à l'échéance. Un règlement engagé qui traverse cette frontière reste verrouillé jusqu'au résultat durable : commit confirmé ou abandon clôturant les commandes tardives. Les allocations sont interdites après échéance ; les rachats et retraits exigent absence de vente en vol et solde réellement disponible. Aucun dénouement instantané n'est garanti.

## Invariants bloquants et test WASM

La preuve de faisabilité doit démontrer prix immobilisé, transmission réelle, suppression des anciens accès, paiement vendeur seulement après confirmation, refus de remboursement acheteur après commit, refus des paiements incorrects et idempotence des reprises.

Les tests complets doivent ensuite provoquer : gel incomplet, concurrence achat/annulation, mauvais token/prix/empreinte, consentement expiré, échec avant/après commit, échec de synchronisation, callback dupliqué, versement vendeur refusé puis réclamé, abandon avant commit tardif, échéance en cours de règlement et retour de `nft_transfer_call` refusé. Les transactions et signatures doivent être réelles, avec les mêmes WASM que la démonstration ; les mocks natifs seuls ne suffisent pas.

**Première preuve WASM exécutée le 2 novembre 2026 à 22:54 UTC** : neuf contrôles réussis, dont véritable transmission et refus du versement vendeur suivi d'une réclamation unique. Rapport `docs/results/settlement-feasibility.json`, commande `bash scripts/settlement-proof.sh`. Puis scénario série/souscription/verrouillage/vente/retrait à échéance exécuté avec succès à 23:01 UTC : `docs/results/series-demo.json`. Ces preuves ne remplacent pas la matrice adversariale complète ni une exécution testnet. L'interface de marché reste à intégrer après validation des cas adverses.

## Souscription et préparation technique

La création technique (`create_plan`, 6 NEAR de réserve technique) précède le dépôt demoUSD. Dans une collection configurée avec série, elle ne mint pas de NFT. Le compte doit être initialisé, enregistré auprès du FT et synchronisé avant que `prepared` devienne vrai. Une création échouée ou encore en vol ne peut donc pas accepter une souscription ; le hook de collection refuse et le resolver NEP-141 restitue le dépôt. Cela évite d'accepter du capital en attendant la création d'un compte.

Le dépôt utilise `ft_transfer_call` vers la collection, message `{"Subscribe":"position.collection"}`. Le hook réserve la capacité et conserve le paiement en séquestre, retourne immédiatement zéro, puis finance le wallet. Celui-ci n'accepte qu'un crédit initial provenant de sa collection, avant clôture et au-dessus du minimum. Il programme séparément sa synchronisation : un échec d'indexation ne rend pas le dépôt remboursable après crédit effectif. Le NFT est émis seulement après crédit.

Le callback de souscription consomme une seule fois le résultat FT : montant entier utilisé → `Funded` ; zéro confirmé → capacité libérée et créance fixe de remboursement ; résultat absent, invalide ou ambigu → `Funding`, capacité réservée, aucun remboursement spéculatif. La reprise de ce dernier cas n'est pas encore automatisée. Ne pas promettre un remboursement automatique d'une opération dont le résultat est inconnu.

Les annulations d'annonces absentes laissent une tombstone : un reçu `open_listing` retardé ne peut pas recréer une annonce après dégel. Une annonce active expirée peut être nettoyée par `expire_listing` : l'expiration était signée, le wallet clôture tout commit tardif avant libération. Aucune minuterie locale ne débloque le wallet. Le stockage de cette démonstration borne actuellement les annonces à seize par position et la capacité de série à mille dépôts minimums au plus ; aucune commission commerciale n'est prélevée.
