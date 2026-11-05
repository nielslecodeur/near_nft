# Parcours guidés Everkeep

Cette évolution du 4 novembre 2026 simplifie les écrans existants sans modifier les contrats, les permissions financières ou les positions déjà créées. Elle conserve Orbite : vert sombre, accent citron vert, Space Grotesk et Inter. Le DESIGN.md historique décrit encore une autre palette ; ce décalage préexistant n’a pas été corrigé dans cette tâche.

La navigation comporte Explorer, Mes positions et Agents. Les réglages du coffre et de sécurité sont accessibles dans le menu du compte (ou Paramètres du compte avant connexion). Les liens historiques continuent de rejoindre leur usage actuel.

## Choisir et créer

Explorer commence par deux choix : être accompagné par un agent ou choisir soi-même. Les modèles et les reventes occupent deux onglets distincts, avec les mêmes catégories. La fiche expose les conditions de sortie et les risques ; un modèle indisponible ne permet aucun dépôt. Un NFT représente la propriété transférable de la position et conserve ses règles et ses actifs lors d’une vente.

La création directe suit Choisir → Vérifier → Signer et créer. Le récapitulatif sépare le capital demoUSD, les frais de mission (nuls en direct), la provision de 6 NEAR, l’enregistrement de 0,02 NEAR et le gas variable. Aucun agent n’est autorisé par une création directe. Les demandes de signatures réellement distinctes du transport existant restent conservées. Le compte et le NFT doivent être confirmés avant d’annoncer un succès.

La connexion est proposée au moment d’agir. Le modèle, le montant et l’étape de vérification sont conservés comme préférences publiques dans sessionStorage, sans lancer de transaction après connexion. En cas de solde insuffisant, le financement testnet propose le faucet NEAR officiel et le distributeur demoUSD existant, puis un retour à l’action. Une erreur de lecture n’est pas affichée comme un solde nul.

## Demander de l’aide

Agents commence par « Que souhaitez-vous faire ? », puis donne trois exemples et un sélecteur compact des expertises. L’explication des modèles et l’incompatibilité d’un besoin sans verrouillage ne préparent aucun paiement. L’analyse du placement reste déterministe dans le mode de démonstration actuel ; ce changement ne rajoute pas de modèle d’IA.

Les montants, réserve, horizon, disponibilité, exclusions et expertise peuvent être repris après connexion ou rechargement. Les capacités de mission et les clés restent dans le coffre chiffré existant. Le devis et le prix de l’analyse restent examinables avant paiement ; la création proposée reste une décision financière distincte.

## Retirer ou vendre

Mes positions distingue les actifs dans la position, les fonds engagés dans la stratégie et le montant disponible au retrait. La présence de liquidités dans le compte ne donne pas un droit de retrait anticipé. L’échéance, les réserves, les placements engagés, une opération en attente ou une vente peuvent rendre le retrait indisponible. Le montant et le propriétaire destinataire sont montrés avant signature ; les contrôles du contrat restent l’autorité.

Le détail propose Retirer, Gérer l’agent et Vendre la position. Les limites et la révocation de l’autorisation restent accessibles. Pour une vente, le prix revient au vendeur, les actifs restent dans le compte et l’acheteur reprend les contraintes ; l’annonce gèle les opérations incompatibles. Une revente n’est jamais garantie. Après l’échéance, ce contrat n’ouvre plus de nouvelle annonce.

## Vérifications et limites

`npm test` : 47 tests réussis, dont deux nouveaux tests des fonds affichés comme retirables (frontière exacte de l’échéance, vente, opération en attente, réserves et principal). `npm run build` inclut le contrôle TypeScript et réussit.

`node scripts/browser-guided-ux.mjs` : matrice de 30 captures à 390, 768 et 1440 px, sans débordement du document ni erreur JavaScript. Le rapport [guided-ux-browser.json](results/guided-ux-browser.json) sépare les vérifications et les limites.

| Parcours | Vérification dans cette tâche |
| --- | --- |
| Découverte sans connexion | Catalogue, catégories, grille et fiches dans le navigateur |
| Connexion et retour | Adaptateur UI avec l’adresse publique nifelst.testnet ; modèle, montant et vérification restaurés ; aucune signature automatique |
| Financement de test | Lien du faucet officiel, ouverture du financement et retour au montant initial ; aucune nouvelle distribution effectuée |
| Création directe | Revue du montant, échéance, frais, autorisation et fonds insuffisants ; aucune nouvelle création financée envoyée |
| Agent | Explication gratuite, demande avec réserve exacte et tarif, reprise après rechargement ; aucune mission payée pendant ce test |
| Consultation / retrait | Position réelle de 25 demoUSD lue ; 0 retirable avant le 11 novembre 2026. Cas d’échéance atteinte explicitement simulé, uniquement jusqu’au callback UI |
| Mise en vente | Position réelle éligible jusqu’à l’ouverture du récapitulatif ; aucune annonce publiée |
| Erreur réseau | Erreur RPC réelle constatée, puis scénario 429 simulé avec restauration de la demande impayée |

Le RPC Fastnear configuré a renvoyé HTTP 429 pendant les essais. Le harnais a utilisé des réponses de lecture réelles d’Intear RPC, protocole 88, conservées à un même bloc final pendant la matrice. Cela ne change pas la configuration de production et ne constitue pas un nouveau test de signature. Les fournisseurs figurent dans la [documentation NEAR](https://docs.near.org/api/rpc/providers).

À effectuer avec le wallet réel : signatures de refus/reprise, distribution de fonds si nécessaire, création directe et par agent jusqu’au NFT, achat/revente entre comptes, puis dénouement et retrait après l’échéance. Les preuves testnet des tâches précédentes restent historiques et distinctes de cette vérification UI. Aucun secret ou mot de passe n’est demandé pour ces tests.

## Captures représentatives

- [Explorer desktop](screenshots/guided-ux/discover-1440.png)
- [Agents mobile](screenshots/guided-ux/agent-390.png)
- [Position et retrait verrouillé](screenshots/guided-ux/owned-withdraw-locked-390.png)

Revue indépendante : trois corrections (libellé de repli, erreur wallet flottante, cartes tablette) appliquées puis recapturées sur la même matrice. Verdict **ship**, limité aux trois corrections notées résolues ; [rapport](results/guided-ux-review.json). Le test navigateur du coffre et des reçus réussit également : persistance chiffrée, refus synthétique, reprise et absence de second paiement confirmé.
