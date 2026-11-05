# Interface Everkeep — direction actuelle

La demande de refonte éditoriale remplace la précédente direction forêt/ivoire. L'analyse réelle de nearhackathon.com, le contrat visuel, les choix d'implémentation et les limites sont consignés dans [art-direction-v2.md](art-direction-v2.md). Les anciennes descriptions ci-dessous ne constituent plus la prescription de l'interface actuelle.

Les styles d'autorité sont src/art-direction.css (présentation, tokens et signature) et src/interface-theme.css (contrôles partagés et application), chargés après les styles structurels existants. Présentation : src/Presentation.tsx, ControlMap.tsx et PlanExample.tsx. Le Portfolio est dans src/Portfolio.tsx avec les classes structurelles src/portfolio.css. Il lit les snapshots vérifiés et les événements connus ; l'inspection d'une proposition ne signe rien. Les commandes financières existantes restent dans l'espace Autorisations.

Contrôles : `npm run test:art`, `npm run test:portfolio`, `npm run test:design`, `npm run test:nft`, `npm run test:quality`, `npm run test:browser`. L'ancien nom `test:forest` pointe sur la nouvelle QA de présentation. Montants exacts et résumés sensibles utilisent les mêmes helpers BigInt, sans changement d'autorité contractuelle.

## Historique de la précédente passe (supplantée)

# Direction et interactions de l’interface

La direction actuelle sépare la présentation forêt (`/#presentation`) et l'application ivoire (`/#app`). Le fichier src/near-green.css est limité à la présentation ; src/workspace.css définit les tokens et les composants opérationnels. Les gains effectivement reçus, les fonds réservés et les objectifs hypothétiques sont distingués. PRODUCT.md, docs/ui-direction.md et docs/ui-review.md portent les décisions et les preuves de cette passe. Le détail forestier ci-dessous concerne uniquement la présentation.


À la demande de l’utilisateur, la direction actuelle reprend le rythme visuel de [nearhackathon.com](https://nearhackathon.com/#top) : titre monumental, navigation supérieure compacte, scène de particules et schéma interactif. Palette Everkeep : nuit verte `#091d13`, forêt `#102c1d`, surface `#123221`, menthe `#a4e7bb`, texte `#e0f4e7` et secondaire `#a3c4af`. Les titres et données utilisent Public Sans, servie localement avec sa licence OFL. Le thème courant est dans `src/near-green.css` ; aucune image ni code source du site de référence n’a été copié.

## Scène interactive du plan

`src/LivingPlan.tsx` dessine une géométrie originale de NFT-compte en Canvas 2D : rotation projetée, glyphes et orbites, pilotables par glisser intentionnel ou aux flèches lorsque le canvas a le focus. Les modes Compte/Permissions/Transmission expliquent les invariants du produit. La scène est arrêtée par défaut. Animer déclenche la rotation ; pause l’arrête et Recentrer rétablit la vue initiale. Le bandeau défilant a été supprimé. La préférence de réduction des mouvements arrête les animations automatiques. La rotation est suspendue hors écran et lorsque l’onglet est masqué ; sa cadence de dessin est limitée à environ 30 images/seconde.

Le schéma ne simule aucun paiement et ne déclenche aucune transaction. L’identité affichée vient du plan chargé ; sans plan, la vue n’invente ni compte, ni propriétaire, ni solde. Un lien clavier « Accéder à l’application » amène directement à la zone de données et d’actions. Les projections et parcours métier restent ceux décrits ci-dessous. Le tableau rassemble le compte et ses permissions à gauche, la simulation dans une colonne continue à droite ; les sections se suivent sur mobile.

## Projection interactive

`src/Projection.tsx` explore horizon, hypothèse annuelle et versement mensuel envisagé. La courbe compare valeur hypothétique et capital versé, avec inspection à la souris ou au curseur clavier. Les boutons 1/5/10 ans complètent un horizon libre de 1 à 30 ans.

Les versements envisagés sont regroupés en fin d’année pour la formule de capitalisation. Pas de frais ni fiscalité modélisés. Les calculs flottants concernent exclusivement cette simulation ; les montants réels du plan restent des chaînes entières/BigInt. Changer un curseur ne signe rien, ne modifie pas le mandat et ne déplace aucun actif.

## États et mouvement

`OperationStatus` présente lecture, signature à confirmer, exécution en attente, succès et erreur. En sandbox, signature et exécution sont regroupées dans une attente du signataire local ; aucune étape de finalité fictive n’est annoncée. Sur testnet, les phases correspondent à l’appel du wallet et à la vérification de sa réponse ; l’absence de résultat ne doit pas afficher un succès.

Le parcours de signature locale affiche le message prêt à signer puis l’autorisation importée, sans prétendre vérifier sa signature dans l’interface. Le contrat conserve la décision finale.

`ChangeReceipt` compare deux snapshots réels du même compte et explique dépôt, allocation, rachat, retrait, rotation, transmission et modification du mandat. Une courte animation suit le trajet des fonds ou du contrôle uniquement après le changement observé. Aucun mouvement continu décoratif. La barre d’allocation suit les soldes réels.

## Clavier et réduction des animations

Lien d’évitement, focus visible, navigation identifiée et commandes de projection nommées. Les fenêtres placent le focus à l’ouverture, le retiennent avec Tab/Maj+Tab, se ferment avec Échap hors opération en cours et rendent le focus au bouton d’origine. Le reste de l’interface est inerte pendant l’ouverture. Une opération en cours bloque la fermeture ; son statut est annoncé. Les erreurs ont une seule annonce d’alerte.

`prefers-reduced-motion: reduce` désactive animations et transitions, sans masquer les informations de statut et de mouvement. La préférence est testée dans Chromium. Les polices et données ont des alternatives textuelles ; le graphique n’est pas l’unique moyen de consulter une projection.

## Vérifications

Avec l’API sandbox et Vite démarrés :

```bash
npm test
npm run build
npm run test:browser
npm run test:design
npm run test:forest
npm run test:nft
npm run test:quality
```

Les scripts navigateur utilisent Chrome installé sous Windows ou `CHROMIUM_PATH` sous Linux. Le scénario métier crée un plan sandbox et réalise de vraies opérations avec des jetons de test ; le contrôle de design vérifie clavier, chargement réel, curseurs, focus, polices locales, réduction des animations et débordement de 320 à 1440 px.

Rapports : `docs/results/browser.json`, `docs/results/frontend-design.json`, `docs/results/forest-ui.json` et `docs/results/nft-workspace.json`. Captures : `.research/screenshots/`, notamment `forest-1440.png` et `forest-390.png`. Le contrôle forêt vérifie pause, rotation clavier/pointeur, explications, réduction des animations, accès direct et six largeurs, sans requête de mutation. Le parcours d’un wallet externe testnet n’a pas été exécuté ; les contrôles clavier ne constituent pas une certification d’accessibilité exhaustive.


## Formulaires et données difficiles

Chaque opération sensible possède un récapitulatif du montant exact, du destinataire effectif et des changements de permissions. Le bouton de confirmation refuse les paramètres invalides ; les champs, le changement de réseau et la fermeture sont verrouillés pendant l'envoi. Une garde synchrone bloque les doubles clics. Une erreur conserve les champs et permet la nouvelle tentative. Les données API incomplètes sont rejetées sans écraser l'état connu. Une opération contractuelle en attente bloque les autres actions financières.

Les soldes utilisent BigInt et six décimales demoUSD jusqu'à u128 maximal. Les nombres de simulation seulement utilisent les flottants et sont explicitement hypothétiques. La vérification ui-quality.json injecte délibérément pannes, données incomplètes, adresses longues et montants extrêmes ; elle n'envoie aucune transaction et ne remplace pas browser.json, qui contrôle de vrais mouvements sandbox.


Les très grands soldes utilisent une magnitude précédée de ≈ et un bouton « Valeur exacte » avec champ sélectionnable et copie. La projection devient explicitement indisponible au-delà de sa précision entière sûre ; elle ne dessine pas une courbe à partir d'un montant tronqué. Les détails de la revue indépendante et les mesures ciblées de contraste sont dans docs/ui-review.md.
