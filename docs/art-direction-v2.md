# Recomposition éditoriale — référence imposée par l'utilisateur

Le brief du 2 novembre 2026 remplace explicitement la direction ivoire/forêt et autorise le remplacement des structures de présentation. DESIGN.md décrit encore l'ancien système ; il sera actualisé pour correspondre au résultat de cette refonte autorisée. Les contrats, signatures et intégrations sont préservés. Le Portfolio et le suivi de l'agent demandé juste avant restent dans le périmètre. Le README explicatif est demandé pour plus tard.

## Observation réelle

Référence ouverte dans Chrome à 1440 et 390 px : https://nearhackathon.com/#top. Captures avant du produit et de la référence dans `.research/art-direction/`. Premier desktop capturé pendant l'introduction : à distinguer de la capture stabilisée. Observation : grands titres sans empattement très denses, navigation et informations monospaces, bordures fines rectilignes, fond crème chaud et plages de bleu saturé, composition de la scène centrale dans le premier écran, alternance de sections denses et de grands titres. Les textes et illustrations du site ne sont pas réutilisés.

Trois causes du rendu générique précédent : séparation excessive titre/scène, rythme uniforme des groupes d'information, géométrie 3D ne montrant pas directement qui a les permissions.

## THESIS

Le compte reste, le contrôle passe : une affiche éditoriale devient un instrument lisible pour comprendre et utiliser le NFT-compte.

## OWN-WORLD

Papier chaud, encre sombre, bleu signal. Titres Public Sans très denses, repères et données monospaces, rectangles et filets précis. Aucun nouveau langage décoratif concurrent. La référence utilisateur fixe la direction ; pas de tirage de styles alternatifs qui la remplacerait ni de fausse maquette approuvée. Réalisation directement dans le navigateur avec étapes de validation demandées.

## STORY

Premier écran : compte persistant et transfert de contrôle. Puis exemple concret dépôt/allocation/transmission sur une plage bleue, rôle limité de l'agent et accès au Portfolio, enfin capacités réelles et frontières de la démonstration.

## FIRST VIEWPORT

Navigation compacte. À gauche, « LE COMPTE / RESTE. », explication concrète et entrée dans la démo ; à droite, grand schéma fonctionnel reliant propriétaire, NFT-compte et agent. Aucun montant inventé. Le schéma indique qu'il est explicatif et ne signe rien.

## FORM

Landing asymétrique, plages colorées structurantes, boutons rectilignes et échelles contrastées. Application : mêmes encre, papier et bleu, densité plus calme, chiffres exacts et confirmations conservées. Trois interactions : explorer les étapes du contrôle, parcourir l'exemple financier explicitement fictif, examiner la proposition réelle de l'agent dans le Portfolio. Mouvements courts et contrôlés ; aucune animation financière, aucun écran d'introduction bloquant.

## Implémentation et vérification

Public Sans locale porte les titres ; IBM Plex Mono locale porte les repères, les commandes et les données. Fichier obtenu depuis le dépôt officiel Google Fonts, licence OFL conservée dans public/fonts. Les visuels sont des composants DOM/SVG originaux ; aucune illustration ni marque de la référence copiée. L'ancien canvas 3D et sa feuille de style ont été retirés. `test:forest` reste un alias de compatibilité du nouveau contrôle `test:art`.

| Before | After | Why |
| --- | --- | --- |
| Rotation d'une forme en particules | Propriétaire, compte et agent reliés dans un schéma sélectionnable | Montrer directement qui peut agir |
| Scène séparée après une introduction centrée | Titre et mécanisme placés ensemble | Comprendre dès le premier écran |
| Bandeau et animation de présentation antérieurs | Aucun mouvement permanent ; changement d'opacité de liaison sur action pointeur | Continuité utile, sans travail graphique continu |
| Barres et montants financiers | Mise à jour immédiate maintenue | Ne pas rendre ambigu un solde observé |
| Modales de signature existantes | Même gestion du focus, garde de soumission et réduction des mouvements, nouvelle enveloppe visuelle | Préserver le parcours de sécurité |

Rapport visuel et fonctionnel : docs/results/art-direction-v2.json, sept routes à 320/390/768/1440 px. Captures dans `.impeccable/review/v2/`, ouvertes et contrôlées avant revue indépendante. Contrastes ciblés : six rôles, minimum 5,39. Autres rapports de cette passe : frontend-design.json, nft-workspace.json, portfolio-ui.json, ui-quality.json et browser.json. Le dernier exécute de vraies transactions en sandbox ; les fixtures de transport et de grands montants sont identifiées séparément.

Détecteur Impeccable exécuté une fois sur les nouveaux composants et styles : 68 avis de dérive par rapport à l'ancien DESIGN.md (police, tailles et couleurs). La nouvelle référence remplace explicitement cet ancien système ; ses tokens sont à réconcilier par le documenter. Aucun signal de grille de cartes, bordure d'accent ou autre antipattern structurel dans cette sortie. Rapport brut local `.research/art-v2-detect.json` ; pas de seconde exécution du détecteur.

Les tests de navigateur sont des émulations de viewport, pas des tests sur téléphone physique. Pas de signature par wallet testnet externe ni de connexion DeFi externe aux fonds. Aucun nouveau contrôle d'autorisation n'a été déplacé vers l'interface.

## Verdict indépendant

L'agent de finition Impeccable a reçu le brief, la référence réellement capturée, le contrat de direction, les sources et les rapports. Il a examiné les 17 captures V2 et les deux états difficiles ; verdict **ship**, aucun correctif matériel demandé. La police, les proportions, le fond, les fonctions distinctes des sections et le partage de codes avec l'application sont validés au niveau des preuves fournies. Les sources sont échantillonnées, pas auditées exhaustivement. Aucun comp d'image approuvé ni comparaison pixel à pixel n'est revendiqué. Le plafond de qualité est jugé par rapport à la référence imposée par l'utilisateur.

TypeScript et build Vite finaux réussis ; 16 tests réussis. Les avertissements transitifs `util` externalisé et `eval` dans js-sha256 sont conservés et documentés. Aucun script lint n'est configuré. Les contrats inchangés n'ont pas été retestés en Rust dans cette passe ; le parcours complet réel via l'interface est réexécuté.
