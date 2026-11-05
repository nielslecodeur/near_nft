# Everkeep Terminal — composants composés

Étape 3 sur 4, validée après les tokens et les primitives. Référence interactive : `/design/components.html`. La source React est `src/terminal/components-preview.tsx` ; l’entrée est construite par Vite. Les pages réelles adoptent ce système à l’étape 4, documentée dans [PAGES.md](PAGES.md).

## Blocs réutilisables

| Composant | Contrat |
| --- | --- |
| `TerminalHeader` | Navigation, réseau/gas, callback wallet et recherche Cmd/Ctrl+K. La recherche reçoit ses entrées et un callback ; dialogue, combobox, flèches, Entrée, Échap et restitution du focus précédent. |
| `MarketTicker` | Prix et variations reçus par props, avec source explicite. La référence les met à jour manuellement, sans abonnement de marché. |
| `TrendingTable` | Tableau sémantique, rang/avatar/plancher/volume/variation/propriétaires/sparkline. Tri contrôlé et `aria-sort` ; défilement local sur mobile. Les valeurs indisponibles restent absentes ou affichées « — ». |
| `CollectionStats` | Barre de statistiques reçues par props, chiffres mono/tabulaires et unités distinctes. |
| `Inventory` | Recherche, catégories, disponibilité, sidebar repliable, grille/liste, densité et tri contrôlés. Chargement, erreur/reprise et absence de résultats. Filtrage/tri de données et autorité financière restent chez l’appelant. |
| `NFTCard` | Art, collection, nom, prix, dernière vente, favoris temporaires et callback d’achat. Zoom 1,04, élévation de 4 px, bordure et ombre au survol ; achat révélé aussi au focus, toujours accessible au tactile. |
| `CardFrame` | Cadre piloté par thème JSON, calques, matériau, tilt, reflet et emplacement de flux. Aucune interprétation des actifs ou droits du NFT. |
| `PriceHistory` | Courbe en aire Recharts, période contrôlée, navigation clavier, infobulle et tableau des points. Pas de calcul de valorisation ni de cours estimé. |
| `TradePanel` | Prix et callbacks achat/offre. Le composant ne prépare aucune transaction. Dans la référence, les deux actions sont des examens d’interface et les offres restent explicitement inactives dans le produit existant. |
| `TraitsGrid`, `ActivityTable` | Propriétés/fréquences et événements reçus par props. Les fréquences et événements de cette référence sont illustratifs. |

Les composants sont dans `market-components.tsx`, les petits affichages dans `market-metrics.tsx`. Les consommateurs chargent `/design/tokens.css` et `/design/components.css` dans une racine `.ek-ui`. Le CSS des primitives et du cadre est importé par leurs modules. Le CSS de composition est généré depuis `design-system/terminal/components.css`, avec les breakpoints du JSON canonique.

## Thèmes de carte

La source modifiable est [card-themes.json](card-themes.json). Un nouveau preset peut combiner les options existantes sans modifier `CardFrame` :

```json
{
  "rarity": "epic",
  "frame": "holo",
  "palette": { "accent": "brand", "surface": "s2" },
  "layers": [
    { "src": "$art", "depth": "background", "opacity": 1 },
    { "src": "/art/terminal/orbit-subject.svg", "depth": "subject", "opacity": 0.85 },
    { "src": "/art/terminal/orbit-foreground.svg", "depth": "foreground", "opacity": 0.7 }
  ],
  "liveFeed": false
}
```

`parseCardTheme(unknown)` valide les matériaux `matte/metal/holo/animated`, les niveaux visuels `standard/rare/epic/legendary`, les palettes à tokens et de un à trois calques. `$art` désigne l’image de l’item ; les autres sources sont locales sous `/art/`. Opacité finie entre 0 et 1, profondeur parmi background/subject/foreground. Les palettes CSS arbitraires et URLs distantes sont refusées. Une erreur d’édition conserve le dernier thème valide.

Ces niveaux visuels ne constituent ni une mesure réelle de rareté, ni une permission, ni un avantage financier. Le film holographique utilise une conic-gradient limitée aux neutres et à l’accent autorisé ; pas de palette arc-en-ciel extérieure à la marque.

Le champ `liveFeed` active un emplacement. Les données viennent de `quote`, avec prix d’affichage, variation, points, source, date et révision ; le cadre ne les récupère pas. Sans lecture fournie, il affiche « Flux non connecté ». Dans la référence, les boutons « Simuler une hausse/baisse » fournissent un événement explicitement synthétique. La variation choisit le contour sémantique, le prix change et le cadre pulse une fois en 240 ms ; aucune boucle automatique.

Le pointeur met à jour `--mx/--my` et les offsets uniquement sur le sous-arbre du cadre, au plus une fois par animation frame, sans état React par frame. Les calques reçoivent des déplacements distincts. Les requêtes d’animation sont annulées à la sortie et au démontage. Tilt/parallaxe désactivés au tactile et en mouvement réduit ; pas de `will-change` généralisé. Les performances sont vérifiées par structure de code et comportement Chrome, pas certifiées à 120 Hz sur un téléphone physique.

## Données et intégration future

`demo-fixtures.ts` contient des spécimens synthétiques, isolés des modules réseau/wallet. Ne jamais les utiliser pour des soldes, arguments de transaction, statistiques de marché ou valorisations. Les éventuels futurs adaptateurs doivent fournir uniquement les valeurs vérifiées et signaler les champs manquants. Les callbacks achat et offre de l’aperçu n’envoient rien. Le callback de connexion ne simule pas de compte connecté.

La rareté, les matériaux, les illustrations et le thème JSON ne doivent jamais influencer les paramètres financiers. À l’étape 4, conserver les règles des positions existantes, la distinction prix/capital, les annonces vérifiées, les confirmations et les transports de signature. Les catégories Crypto/Diversification ne deviennent pas disponibles parce que la référence montre leur art.

Les 87 tokens validés sont complétés par 19 paramètres de composition/effet : dimensions de tableau, graphe, sidebar/carte, perspective/tilt/parallaxe/foil, délai de grille, niveau de navigation et breakpoint tablette. La palette, les deux fontes, les trois rayons et les durées validées sont conservés. Les styles des icônes visent maintenant uniquement les SVG Lucide pour préserver la géométrie des graphiques.

## Assets et références

Les trois illustrations du catalogue restent les originaux crédités dans `public/art/catalogue/CREDITS.md`. Deux SVG géométriques transparents originaux ajoutent les anneaux et repères de premier plan sous `public/art/terminal` ; leurs sources sont directement modifiables. Aucun asset ni marque OpenSea, Blur, Magic Eden ou Pokémon n’est utilisé.

Technique : [événements de pointeur MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointermove_event), [transformations 3D MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style), [nettoyage des effets React](https://react.dev/reference/react/useEffect), [AreaChart Recharts et accessibilité](https://recharts.github.io/en-US/api/AreaChart/). Recharts est épinglé à la version installée dans le lockfile ; animations de courbe et d’infobulle désactivées, les changements de valeur utilisent les transitions du système.

## Vérification

| Avant, première passe | Après | Effet vérifié |
| --- | --- | --- |
| Règle SVG globale prévue pour les icônes | Sélecteur limité aux SVG Lucide, dimensions propres aux sparklines | Graphiques conservés à leur taille de lecture |
| Libellés assistifs positionnés hors de leur zone défilante | Position locale et ancrage du texte masqué | Plus de débordement de document à 390 px |
| Densité/tri serrés sur une seule rangée mobile | Deux colonnes dédiées sous la recherche et les modes | Valeurs sélectionnées lisibles |
| Libellé du bouton wallet débordant malgré son format icône | Masquage du texte suffisamment spécifique, nom accessible préservé | En-tête compact sans chevauchement |
| Achat révélé au survol dans toute vue avec pointeur fin | Révélation réservée aux vues larges ; action toujours présente en vue étroite | Usage compact indépendant de la détection de survol |
| Cmd/Ctrl+K répété réécrivait la cible de retour du focus | Cible mémorisée uniquement à la transition fermé → ouvert | Échap restaure le contrôle initial, même après plusieurs raccourcis |
| Label synthétique au-dessus du titre du panneau de prix | Disclosure placée sous le prix | Hiérarchie du titre préservée, vérité des données conservée |

Les vues longues de Chromium peuvent réinsérer les éléments fixes dans un recadrage de composant. Les captures de composants isolent donc l’en-tête et le lien d’évitement au moment de la capture uniquement ; ils restent présents dans les vues complètes et dans l’application.

`npm run build` puis `UI_BASE_URL=http://127.0.0.1:5174 node scripts/browser-terminal-components.mjs` sur une prévisualisation Vite du build. La suite capture le rendu à 1440 et 390, les états et les interactions, et vérifie l’absence d’appel externe depuis la référence. Les suites primitives et le contrôle d’Explorer complètent la vérification de compatibilité. Ces tests ne sont pas une signature Intear, une validation du marché ou un audit de sécurité des contrats.

Résultats : [46 captures et contrôles navigateur](../../docs/results/terminal-components-browser.json), [revue indépendante et passage de verdict](../../docs/results/terminal-components-review.json). La revue a été relancée après une limite de quota ; elle a demandé deux corrections (focus après raccourci répété, label au-dessus du titre). Après rebuild et recapture de la même matrice, le passage de verdict les score résolues (`ship` à leur périmètre). Les captures sont conservées dans `docs/screenshots/terminal-components`.

L’étape 3 a été validée. L’étape 4 réutilise ces composants dans les pages ([PAGES.md](PAGES.md)). `TerminalHeader` accepte désormais le wallet existant, la route active et des résultats réels ; sans ces options, la référence conserve ses libellés de spécimens. `NFTCard` accepte une présentation métier explicite (minimum de création ou prix de revente, statut et action) ; elle ne déduit aucun prix, rendement ou droit du cadre JSON. Les données synthétiques de `demo-fixtures.ts` restent réservées à la référence.
