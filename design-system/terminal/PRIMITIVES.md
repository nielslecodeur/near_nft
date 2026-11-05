# Everkeep Terminal — primitives UI

Étape 2 sur 4. Les tokens de l’étape 1 ont été validés par l’utilisateur. Cette étape fournit les briques réutilisables et leur référence interactive à `/design/primitives.html`. Elle précède les composants composés et les pages métier.

## Utilisation

```tsx
import { Button, Input, NumberText, Surface } from "../../terminal/primitives";

// Charger /design/tokens.css à l’entrée du futur terminal.
// Placer les consommateurs dans une racine .ek-ui.
<div className="ek-ui">
  <Surface level="s2">
    <Input label="Rechercher une position" type="search" />
    <NumberText>1 234,56</NumberText>
    <Button variant="primary" onClick={onContinue}>Continuer</Button>
  </Surface>
</div>
```

La bibliothèque est dans `src/terminal/primitives.tsx` et son CSS dans `primitives.css`. Tous les styles de composant sont préfixés `ek-`. Les styles de démonstration proviennent de `design-system/terminal/primitives-preview.css` et sont générés dans `public/design` avec les tokens. Les valeurs numériques des API Radix (délai d’infobulle et marge anti-collision) viennent aussi du JSON canonique.

L’entrée React `design/primitives.html` est déclarée dans Vite : la référence fonctionne en développement et dans `dist/design/primitives.html`. Elle n’importe pas les écrans métier ni le client wallet. Le point d’entrée de l’application reste le même.

## Contrat des primitives

| Primitive | Comportement |
| --- | --- |
| `Button`, `IconButton` | Primaire, secondaire, discret, destructif ; `busy` désactive l’action et expose `aria-busy` ; label obligatoire sur le bouton icône |
| `Input`, `Select` | Label persistant, identifiant stable, aide/erreur associées, erreur via `aria-invalid`, attributs natifs et ref conservés ; les entrées `inputMode="decimal"` et `type="number"` utilisent la fonte numérique et les chiffres tabulaires |
| `Checkbox`, `Switch` | Contrôles natifs étiquetés, états contrôlés ou non contrôlés, cible tactile portée par le label |
| `Tabs` | Onglets et panneaux associés ; flèches au clavier ; élément désactivé ignoré |
| `Menu` | Menu portalisé, navigation clavier, élément désactivé, Échap et restitution du focus |
| `Dialog` | Titre/description, focus protégé, Échap, bouton fermer, restitution du focus ; état contrôlé par l’appelant |
| `Tooltip` | Déclencheur au survol et au focus ; Échap ; information complémentaire, jamais seule source d’un nom accessible |
| `NumberText`, `Badge` | Chiffres mono/tabulaires ; statuts avec texte et icône ; pas de calcul financier ni de formatage des unités de chaîne |
| `Surface`, `Divider` | Niveaux `bg`, `s1`, `s2`, `s3` et séparation structurelle |
| `Skeleton`, `Notice` | Chargement nommé sans animation continue ; information/succès/erreur avec sens explicite et place pour la récupération |

Les composants portalisés portent leur propre racine `.ek-ui` pour conserver les fontes et les états. Les tokens sont chargés sur le document. Les contrôles ont une cible de 44 px, les rayons restent 8/12/20, les transitions 180–240 ms. La réduction des animations désactive aussi l’animation sur la racine du dialogue.

Le JSON passe de 74 à 87 variables : deux neutres pour le contour perceptible des contrôles et le voile modal, huit dimensions de contrôle/fenêtre, trois niveaux de superposition. La palette de marque, les quatre surfaces, les deux fontes et les échelles validées sont conservées.

## Vérification et limites

| Avant | Après | Pourquoi |
| --- | --- | --- |
| Logo SVG noir par défaut sur fond sombre | Mot-symbole masqué avec la couleur de texte du token | Conserver la marque et son contraste |
| Nom accessible du menu remplacé par celui du déclencheur Radix | Nom du menu explicitement conservé | Rendre le contexte d’affichage identifiable au clavier et au lecteur d’écran |
| Action de récupération mêlée au texte de l’erreur | Message et action alignés sur des lignes distinctes | Garder une lecture complète sur mobile |
| Réduction des animations appliquée uniquement aux descendants du dialogue | Racine du dialogue comprise dans la règle | Éviter l’animation d’entrée en mouvement réduit |
| Champ monétaire en police d’interface | Police numérique et chiffres tabulaires pour les entrées décimales/numériques | Respecter la règle sur chaque montant, y compris pendant la saisie |

`npm run build` vérifie TypeScript et construit les deux entrées Vite. `node scripts/browser-terminal-primitives.mjs` vérifie les interactions et capture la matrice 1440/390. `UI_BASE_URL` permet de tester la sortie construite, par exemple `http://127.0.0.1:5174`.

La référence présente des spécimens explicitement illustratifs. Aucun prix de marché, volume, rendement, flux de données, ordre ou paiement n’est fabriqué. Les actions de démonstration n’appellent aucun wallet ni service externe. Les tests de cette étape ne rejouent pas de signature Intear et ne constituent pas un audit de sécurité des contrats.

Les captures et les assertions sont recensées dans [terminal-primitives-browser.json](../../docs/results/terminal-primitives-browser.json). Le contrôle d’intégration [terminal-primitives-main-smoke.json](../../docs/results/terminal-primitives-main-smoke.json) vérifie aussi que l’Explorer existant se charge aux deux largeurs sans recevoir les styles de cette référence.

La [revue indépendante](../../docs/results/terminal-primitives-review.json) a examiné les 20 captures de la référence et demandé la correction typographique du champ monétaire. Après rebuild et recapture de la même matrice, le passage de verdict score ce correctif résolu (`ship` à ce périmètre). L’étape 2 s’arrête ici pour présentation à l’utilisateur.

Le détecteur a été lancé une seule fois sur les nouveaux composants et les styles de référence : aucun signalement dans sa sortie JSON. Sa résolution statique des liens CSS absolus de l’entrée HTML échoue sur `design/design/…` ; ses vérifications des couleurs/variables par ces liens sont donc incomplètes. Les CSS ont aussi été fournis explicitement, et les assertions navigateur ainsi que la revue du rendu restent les preuves de cette étape. Aucun second passage ni règle supprimée.

Les menus, onglets, dialogues et infobulles utilisent [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction), avec les [règles de dialogue](https://www.radix-ui.com/primitives/docs/components/dialog) et de [navigation clavier des menus](https://www.radix-ui.com/primitives/docs/components/dropdown-menu). Les icônes proviennent de Lucide, trait uniforme de 2. Les dépendances sont épinglées dans `package.json` et le lockfile.

La navigation globale, la recherche Cmd+K, le ticker, les tableaux de marché, les cartes NFT et l’architecture `CardFrame` JSON appartiennent à l’étape 3. Les pages Explorer/Collection/NFT et l’intégration aux parcours financiers appartiennent à l’étape 4, après validation des étapes précédentes.
