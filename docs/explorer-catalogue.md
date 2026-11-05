# Explorer — catalogue visuel Orbite

La refonte du 4 novembre 2026 remplace l’introduction et le manège obligatoire par une recherche et une grille immédiatement accessibles. Le header, Orbite, les contrats et les parcours financiers sont conservés.

## Référence et structure

[OpenSea en français](https://opensea.io/fr) a réellement été ouvert dans Chrome : catégories en haut, grands visuels de collections et recherche. Ces principes inspirent la structure. Aucun texte commercial, illustration, classement, prix ou volume d’OpenSea n’est repris. Les cartes recto-verso et les compositions sont une proposition propre à Everkeep.

Explorer présente la recherche, Créer une position / Acheter une position, les catégories et les thèmes définis dans les données éditoriales. La grille accepte quatre colonnes avec davantage de résultats ; trois modèles réels occupent trois colonnes desktop, deux sur tablette, une sur petit mobile. Aucun faux produit ne remplit une colonne vide.

## Interactions

L’image et le titre ouvrent la fiche. Voir la composition change de face au clic uniquement : transition desktop de 240 ms, immédiate au clavier, en mode réduit et sur petit mobile. La face inactive est inert et aria-hidden. Le focus rejoint le bouton de retour puis revient au contrôle de composition ; les deux faces gardent le même espace sans mini-défilement ni déplacement des voisins.

Les versos distinguent la composition cible d’un modèle des actifs réellement comptabilisés dans une position, avec date de lecture. Limites, nature de l’exposition et conditions de sortie précèdent l’action. Les fiches donnent les règles, risques, coûts, permissions, contrats, provenance et liens d’activité sur l’explorateur.

Le choix et le montant survivent à la connexion et au rechargement. Aucune signature n’est déclenchée par la connexion. La création et l’achat passent par les fonctions existantes, sans modification de provision, frais, consentement ou règlement.

## Données et assets

`packages/shared/catalogue.ts` adapte les données pour l’affichage, sans autorité financière. Les champs distinguent modèle/annonce, composition cible/réelle, origine éditoriale, source financière vérifiée ou indisponible, date, démonstration et absence d’estimation. Le prix demandé reste distinct des actifs détenus ; la valorisation monétaire indicative est indisponible.

Diversification et Crypto restent à venir : aucun actif défini, aucun dépôt possible. Réserve demoUSD est opérationnelle seulement après vérification de ses règles et de sa fenêtre. Son plafond d’allocation de 20 % est une limite d’autorisation, pas une allocation cible. Les annonces doivent être actives, non expirées, financées, correspondre au vendeur et à une position SaleLocked. Aucun thème Ethereum, L2 ou entreprise n’est ajouté sans instruments disponibles.

Trois SVG originaux identifient les thèmes : cercles cuivre/lavande/ivoire pour Diversification, modules bleus pour Crypto, strates vertes et disque ivoire pour Liquidité. Sources uniformes 960×720 et recadrage mobile contrôlé, sans filtre vert global. [Crédits](../public/art/catalogue/CREDITS.md). Ces images n’attestent aucune détention ni affiliation. Space Grotesk, Inter et les couleurs Orbite restent inchangés ; le DESIGN.md historique et son décalage préexistant sont conservés.

## Vérifications

`npm run test:catalogue` vérifie les images, les filtres combinés et résultats vides, clavier/toucher, focus, face masquée, hauteur stable, réduction des animations, fiches, reprise après connexion et récapitulatifs de création/achat à 390, 768 et 1440 px. Rapport : [catalogue-browser.json](results/catalogue-browser.json). La suite [guided-ux-browser.json](results/guided-ux-browser.json) est adaptée aux nouveaux contrôles et vérifie aussi Agents et Mes positions.

Les lectures testnet sont réelles, conservées au même bloc final via Intear RPC. L’adaptateur wallet utilise une adresse publique et refuse toute signature financière. Aucune nouvelle création financée ni vente n’a été envoyée. Les fenêtres et signatures réelles Intear restent à vérifier séparément ; les preuves financières historiques ne sont pas présentées comme une validation de cette refonte.

## Résultats et captures

50 tests TypeScript et le build TypeScript/Vite réussissent. La revue indépendante retourne **ship** sur les 23 captures du catalogue, sans correction matérielle ; cette appréciation reste limitée à l’UI/UX et aux preuves fournies. [Rapport de revue](results/catalogue-review.json).

- [Catalogue desktop](screenshots/catalogue/fronts-1440.png)
- [Catalogue mobile](screenshots/catalogue/fronts-390.png)
- [Composition d’un modèle](screenshots/catalogue/composition-1440.png)

Le récapitulatif d’achat a aussi été corrigé : un prix humain de 11 demoUSD était reconverti une seconde fois pour l’affichage en 0,000011. Il affiche maintenant exactement 11 demoUSD ; les arguments transmis au paiement ne changent pas. Le test navigateur compare la valeur complète.
