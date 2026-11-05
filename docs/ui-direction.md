# Direction de cette passe UI/UX

Cette passe affine l’identité existante sans changer le produit. Le brief utilisateur et les faits de PRODUCT.md constituent le contexte confirmé ; ses choix réversibles ont été délégués. Travail directement dans le code existant, sans nouveau choix permanent de workflow Impeccable ni génération de maquette image.

## THESIS

Une épargne programmable dont le contrôle se transmet, présentée par une identité forêt et utilisée dans un espace financier calme et précis.

## OWN-WORLD

Everkeep conserve son vert forêt et son schéma géométrique de NFT-compte. Les surfaces opérationnelles ivoire, les données anthracite et les accents verts limités améliorent la lecture. Public Sans locale relie les deux espaces.

## STORY

La présentation explique le compte persistant puis le dépôt, l'allocation et la transmission Alice → Bob. L'application donne d'abord les soldes observés, puis les actions, la simulation hypothétique, les autorisations et les événements réels.

## FIRST VIEWPORT

Présentation : promesse « Votre épargne se transmet », explication concrète et entrée dans la démo. Application : titre du plan, environnement, valeur et capitaux reçus ; aucun schéma marketing avant les données.

## FORM

Navigation horizontale, chiffres tabulaires, regroupements par fonction avec peu de surfaces fermées. Une projection latérale devient verticale sur mobile. Les confirmations exposent destinataire, montant et conséquences ; les mouvements répondent à une action et les soldes ne sont pas interpolés.

Procédure de seed : non applicable à cette amélioration d'un système existant avec références et direction déjà données par l'utilisateur. Aucun seed, benchmark indépendant ou image approuvée n'a été sélectionné ni inventé. La référence héritée nearhackathon.com a guidé la précédente passe forêt ; le brief actuel guide sa séparation avec l'application ivoire. Les captures du produit et les comportements réels constituent la référence de cette revue.

## Décisions de mise en œuvre

- Présentation, mode Persuade : conserver le vert forêt et le schéma NFT-compte, avec un titre concret, une action d’entrée unique et l’exemple Alice → Bob identifié comme explication. Animation arrêtée par défaut, rotation sur commande ou geste intentionnel.
- Application, mode Operate : surface ivoire légèrement chaude, anthracite, accent vert profond, données Public Sans, titres mesurés. Disponible, engagé et réservé visibles sans animation des montants. La scène marketing ne précède plus les actions à chaque visite.
- Navigation : routes de fragment distinctes, liens partageables et historique du navigateur. Conserver l’état du plan et les champs en cas d’échec.
- Interaction signature : récapitulatif exact de montant, destinataire et conséquences ; paramètres verrouillés pendant l’exécution, garde de double soumission immédiate. L’interface ne remplace jamais la validation contractuelle.
- Mouvement : une transition courte d’ouverture par action pointeur, aucune entrée lors d’une commande clavier ; propriétés transform/opacity, réduction des mouvements et animations interruptibles. Aucun effet de survol permanent du canvas.
- Revue : rendu réel sur mobile 320/390 px, tablette 768 px et desktop 1440 px ; parcours métier complet en sandbox, erreurs, chargement, valeurs longues et grands soldes ; revue d’animation Avant/Après, détecteur mécanique unique puis revue finale indépendante.

Les guides UI/UX Pro Max confirment l’intérêt d’une structure minimale pour un dashboard et de récapitulatifs/formulaires accessibles. La palette générique bleue/orange proposée n’est pas retenue : la direction utilisateur et le vert Everkeep priment. Les recommandations d’animations Emil sont appliquées aux interactions, pas aux montants financiers.
