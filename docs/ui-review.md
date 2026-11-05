# Revue UI/UX — 2 novembre 2026

## Contrôles et portée

Le contexte et les exigences sont consignés dans PRODUCT.md et docs/ui-direction.md. Affinage dans le code du produit existant, sans maquette image approuvée. Captures de l'application à 1440, 768 et 320 px ; présentation à 1440 et 320 px ; modale mobile, erreur desktop et état de solde maximal mobile dans `.impeccable/review/` (fichiers locaux ignorés par Git).

16 tests TypeScript réussis ; compilation TypeScript et build Vite réussis. Les avertissements transitifs `util` externalisé et `eval` de js-sha256 restent ceux des dépendances. Aucun script lint configuré. Rapports des parcours navigateur dans docs/results : browser.json (vraies transactions sandbox), frontend-design.json (clavier, focus, chargement), forest-ui.json (schéma et navigation), nft-workspace.json (passeport et ressources), ui-quality.json (états de transport injectés, données invalides et valeurs extrêmes).

## Mouvement

| Avant | Après | Raison |
|---|---|---|
| Rotation automatique et réaction au survol | Scène immobile initialement ; bouton Animer, glisser intentionnel et flèches | L'explication reste contrôlée par l'utilisateur |
| Bandeau défilant | Supprimé | Éviter le mouvement permanent sans information nouvelle |
| Transitions possibles sur la géométrie financière | Montants, points et barre de solde mis à jour immédiatement | La valeur affichée doit être celle reçue |
| Trajet par propriété de position | Transform pour le point de trajet | Éviter le recalcul de disposition à chaque image |
| Ouverture de modale uniforme | 220 ms transform/opacity au pointeur ; immédiate au clavier et en réduction des mouvements | Réponse rapide et accessible |

La scène est suspendue hors écran et onglet masqué. Ces contrôles ne mesurent pas les performances sur téléphone physique.

## Détecteur mécanique

Exécuté une seule fois sur les composants et feuilles de style modifiés. Trois avertissements dans design.css : deux bordures latérales de 3 px (reçu et note de signature) et une bordure supérieure de 4 px (carte du plan). Les trois déclarations sont supprimées dans la source, même si le thème les neutralisait déjà. Aucun autre avertissement retourné. Sortie brute locale : `.research/impeccable-detect.json`.

## Revue indépendante

Revue indépendante réalisée par l'agent prévu par Impeccable, sans héritage de conversation. Premier verdict **fix** ; quatre corrections appliquées dans une passe, puis nouvelles captures examinées. Verdict suivant **ship**, limité aux quatre corrections, toutes notées résolues :

1. Grands montants : magnitude précédée de ≈ à partir d'un million de demoUSD ; accès clavier/toucher au montant exact sélectionnable et copiable. Arrondi de synthèse en BigInt ; confirmations et export restent exacts.
2. Projection : garde avant toute conversion Number lorsque le solde dépasse la précision entière sûre ; état indisponible expliqué et solde exact accessible. Les autres valeurs simulées élevées sont compactées et signalées comme approximatives.
3. Icônes : système SVG commun pour vérification, activité, actualisation, fermeture et erreur ; libellés accessibles et textes de statut conservés.
4. Direction : cinq blocs THESIS, OWN-WORLD, STORY, FIRST VIEWPORT et FORM persistés ; non-applicabilité du seed expliquée pour cette amélioration d'un système existant, sans référence inventée.

Ce verdict note les quatre corrections ; il ne constitue pas une nouvelle revue exhaustive ni un audit de sécurité. Les fixtures UI ne sont pas des preuves d'exécution contractuelle. Le système visuel extrait est dans DESIGN.md et .impeccable/design.json.

## Contrastes et limites

Le contrôle de six rôles de texte a détecté les anciens libellés d'allocation trop pâles (3,18). Le token de texte secondaire leur donne désormais un contraste de 5,78. Les six rôles dépassent 4,5, minimum observé 5,02 ; résultat dans docs/results/ui-contrast.json. Les captures ont été renouvelées après cette correction. Cette mesure ciblée n'est pas une certification exhaustive.

Les montants maximaux et leur copie exacte sont vérifiés dans ui-quality.json. Limites : mobile simulé dans Chromium, pas de téléphone physique, pas de signature par wallet testnet externe, avertissements transitifs du bundle. Contrats et contrôles d'autorisation inchangés.
