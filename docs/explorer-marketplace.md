> Étape historique : cette galerie à deux entrées a évolué vers [la marketplace de positions](marketplace-mvp.md), avec trois entrées principales et un catalogue de stratégies.

# Explorer : une place de marché NFT

Le brief du 3 novembre 2026 recentre Explorer sur l’achat. Références visuelles consultées dans Chrome : [SuperRare](https://superrare.com/) et [Zora](https://zora.co/). On retient les grands visuels, une interface qui s’efface et un accès direct à l’offre. Aucune œuvre, cotation ou activité de ces services n’est reprise.

Le visiteur voit une offre réelle du prototype : **Réserve demoUSD**, son minimum et son échéance. « Voir le NFT » ouvre les conditions et le montant ; « Préparer l’achat du NFT » ouvre la confirmation financière existante. Les actifs restent verrouillés jusqu’à l’échéance du contrat. Le NFT transmet le contrôle du compte, sans modifier ses conditions.

Nouveaux NFT et Revente sont deux filtres du catalogue. Les annonces viennent exclusivement de l’état des contrats. Les annonces expirées du vendeur peuvent être libérées ; les règlements en cours restent consultables. Les annonces clôturées ne proposent pas de nouvel achat. Aucune fausse collection ne remplit les états vides.

Navigation principale : **Explorer / Mes NFT**. Connexion wallet, compte local et sécurité restent dans Mon compte. L’agent existant est accessible par une aide facultative et le menu compte ; son développement est reporté. Le manège et les deux concepts indisponibles sont retirés d’Explorer pour réduire les choix sans désactiver les commandes des positions existantes.

## Surface et limites

Mode de la galerie : Experience ; fiche et confirmation : Operate. `src/NftMarketplace.tsx` porte le catalogue et sa fiche, `src/marketplace.css` la surface blanche et verte, `SeriesApp.tsx` conserve les commandes et confirmations financières. Les illustrations sont des géométries SVG originales, décoratives ; ce ne sont pas des métadonnées artistiques récupérées on-chain.

| Usage | Valeur |
| --- | --- |
| Fond | `#ffffff` |
| Texte | `#18251f` |
| Texte secondaire | `#59635e` |
| Action | `#174b39` |
| Action survolée | `#103c2c` |
| Séparateur | `#dedfd9` |
| Typographie | Public Sans locale, chiffres financiers exacts du composant partagé |

La nouvelle surface est limitée à Explorer. Le système global papier/bleu de `DESIGN.md` et son sidecar restent conservés pour Mes NFT et le prototype Agent. Cette différence de surface est intentionnelle et ne constitue pas une migration globale du design system.

Les obligations et autres contrats financiers sont une intention produit, **pas des offres implémentées**. Seule une position de démonstration à échéance est achetable dans la sandbox. demoUSD n’a aucune valeur monétaire ; aucun capital ni rendement n’est garanti. La connexion/lecture testnet existe, ses opérations financières restent désactivées. Aucun contrat n’a été modifié pour ce travail d’interface.

## Vérification

`npm run test:browser` lance les contrôles Chrome en lecture seule sur les services locaux 5173/8790. Sous Windows : `node scripts/browser-marketplace-check.mjs`. Rapports `docs/results/marketplace-ui.json` et captures locales ignorées dans `.impeccable/review/marketplace/`.

`MARKETPLACE_TRANSACTIONS=1 node scripts/browser-marketplace-check.mjs` ajoute un parcours réel : achat de 20 demoUSD par Alice, annonce à 19 puis achat par Bob. Cette option crée un nouveau NFT et débite des actifs de test ; elle conserve les NFT déjà financés et ne réinitialise pas la chaîne. Rapport `docs/results/marketplace-flow.json`. Les captures après achat reflètent les soldes de cette session, pas une activité simulée.

Les tests UI historiques `browser-explorer-check.mjs` décrivent le précédent carrousel à trois entrées, pas cette galerie. Les preuves de souscription agent dans `docs/explorer-agent.md` restent pertinentes pour le protocole.

`npm run test:marketplace:states` vérifie avec des réponses HTTP de test le chargement, l’erreur réseau avec reprise, l’absence d’émission, la fermeture de souscription et le dépassement de capacité. Ces contrôles n’envoient aucune commande : ce sont des preuves de rendu, pas des preuves financières (`docs/results/marketplace-states.json`).

La revue indépendante a demandé quatre corrections : séparation visuel/lettrage, masquage robuste du lien d’accès au contenu, approche typographique et contexte produit. Verdict final **ship** sur ces quatre corrections résolues, sans audit exhaustif des contrats ou du site. Le détecteur n’a émis que des avis de différence avec le système global ; la palette, les tailles et les arrondis sont documentés ici pour cette surface.
