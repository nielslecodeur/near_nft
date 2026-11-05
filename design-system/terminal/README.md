# Everkeep Terminal — socle visuel

**Étapes 1, 2 et 3 validées par l’utilisateur.** Le même système est appliqué aux pages réelles à l’étape 4 : [contrat d’intégration](PAGES.md). Les références restent disponibles à `/design/tokens.html`, `/design/primitives.html` et `/design/components.html`. Les contrats des composants sont décrits dans [PRIMITIVES.md](PRIMITIVES.md) et [COMPONENTS.md](COMPONENTS.md).

La source canonique est [tokens.json](tokens.json). `npm run design:tokens` produit `public/design/tokens.css`, sa copie JSON publique et les CSS des planches. `npm run build` exécute cette génération automatiquement avant TypeScript et Vite. React/Vite sont conservés ; Radix et Lucide ont été ajoutés à l’étape 2, Recharts à l’étape 3. Le socle compte 106 variables : les 74 de départ, 13 paramètres de primitives et 19 de composition/effet documentés dans les références ci-dessus.

## Tokens validés

| Rôle | Choix |
| --- | --- |
| Fond / s1 / s2 / s3 | `#07080C` / `#0D0F16` / `#141722` / `#1C2030` |
| Accent de marque | Vert Everkeep existant `#B5F36B` |
| Texte / secondaire | Ivoire `#F0F2EA` / sauge `#A6B0A8` |
| Hausse / baisse | Vert `#4FD498` / rouge `#FF7B88`, avec libellés explicites |
| UI et titres | Inter, déjà hébergé localement |
| Chiffres | IBM Plex Mono, déjà hébergé localement ; `tabular-nums lining-nums` |
| Rayons | `8 / 12 / 20 px` uniquement |
| Espacement | Échelle `4 / 8 px`, jusqu’à `80 px` |
| Mouvement | `180 / 200 / 240 ms`, `cubic-bezier(.2,.8,.2,1)` ; immédiat en mouvement réduit |

Le logo Everkeep conserve les tracés Space Grotesk à graisse 600 et approche 0,18em. Il est livré en SVG vectorisé pour conserver ses formes sans charger une troisième police dans la nouvelle référence. La police numérique proposée est IBM Plex Mono plutôt qu’une nouvelle fonte externe : elle existe dans le projet et évite un téléchargement supplémentaire. L’interface utilise donc exactement deux familles chargées.

Les bordures structurelles sont blanches à 6 % ; les surfaces surélevées ont un reflet intérieur supérieur à 5 % et une ombre douce. Le fond combine une grille très faible et un grain SVG statique. Un seul halo de marque est limité à l’introduction. Il n’y a aucune animation de fond ni effet sur chaque surface.

## Critique et correction de cette étape

| Avant | Après | Pourquoi |
| --- | --- | --- |
| Surfaces de la proposition non centralisées | 74 variables issues d’une source JSON | Préparer une intégration cohérente à l’étape 2 |
| Référence numérique en sans serif | Spécimens monospaces et chiffres tabulaires | Vérifier l’alignement des prix et pourcentages futurs |
| Valeur RGBA débordant à 390 px au premier essai | Retour à la ligne des valeurs techniques | Garder une lecture complète sans masquer le débordement |

Ces nombres sont des spécimens typographiques, pas des cours ou statistiques de marché. Les primitives de navigation, le ticker, les tableaux, les pages et les cartes spéciales ne sont pas implémentés pendant cette étape.

## Vérifications

- Build TypeScript/Vite avec génération des tokens.
- Playwright à **1440 px** et **390 px** : quatre surfaces, trois rayons, deux familles locales réellement chargées, logo servi, chiffres tabulaires, focus clavier visible et absence de débordement.
- Contrastes du texte principal, secondaire, hausse et baisse ≥ 4,5:1 sur les quatre fonds ; label de l’accent ≥ 4,5:1.
- `prefers-reduced-motion` : durées résolues à zéro.
- Revue indépendante : `ship`, limitée à la proposition de l’étape 1 ; aucune correction matérielle.

Rapport : [terminal-tokens-browser.json](../../docs/results/terminal-tokens-browser.json). Le détecteur a été exécuté une fois : 7 avis couleur/rayon face au DESIGN historique et 4 avertissements liés à Inter et à ce document antérieur. Inter est explicitement permis dans le brief et déjà présent ; ces choix sont documentés, pas supprimés par une exception silencieuse. `DESIGN.md` et son sidecar historiques ne sont pas réécrits avant validation de cette proposition.

## Sources et étapes suivantes

Les fontes restent accompagnées de leurs licences : `public/fonts/inter-OFL.txt`, `ibmplexmono-OFL.txt` et `space-grotesk-OFL.txt`. Le mot-symbole SVG et le grain sont livrés dans `public/design`. Aucun asset OpenSea, Blur ou Magic Eden n’est utilisé.

**1. Tokens validés ; 2. primitives validées ; 3. composants composés prêts à examiner ; 4. pages**, avec arrêt et captures à chaque étape. L’architecture `CardFrame` pilotée par JSON (`rarity`, `frame`, `palette`, `layers`, `liveFeed`) est fournie à l’étape 3 ; son flux de référence est explicitement simulé, sans modifier les contrats ou paiements.
