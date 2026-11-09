# Paniers thématiques d’actions simulées — 5 novembre 2026

Trois modèles versionnés livrés : AI Infrastructure, Space & Robotics, Energy Transition ; cinq entreprises et exactement 100 % chacun. Registre : packages/shared/baskets.v1.json. Source de prix explicitement fictive, déterministe et commune à un jour UTC, sans fallback vers/depuis un fournisseur historique. Identifiants contrôlés sur les fiches Nasdaq ; API Alpha Vantage et conditions étudiées, disponibilité/licence de redistribution non validées donc cours historiques non activés.

Le wallet préserve son layout Borsh et ajoute une position de simulation dans un namespace séparé. Autorisation ML-DSA BindBasket liée au modèle/version/montant/jour et aux domaines/nonce/expiration/générations existants. Prix et quantités calculés par le contrat ; quantités fixes à huit décimales, arrondis/reliquat exacts en u128/BigInt. Dépôt initial exact et unique du propriétaire ; aucun yield ni allocation autonome sur ces paniers. Clôture distincte puis retrait du disponible réel vers le propriétaire courant. **Valorisation informative : aucun gain/perte fictif réglé, aucune réserve de variation, aucune action réelle détenue.** Anciennes maturités et revente préservées.

Explorer : Actions thématiques en premier, cartes avec art IA/space/énergie, cinq poids au verso, zone défilante accessible au clavier et bouton de création toujours visible. Fiches et souscription directe : deux validations Intear (compte, puis groupe enregistrement/ML-DSA/dépôt), coffre local chiffré et export facultatif. Reprise explicite avec contrôle des transactions inconnues et de la date des prix. Mes positions : capital, valeur simulée, fonds token, retrait, quantités, dates et historique séparés ; prix payé du propriétaire secondaire non indexé donc aucun résultat personnel inventé. Agent gratuit : Diversification, Analyse thématique, Liquidité ; missions payantes historiques repliables, spécialiste crypto conservé.

Deux nouvelles illustrations Imagegen intégrées en WebP : public/art/special/ai-infrastructure.webp et energy-transition.webp. Le personnage spatial existant est réutilisé. Prompts exacts et origine : public/art/special/BASKETS_PROVENANCE.json. Textes/chiffres/boutons en HTML ; scan5rasters0manquants. DESIGN.md et .impeccable/design.json préservés ; PRODUCT.md, README et docs/thematic-baskets.md actualisés.

Vérifications exécutées :

- npm test : **64/64** ; tests prix absents/nuls/périmés/mode/date incohérents, week-end, pondérations et identifiants invalides, quantités/reliquat, hausse/baisse, version figée, absence de gain au dépôt, paramètres signés et compréhension de demande.
- bash scripts/test-contracts.sh : **60 tests Rust réussis** (28 wallet, 20 collection, 12 missions), dont calcul Rust identique et jour sans observation.
- Build contrats cargo-near réussi ; npm run build final (TypeScript/Vite) réussi.
- npm run test:baskets : **20 contrôles sur vrais WASM**, signatures host ML-DSA et transferts FT : dépôt non lié/incorrect refusé avec remboursement, autorisation modifiée/rejouée refusée, conservation des quantités lors du transfert et ancien accès refusé, clôture exigée, gain arbitraire supérieur aux tokens refusé, retrait exact unique. docs/results/baskets-sandbox.json.
- npm run test:series : **33 contrôles historiques** de souscription, gel, marché secondaire/concurrence, créance vendeur, ancienne clé/agent, maturité et retrait réussis. docs/results/series-demo.json.
- npm run test:baskets:browser : **18 captures 1440/768/390**, chargement des trois arts réels, retournement clavier, composition, montant invalide/revue, proposition gratuite et conservation du montant, vues détenues et clôturées. **Aucune signature, aucune erreur JS ni débordement.** Les positions détenues de ces captures sont des fixtures synthétiques explicitement signalées, les lectures du catalogue sont réelles. docs/results/baskets-browser.json.
- Build de production contrôlé aux trois largeurs : actions du verso persistantes, défilement clavier, fiches, proposition gratuite, missions historiques accessibles ; aucune erreur JS/signature. docs/results/baskets-build-smoke.json.
- Régression des cartes illustrées : test:cards:special adapté aux cinq modèles visibles avec Toutes, puis exécuté avec succès (20 captures, aucune erreur JS ni signature), y compris liste, ancienne réserve possédée et relief au pointeur/réduction des animations. Les scripts des autres anciennes vues ont leurs sélecteurs mis à jour pour la catégorie et la section historique repliable ; ils ne sont pas revendiqués comme intégralement réexécutés ici.
- Revue Impeccable indépendante : disposition initiale fix, deux corrections demandées puis **ship sur les deux corrections résolues** (action du verso et documentation produit). Ce n’est pas un audit financier. docs/results/baskets-review.json. Détecteur exécuté une fois avec résultat vide.

Collection testnet dédiée déployée et vérifiée keyless : **baskets-v1.everkeep-dev-mw0weth5.testnet**. Code hash75cn5Nj8QybFqYD1yDApWYPnHPq6apCPiDNQHGMetehg ; wallet CLZfwzTxtY918Vbu7i47YYWxhnzrQaFogsb74Mez7pf7. Réserve historique inchangée ; seule la nouvelle propriété deployment.baskets ajoutée à public/testnet.json. Un top-up officiel de5NEAR de test a financé le déployeur ; premier envoi refusé pour solde insuffisant, second déploiement refusé pour stockage (6,5), puis création finale6,8NEAR confirmée, sans remplacement de contrat. Rapports publics : baskets-testnet-deployment.json et faucet-topup-everkeep-dev-mw0weth5.testnet.json. Credentials hors dépôt, jamais affichés.

Reste à faire avec l’utilisateur : vérifier les **deux validations natives Intear** sur une nouvelle souscription testnet, puis sa clôture/retrait. Aucun dépôt, paiement de mission ou signature du wallet nifelst.testnet n’a été exécuté automatiquement. Les flux financiers modifiés sont prouvés en sandbox, pas annoncés comme déjà signés par l’utilisateur sur testnet. Fournisseur historique/licence et règlement des variations restent hors implémentation active. Aucun mainnet, aucun argent réel, aucun push Git dans cette tranche.

Serveurs laissés disponibles : Vite5173, aperçu de production5174, worker testnet8793. Mode d’emploi, calculs, pouvoirs, limites et démonstration reproductible : docs/thematic-baskets.md.

---

# Cartes spéciales illustrées — intégration effective

La livraison précédente ne contenait pas l’art mémétique attendu. Ce point est traité : trois illustrations seules générées avec l’outil Imagegen intégré, inspirées de la grenouille PDG fournie, puis optimisées en WebP 1280 × 960 (~196–211 Ko chacune). Les titres, chiffres, boutons et logo restent rendus par le site. La variante réserve finale ne contient pas de lingots ; le décor ne représente pas les avoirs du compte. Assets et prompts exacts : public/art/special/PROVENANCE.json, avec sidecars de provenance vérifiées (3 rasters, aucun manquant).

Les modèles officiels, leurs annonces et les positions de réserve héritent maintenant de ces visuels. Preset JSON special : cadre holo, reflet et relief au pointeur fin, désactivation du relief en tactile/réduction des animations, sans faux flux financier. Logo, fontes, palette, calculs et parcours de signatures conservés. DESIGN.md et .impeccable/design.json inchangés : extension de la présentation des cartes dans le système approuvé.

Vérifications : build TypeScript/Vite réussi, 57 tests unitaires réussis ; 20 captures Chrome à 390/768/1440, sur grilles/listes, modèles, cartes possédées, fiches et verso, plus pointeur actif et réduction des animations. Les tests vérifient le chargement des trois WebP réels et le changement de transform au pointeur, sans erreur JavaScript ni signature. Rapports : docs/results/special-cards-browser.json, special-cards-build-smoke.json et special-cards-review.json. Aucun contrat modifié, aucun push ni déploiement effectué.

---

# Cartes NFT : recto, composition et fiches

Composant `PositionCard` commun aux modèles officiels, annonces et cartes possédées, dans l’identité Terminal existante. Illustration, nom, catégorie, identifiant et montant précisément libellé au recto ; composition cible ou actifs détenus, date de lecture et conditions de sortie au verso. Retournement volontaire au clavier/tactile avec focus transféré, face masquée inert/aria-hidden et hauteur conservée. Listes avec miniature contrainte, actions mobiles empilées et cartes de grille étirées. Les styles complètent la source canonique du design system sans nouvelle feuille globale ; logo, couleurs, fontes et tokens conservés, DESIGN.md et sa sidecar préservés.

Les fiches ajoutent une grande illustration et les quantités sur chaîne, en distinguant liquidités, fonds retirable, engagements et réservations. Valeur indicative et historique affichés indisponibles : aucun rendement ni pourcentage fictif produit. Historique optionnel validé, scénarios hausse/baisse/stable seulement dans le banc de démonstration explicitement identifié. Les actifs inconnus conservent leurs unités brutes, sans conversion demoUSD. Contrats, signatures, paiements, permissions et handlers de règlement/retrait inchangés.

Validation : build TypeScript/Vite, 57 tests unitaires, matrice Playwright 390/768/1440 (29 captures : grilles/listes, modèle réel, compte détenu lu sur testnet, composition/clavier/tactile, historique absent et scénarios fictifs, montant élevé, image manquante, chargement et erreur réseau). Les tests de connexion utilisent un adaptateur qui refuse les signatures. Aucune transaction envoyée. Aucune annonce actuellement active sur la chaîne lue : le type annonce est couvert par des fixtures UI, pas par un achat réel. Détecteur Impeccable : aucun signalement. Relecture indépendante et détails de validation dans docs/results/position-cards-review.json et position-cards-browser.json.

Asset manquant : illustration de la grenouille seule, sans textes, chiffres, logo ni boutons incrustés. La maquette complète n’est pas intégrée comme image de carte ; les SVG originaux restent en place. Prochaine étape : fournir cet asset optimisé pour l’associer à son modèle, puis brancher un historique de valorisation vérifiable si disponible. Documentation : design-system/terminal/POSITION_CARDS.md. Pas de déploiement ni de push effectué pendant cette passe.

---

# Synchronisation GitHub

Publication demandée par l’utilisateur sur origin : https://github.com/nielslecodeur/near_nft.git, branche main. Avant commit, récupération de l’état distant sans divergence : même historique de départ. Contrôle des fichiers candidats : 527 fichiers, environ 25 Mo, aucun fichier proche de la limite GitHub et aucun secret détecté par les motifs de clés privées/tokens et l’inspection des champs JSON sensibles. Les dossiers .research, .local, .impeccable/review, node_modules, dist, les variables privées et credentials restent ignorés ; les exports de coffre *-everkeep-encrypted.json sont également exclus.

Le commit regroupe les évolutions existantes du projet, les contrats et scripts associés, les pages terminal, Positions/Collection/Agents, les tests et la documentation. Dernières validations disponibles : build TypeScript/Vite réussi, 53 tests, 31 captures de parcours desktop/mobile et contrôle de sortie construite. Les opérations Git de cette passe ne déploient pas de contrat et n’envoient aucune transaction NEAR. La publication se fait par push normal, sans force ni réécriture de l’historique distant.

---

# Positions wallet, collection possédée et espace Agents

Demande : appliquer le terminal approuvé à Positions et Agents, avec une présentation de wallet DEX et une collection de cartes possédées. Les couleurs, polices, tokens et composants validés restent conservés ; aucun contrat, droit, coffre ou transport financier n’est modifié par cette passe.

Terminé : onglets Actifs/Collection accessibles au clavier, visibles en haut de Positions ; soldes NEAR/demoUSD du wallet séparés des actifs des comptes NFT ; recevoir par adresse publique, copie et lien NEAR ; aperçu NEAR approximatif à quatre décimales avec détail exact ; regroupement des actifs par contrat avec sommes bigint, sans conversion ni mélange d’actifs historiques ; données de retrait issues des gardes existants. Le tableau desktop se présente en lignes libellé/valeur complètes sur mobile.

Collection : cartes financées appartenant au wallet connecté, avec recherche insensible aux accents, filtres Toutes/Retrait possible/En vente, état, compte, actifs et échéance. Le cadre métallique réutilise la configuration JSON et l’illustration originale. Aucun NFT non possédé, rareté ou progression inventée. Consulter une carte ouvre les contrôles existants de retrait, autorisation et vente, avec focus restauré y compris pour la même carte.

Agents : trois expertises sélectionnables et tarifs réels du catalogue, panneau latéral desktop/choix compacts mobile, espace de demande, méthode, mode déterministe ou serveur et récapitulatif des coûts. Les confirmations et signatures restent celles des composants existants. Les contrôles ont préparé une demande de 50 demoUSD et 15 de réserve, ouvert puis annulé le récapitulatif avant toute signature.

Vérifications : npm run build réussi sous WSL (106 variables, TypeScript, Vite et trois entrées) ; 53 tests réussis, dont propriété/financement, NFT distincts, somme u128 exacte, actifs séparés, échéance et gel. Chrome 1440/390 : 31 captures et aucune erreur JS ; données réelles en lecture et adaptateur wallet QA refusant les signatures. Vue déconnectée, soldes, montant exact, réception, détails retrait/permissions/vente, collection/recherche/vide/inspection/clavier, agents/choix/demande/confirmation annulée testés. Scénario distinct de lecture de solde bloquée, erreur HTTP503 et reprise explicite ; la connexion de ce scénario se fait par le bouton UI pour éviter une course d’initialisation du test.

Revue indépendante : une correction demandée sur le tableau d’actifs mobile, puis scorée résolue après recapture de la même matrice, disposition ship au périmètre de ce correctif ; aucune régression observée dans ce lot. Rapport docs/results/workspaces-review.json. Un détecteur sur les sources modifiées et le CSS canonique : [], aucun second passage. DESIGN.md et son sidecar restent inchangés, extension conforme au système terminal existant.

Sources : src/terminal/PositionsWallet.tsx et owned-positions.ts ; adaptation de TestnetPositions, AgentConversation et du titre AgentMissions ; CSS canonique design-system/terminal/workspace.css généré vers src/terminal/workspace.css. Guide design-system/terminal/WORKSPACES.md et README actualisés. Test navigateur reproductible : npm run test:workspaces ; manifeste docs/results/workspaces-browser.json, captures docs/screenshots/workspaces ; contrôle de sortie construite dans docs/results/workspaces-build-smoke.json.

À examiner : http://127.0.0.1:5173/#positions et #agent. Les derniers contrôles n’ont envoyé aucune signature ni transaction financière. Prochaine validation avec l’utilisateur : ergonomie sur son wallet/navigateur ; les signatures réelles restent nécessaires pour certifier le parcours Intear. Aucun commit, push ou déploiement dans cette passe.

---

# Historique — Terminal Everkeep, étape 4 / 4, pages réelles

L’utilisateur a validé les trois premières étapes et demandé leur intégration aux pages, en conservant leurs choix. Le catalogue, ses fiches et la navigation réelle utilisent maintenant le terminal approuvé ; Positions et Agents héritent des surfaces, contrôles et typographies. Les composants et références des étapes 1–3 restent disponibles.

Terminé : header sticky avec recherche Cmd/Ctrl+K sur modèles et annonces vérifiées, connexion wallet existante, navigation qui conserve le contexte d’environnement ; bandeau de données réellement lues ; catalogue avec catégories/thèmes/disponibilité, filtres repliables, grille/liste, densité et tri exact des montants en bigint ; cartes JSON avec minimum de création ou prix de revente explicitement distingués ; fiches avec grand visuel, conditions et panneau de création/achat, composition cible/réelle, lien d’activité NEAR et historique explicitement indisponible. Aucun prix, volume, rendement, historique ou rareté n’est inventé. Les handlers financiers, confirmations et règles des contrats ne sont pas modifiés par cette passe.

Vérifications : npm run build réussi sous WSL (génération des 106 variables, TypeScript, Vite et trois entrées) ; 50 tests TypeScript réussis. Le premier lancement npm test sous Windows a rencontré le binaire esbuild Linux installé dans node_modules : relance dans l’environnement WSL cohérent, sans réinstallation ni changement des dépendances. Contrôle de la sortie construite à 1440/390 : Explorer, fiche modèle, Positions et Agents, deux polices Inter/IBM Plex Mono, fond correct et aucun débordement ni erreur JS ; rapport docs/results/terminal-pages-build-smoke.json.

Matrice navigateur réelle : 26 captures Chrome 1440/390, données testnet en lecture avec secours RPC. Connecteur wallet QA explicitement simulé, signataire refusant, aucune signature ou transaction envoyée. Recherche/raccourcis répétés/retour du focus, filtres, tri, grille/liste/densité, vide, modèle indisponible, récapitulatif de 25 demoUSD avant signature, fiche de revente avec prix vendeur distinct des actifs, historique absent, connexion et menu wallet, positions, agents et panne RPC vérifiés. Captures et manifeste : docs/screenshots/terminal-pages et docs/results/terminal-pages-browser.json. Les captures attendent le décodage des images et repartent du haut du document ; une course de focus du test attend maintenant le retour de focus différé du produit. Les tests utilisent clientWidth et vérifient aussi les limites gauche/droite/haut/bas du menu wallet.

Revue indépendante : trois correctifs demandés puis scorés résolus, disposition ship au périmètre des trois corrections : menu wallet mobile contenu et défilant, filtres initialement repliés sur mobile, boutons recherche/wallet/paramètres alignés. Rapport docs/results/terminal-pages-review.json. Détecteur exécuté une fois sur les sources modifiées et CSS canonique : [], aucun second passage. Le verdict ne certifie ni les contrats ni la signature réelle dans Intear.

Documentation : design-system/terminal/PAGES.md décrit l’intégration ; README et contrat des composants actualisés. DESIGN.md et son sidecar fusionnent le système terminal approuvé avec les règles produit durables, conformément à la réponse utilisateur qui demande de conserver les trois étapes. CSS des pages dans design-system/terminal/pages.css, généré vers src/terminal/pages.css ; ne pas éditer seulement la copie générée.

Point de présentation : http://127.0.0.1:5173/#explorer. Les opérations financières réelles restent à essayer avec l’utilisateur et ses signatures ; les métriques de marché/historiques nécessitent une source indexée avant activation. Aucun commit, push, déploiement, changement d’autorité ou manipulation de clé dans cette passe.

---

# Historique — étape 3 / 4, composants composés (validée)

L’utilisateur a validé l’étape 2 (« j’aime bien go étape 3 »). Composants réutilisables et référence à /design/components.html, toujours sans migration des pages ni modification des opérations financières. Les étapes 1/2 sont validées ; l’étape 3 doit être présentée avant de passer à la 4.

Implémenté : header sticky, recherche Cmd/Ctrl+K avec combobox et restitution du focus, indicateur NEAR testnet/gas non connecté et callback wallet ; ticker, tableau triable des collections et mini-courbes ; barre de statistiques ; inventaire contrôlé avec recherche/catégories/disponibilité, sidebar, grille/liste, densité et tri ; cartes NFT avec favoris temporaires, hover/zoom/élévation et action d’achat au focus/tactile ; blocs prix, courbe en aire Recharts, période et tableau accessible des points, propriétés et activité. Récapitulatifs d’interface achat/offre, sans envoi. Les offres restent explicitement inactives dans la marketplace existante.

CardFrame : quatre presets JSON (mat/métal/holo/réactif), palette limitée aux tokens, 1–3 calques, variables locales --mx/--my, tilt et parallaxe au pointeur, reflet et film conique, emplacement de flux. Les hausses/baisses sont simulées manuellement et nommées comme telles ; la variation change le contour et provoque une seule pulsation en 240 ms. Le parser refuse valeurs inconnues, opacités invalides et URLs distantes ; l’éditeur conserve le dernier thème valide. Tactile et mouvement réduit restent stables. Deux calques SVG géométriques originaux ajoutés et crédités, aucune image ou marque de marketplace reprise.

Corrections de la première passe : dimensions des sparklines séparées des icônes, style global limité aux SVG Lucide ; label wallet masqué correctement sur mobile ; filtres/densité/tri répartis en lignes lisibles ; libellés pour lecteurs d’écran ancrés localement pour empêcher leur débordement hors des zones défilantes ; test de largeur fondé sur clientWidth plutôt qu’innerWidth ; focus de l’image conservé à l’intérieur du cadre.

Validation finale : npm run build réussi après les corrections, avec trois entrées. Matrice complète sur la sortie construite à 1440/390 : 46 captures, aucune erreur JS/HTTP ni requête externe. Hover/zoom/élévation, clavier, répétition des raccourcis et retour du focus, filtres/densité, états de reprise, tilt/parallaxe, JSON invalide, pulsation unique de 240 ms, mouvement réduit, lecture clavier du graphe et hauteur stable en panne d’image vérifiés. L’observation de l’API d’animation dans le test remplace le sondage instable d’une pulsation déjà terminée, sans modifier le comportement produit. Suite primitives rejouée après extension de Dialog/styles : 20 captures réussies. Explorer existant se charge à 1440/390 sans nouveaux styles ni débordement.

Revue indépendante : relancée une fois après échec immédiat pour limite de quota. Revue complète de la référence avec source échantillonnée ; deux corrections demandées et appliquées : retour du focus après Cmd/Ctrl+K répété, et label synthétique déplacé sous le prix. Rebuild et recapture de la même matrice ; passage de verdict : deux correctifs résolus, disposition ship au périmètre de ces correctifs, aucune régression observée dans ce lot. Rapport docs/results/terminal-components-review.json. Détecteur exécuté une fois : aucun résultat JSON ; résolution statique des liens CSS /design incomplète, styles aussi scannés explicitement. Aucun second détecteur.

Source et documentation : src/terminal/market-components.tsx, market-metrics.tsx, CardFrame.tsx et card-theme.ts ; design-system/terminal/COMPONENTS.md, card-themes.json et components.css. Tokens : 106 variables, sans changer les choix validés. Les spécimens sont isolés dans demo-fixtures.ts, jamais des données de compte ou paramètres de transaction. DESIGN.md et son sidecar historiques sont conservés pendant cette extension. Aucune connexion/signature réelle de wallet ; aucun commit/push.

Point stable atteint : étape 3 prête à examiner sur http://127.0.0.1:5173/design/components.html. Rapports docs/results/terminal-components-browser.json et terminal-components-review.json ; captures docs/screenshots/terminal-components. Présenter cette étape puis attendre le retour utilisateur avant les pages et l’intégration métier (étape 4). Ne pas poursuivre automatiquement.

---

# Historique — étape 2 / 4, avant validation des primitives

L’utilisateur a validé les tokens puis demandé de continuer. Le travail porte sur l’étape 2 ; les composants composés et les pages attendent une nouvelle validation conformément à son processus.

Terminé : bibliothèque réutilisable dans src/terminal/primitives.tsx et primitives.css ; boutons/icônes, champs et sélection, checkbox/switch, onglets, menu, dialogue, infobulle, chiffres/statuts, surfaces/séparateur et retours chargement/succès/erreur/vide. Radix et Lucide sont épinglés. Référence interactive React à /design/primitives.html, entrée Vite construite aussi en production. Les styles des composants sont préfixés ek- ; le point d’entrée et les parcours métier restent conservés. Le JSON canonique compte 87 variables : les 74 validées et 13 neutres, dimensions et niveaux de superposition nécessaires aux contrôles. Deux familles locales seulement.

Corrections effectuées pendant la critique : mot-symbole noir remplacé par son masque en couleur de texte ; nom accessible du menu conservé malgré le label automatique de Radix ; action de récupération séparée du message ; mouvement réduit appliqué à la racine du dialogue ; police numérique et chiffres tabulaires ajoutés aux entrées décimales/numériques, y compris le montant de l’offre.

Vérifications finales : npm run build réussi (génération, TypeScript, Vite et deux entrées). Matrice complète de production rejouée après la correction à 1440 et 390, 20 captures et aucun appel externe ni erreur JavaScript/HTTP. Cibles de 44 px, deux fontes, chiffres tabulaires y compris dans le champ monétaire édité, états occupé/désactivé, survol/appui/focus, onglets et menus au clavier, piège/restitution du focus du dialogue, Échap, annuler/appliquer, validation des champs, recherche/sélection/checkbox/switch, erreur/vide et mouvement réduit vérifiés. Explorer existant se charge aux deux largeurs, sans application des nouveaux styles et sans débordement.

Revue indépendante : revue complète de la référence puis une correction demandée sur la typographie du champ monétaire. Passage de verdict sur cette correction : résolue, disposition ship au périmètre du correctif. Rapport docs/results/terminal-primitives-review.json. Détecteur lancé une seule fois : sortie JSON vide, résolution statique des liens CSS absolus HTML incomplète et documentée. Aucun second passage ni exception silencieuse. DESIGN.md et son sidecar historiques sont conservés pendant cette extension isolée.

Documentation : design-system/terminal/PRIMITIVES.md et README.md ; rapports docs/results/terminal-primitives-browser.json et terminal-primitives-main-smoke.json ; captures docs/screenshots/terminal-primitives. Aucun wallet, ordre ou paiement testé dans cette référence ; les montants sont des spécimens explicitement illustratifs. Aucun commit/push.

Point stable atteint : étape 2 prête à examiner sur http://127.0.0.1:5173/design/primitives.html. Arrêt ici conformément au processus utilisateur. Prochaine étape après son retour : étape 3, composants composés de marketplace et architecture CardFrame pilotée par JSON ; puis étape 4, pages et intégration aux parcours existants. Ne pas poursuivre automatiquement.

---

# Historique — étape 1 / 4, avant validation des tokens

Nouvelle demande : approche OpenSea/Blur/Magic Eden et terminal DeFi, avec arrêt obligatoire après chaque étape. **Seule l’étape 1 est réalisée. Attendre le retour utilisateur avant les primitives.**

Livré : source design-system/terminal/tokens.json, 74 variables CSS générées, planche /design/tokens.html, quatre surfaces exactes #07080C/#0D0F16/#141722/#1C2030, accent Everkeep #B5F36B, sémantiques hausse/baisse, échelle 4/8, rayons 8/12/20, durées 180/200/240ms et easing demandé. Bordures6%, reflet intérieur5%, ombres douces, grain/grille discrets et un halo limité à l’introduction. Deux polices locales : Inter et IBM Plex Mono ; logo existant vectorisé depuis Space Grotesk600/.18em pour préserver ses formes sans charger une troisième famille.

La planche est une proposition isolée. Les écrans métier, contrats, paiements et données de marché restent inchangés. Les chiffres présentés sont explicitement des spécimens typographiques. Aucune primitive produit, CardFrame, page trading, flux ou statistique fictive n’a été ajouté. Les styles globaux DESIGN.md et .impeccable/design.json historiques sont conservés pendant cette validation.

Vérifications : build TypeScript/Vite réussi avec génération automatique ; Playwright1440 et390, 2captures, exactement2fontes chargées, quatre surfaces et trois rayons, chiffres tabulaires, focus clavier, lien44px, aucun débordement ni erreur JavaScript. Contrastes texte/secondaire/hausse/baisse>=4,5sur les quatre fonds ; on-brand>=4,5. Réduction des animations ramène les transitions à0. Débordement initial du libellé RGBA mobile corrigé par retour à la ligne. Revue indépendante : ship au seul périmètre de la proposition étape1, aucune correction matérielle. Détecteur exécuté1fois :7avis,4avertissementsInter/DESIGN historique, justifications documentées.

Références : design-system/terminal/README.md ; docs/results/terminal-tokens-browser.json et terminal-tokens-review.json ; captures docs/screenshots/terminal-tokens. npm run design:tokens régénère les sorties ; npm run build le fait en prébuild. Aucun paquet UI ajouté ; l’outil Brotli temporaire pour vectoriser le logo reste dans .research ignoré, les SVG livrés sont autonomes.

Prochaines étapes après validation :2primitives,3composants composés (dont CardFrame piloté par JSON),4pages. À chaque étape : application, captures1440/390, critique/correction et présentation, puis arrêt. Ne pas poursuivre automatiquement ni publier. Aucun commit/push de cette étape.

---

# Explorer catalogue — 4 novembre 2026

Demande courante : refondre la présentation d’Explorer en catalogue visuel inspiré des principes de découverte d’OpenSea, en conservant Orbite et les opérations financières. Guide : docs/explorer-catalogue.md. Cette section remplace la présentation précédente d’Explorer ; les travaux historiques restent ci-dessous.

Terminé : titre court, recherche, création/achat séparés, catégories et thèmes issus des données, grille responsive (jusqu’à quatre colonnes, trois pour les trois vrais modèles, deux sur tablette, une sur petit mobile). Ancienne introduction et manège retirés d’Explorer. Cartes recto-verso explicites : image/titre ouvrent la fiche, composition au clic, aucune rotation au survol. Focus logique, faces inert/aria-hidden, hauteur stable ; interaction immédiate au clavier, sur petit mobile et en mouvement réduit. Trois SVG éditoriaux originaux avec crédits et sources, sans copie d’images OpenSea ni affiliation suggérée.

Données : adaptateur de présentation distinct de l’autorité financière ; compositions cibles et actifs réellement comptabilisés séparés, sources de configuration/chaîne, date de lecture, démonstration et absence de valorisation inventée explicites. Diversification et Crypto restent indisponibles ; Réserve demoUSD est ouverte selon les règles existantes. Seules les annonces réellement actives, financées et cohérentes avec le vendeur et le compte gelé sont affichées. Aucun nouveau produit, actif, rendement, volume ou historique fabriqué.

Parcours conservés : fiche complète, frais/risques/retrait/permissions avant signature, historique via explorateur, connexion et reprise du modèle/montant, création et règlement d’achat par les transports existants. Défaut d’affichage découvert et corrigé : le récapitulatif achat reconvertissait un prix humain de 11 demoUSD en 0,000011 ; il affiche désormais exactement 11. Les arguments financiers ne changent pas. Test navigateur renforcé sur la valeur entière, pas une sous-chaîne.

Vérifié : npm test (50 tests) et npm run build (TypeScript + Vite) réussis. Suite catalogue réussie : 23 captures à 390/768/1440, images et panne d’image, recherche/filtres combinés, aucun résultat, clic/toucher/clavier, focus et inert, stabilité des hauteurs, réduction des animations, fiches et reprise de création via adaptateur wallet public, prix d’achat exact avant signature. Rapport docs/results/catalogue-browser.json. Suite UX précédente adaptée aux nouveaux contrôles et réussie également (30 captures, Agents/Mes positions/reprise RPC compris). Détecteur lancé une fois : avis visibles de typographie/rayons face au DESIGN historique ; sortie tronquée, aucune certification globale de détection revendiquée.

Revue indépendante terminée : verdict ship sur le périmètre UI/UX, aucune correction matérielle demandée ; les 23 captures sont valides. La première revue interrompue avant retour a été remplacée par une revue fraîche. Rapport docs/results/catalogue-review.json.

Limites : lectures testnet réelles conservées au même bloc final via Intear RPC ; configuration RPC de l’application inchangée. Connexion testée avec un adaptateur public, sans fenêtre/signature financière réelle Intear. Aucune nouvelle création financée, mission payée, vente ou retrait envoyé pendant cette tâche. Les preuves financières précédentes restent distinctes de la refonte. Services frontend 5173 et worker 8793 relancés après leur arrêt entre les sessions ; santé HTTP vérifiée. Nouvelle exécution de npm run test:catalogue après relance : réussie avec les 23 captures et aucune erreur JavaScript. Scan de secrets : 341 fichiers non ignorés, aucun résultat identifié. Aucun backend/contrat/clé/permission financière modifié ; aucun commit/push de cette tâche. DESIGN.md et son sidecar historiques sont préservés malgré leur décalage préexistant avec Orbite.

---

# Parcours UX guidés — 4 novembre 2026

Demande courante : simplifier connexion → création → retrait, sans nouvelle fonctionnalité financière ni modification des contrats ou positions. Voir docs/ux-guided.md.

Terminé : navigation Explorer / Mes positions / Agents ; choix agent ou modèle en premier accès ; création et achat dans deux onglets distincts ; cartes et fiches séparées ; récapitulatif direct Choisir → Vérifier → Signer et créer, capital et frais distincts, autorisation explicite. Connexion contextualisée et reprise du modèle/montant/vérification sans signature automatique ; préférences publiques uniquement en sessionStorage. Financement de test et retour à la demande. Agents commence par le champ, trois exemples, expertise compacte, explications gratuites, demande structurée conservée après connexion.

Mes positions expose actifs, fonds engagés et montant réellement retirable. Détails Retirer / Gérer l’agent / Vendre ; montant et destinataire avant retrait ; verrouillage, dénouement, transmission des contraintes et gel de vente expliqués. Les actions existantes et les contrôles du contrat sont conservés. Reprises et coffre local chiffré de la tranche précédente restent en place.

Vérifié : 47 tests TypeScript et npm run build (tsc + Vite) réussis ; test navigateur du coffre, capacité, refus/reprise synthétique et reçus finaux réussi. Matrice navigateur 390/768/1440, 30 captures : découverte, connexion via adaptateur public et retour, revue de création, financement et retour, annonces réelles et revue de vente, position nifelst.testnet de 25 demoUSD, retrait réellement verrouillé, demande agent et reprise après RPC429 simulé. Cas de retrait à échéance explicitement simulé, callback UI seulement. Scan de secrets : 325 fichiers, aucun résultat au dernier relevé ; aucun secret affiché.

Revue indépendante : trois corrections demandées (libellé trompeur de fermeture, erreur wallet flottante, cartes coupées à 768 px), appliquées ensemble ; verdict ship limité aux trois corrections, toutes résolues après les 30 recaptures ; rapport docs/results/guided-ux-review.json. Orbite préservé ; 14 avis du détecteur concernent la typographie/rayon du DESIGN historique, sans réparer cet écart documentaire hors périmètre.

Limites : pas de nouvelle création financée, mission payée, distribution de faucet, vente ou retrait réellement envoyé dans cette tâche ; pas de test des fenêtres/signatures réelles Intear. Le RPC Fastnear a réellement renvoyé 429 ; le harnais utilise des réponses de lecture testnet Intear protocole88 mises en cache au même bloc final, sans modifier la configuration de l’application. Retrait réel toujours bloqué au 11 novembre 2026. Prochaines vérifications : signature/refus Intear réel, financement nécessaire, création jusqu’au NFT, achat/vente entre comptes puis dénouement/retrait à échéance. Aucun contrat modifié/déployé ; aucun commit/push effectué.

---

# Agents simplifiés — point stable du 4 novembre 2026

Dernière demande utilisateur : réduire les validations wallet à deux pour le parcours normal et supprimer le JSON obligatoire. Accord explicite reçu pour un coffre local chiffré avec mot de passe et export facultatif. Cette section et docs/agent-ux-simple.md remplacent les instructions historiques de stockage exclusivement en mémoire, téléchargement obligatoire et wallet CLI.

Terminé : conversation en premier, proposition compacte après paiement avec un seul bouton de création, détails techniques et méthode repliés, devis et analyse combinés dans une transaction, création regroupée dans une seule demande Intear. Les signatures ML-DSA sont préparées localement sur les générations/nonces attendus, puis réellement vérifiées par les contrats inchangés. Worker d’exécution/réconciliation sans nouvelle signature financière utilisateur. Chaque reçu du groupe est vérifié et conservé ; aucun renvoi automatique d’un résultat inconnu. Coffre AES-GCM/PBKDF2 durable avant financement, verrouillé au rechargement ; export/restauration dans Options. Anciennes sauvegardes compatibles, importation unique éventuellement nécessaire pour les anciennes clés jamais persistées. Aucune clé native utilisateur au backend.

Expiration traitée sans contournement : nouveau devis explicitement payant, réutilisation du compte déjà provisionné, annulation de l’ancien mandat et consentements neufs ; aucun second paiement de 6 NEAR. Ce parcours a effectivement permis à nifelst.testnet de terminer sa position de 25 demoUSD, Active avec NFT/index confirmés ; 75 demoUSD extérieurs au relevé. Rapport public conversation-user-testnet.json. Les signatures de ce compte utilisaient encore le précédent parcours séquentiel.

Preuve séparée du nouveau regroupement : compte de démonstration contrôlé everkeep-demo-mw1yii9b-1.testnet, NFT m9e003090a22e5e-0.reserve-v3.everkeep-dev-mw0weth5.testnet, 14 demoUSD financés. Deux appels de validation (devis+paiement, puis six transactions de création). Répéter invest conserve deux appels ; zéro téléchargement JSON. Rapports grouped-agent-proof.json et grouped-native-qa.json avec hashes réels. Adaptateur de signataire QA limité à ce compte/ces routes, arrêté après test ; pas une preuve des fenêtres réelles d’Intear. Clés et sauvegardes QA uniquement hors dépôt.

Vérifications : 45 tests TypeScript, types et build Vite réussis ; coffre persistant/rechargement/mauvais mot de passe/autre propriétaire/importation, journal/refus/reprise et reçus négatifs testés dans un navigateur isolé. Captures du nouveau parcours à 390/768/1440, clavier et réduction de mouvement, états expiré/succès et réglages ; fixtures de rendu annoncées. Détecteur : zéro constat principal, 45 avis liés notamment au DESIGN historique. Revue visuelle indépendante : premier retour fix (sélecteur réseau mobile et coût ambigu après expiration), corrections appliquées ; verdict ship limité au passage F1–F2, tous deux notés résolus ; aucune certification du wallet externe. Aucun nouveau test Rust ou scénario WASM sandbox revendiqué : contrats inchangés, preuves historiques distinctes.

Préparatifs précédents conservés : NEAR Connect sans terminal utilisateur, soldes réels, accueil/faucet limité demoUSD, deux positions de seed réelles et annonce Démonstration Everkeep, relance du seed sans doublon, lecture paginée des annonces à bloc final identique. Un seul modèle opérationnel, deux configurations indisponibles ; pas de six faux produits. Services frontend5173 et worker8793 relancés ; aucune ancienne sandbox réinitialisée. Guide et scripts disponibles dans package.json. Aucun commit/push de cette reprise.

À vérifier encore : deux fenêtres réelles d’Intear sur le nouveau parcours, sur mobile physique également ; achat/revente testnet entre utilisateurs ; dénouement/retrait à l’échéance du 11 novembre 2026. Le coffre ne synchronise pas les appareils : conserver son mot de passe et une copie facultative pour changer de navigateur. Aucun mainnet ni droit de récupération administrateur.

---

Historique antérieur conservé :

# État stable — 4 novembre 2026

Tranche testnet réelle livrée : NEAR Connect 0.12.0, connexion navigateur NEAR CLI avec restauration, NEAR et demoUSD réseau séparés, création directe et par mission, signatures ML-DSA navigateur chiffrées et sauvegardées hors dépôt. Quatre contrats keyless neufs ; aucun déploiement ancien modifié. Deux positions de 10 et 35 demoUSD, toutes deux Active et financées. L’annonce à 9 demoUSD a été annulée, aucun NFT actuellement publié par ce compte.

Marketplace / Mes positions / Agents, trois catégories et trois modèles aux règles distinctes. Liquidité opérationnel en démonstration ; Diversification et Crypto indisponibles. Les agents proposent et ne peuvent investir sans les deux consentements ML-DSA et le dépôt exact. Sans backend IA : démonstration déterministe affichée.

Vérifications : 36 tests TypeScript réussis, types et build Vite réussis ; lecture réseau des quatre code hashes/keyless et du mandat ; parcours navigateur réel création 10, List/CancelListing, devis/paiement/livraison puis investissement 35. Captures des trois pages à 390/768/1440 px, clavier Home/End, grille et mouvement réduit ; refus demoUSD/NEAR insuffisants, panne RPC et réseau incompatible (fixture négative explicite). Sauvegarde chiffrée restaurée dans un navigateur isolé : deux clés récupérées, mauvais mot de passe et autre propriétaire refusés. Rapports publics dans docs/results/testnet-*.json. Les 58 tests Rust et 19 scénarios WASM missions antérieurs restent des preuves sandbox datées, pas des tests reroulés pendant cette reprise frontend.

Lancer : wsl -e bash scripts/web.sh puis, second terminal, wsl -e bash scripts/testnet-worker.sh. Guide complet, comptes, contrats, financement et emplacement des sauvegardes : docs/testnet.md. Clés natives dans ~/.near-credentials/testnet, profil/sauvegardes navigateur dans C:/Users/niels/.near-wallets, aucun secret dans Git.

Reprise de vente corrigée : lecture publique indépendante de la paire NFT/index et choix de la méthode de finalisation, sans réémission du prix. Deux tests de réconciliation et deux captures d’erreur simulée complètent la preuve ; aucun achat testnet à deux utilisateurs revendiqué.

Prochain parcours : achat/revente entre deux utilisateurs sur testnet puis retrait après échéance du 11 novembre 2026 à 17:38:02 Europe/Paris. Meteor n’a pas de validation de création/signature ici (Cloudflare) ; le fallback CLI navigateur a été exécuté. Aucun adaptateur crypto/multi-actifs ajouté, aucune récupération administrateur ou résultat inconnu assimilé à un remboursement. Revue visuelle indépendante : disposition ship sur les neuf captures puis sur les deux captures de reprise supplémentaires, aucun correctif matériel demandé. Build final et 36 tests réussis après la correction de reprise. Rapport docs/results/testnet-review.json. Contrôle des fichiers suivis ou non ignorés : aucun littéral de clé privée détecté ; .local, .research, .env.local et captures ignorés.

---

Historique antérieur, conservé :

# Marketplace des trois agents — point stable, 3 novembre 2026

Brief 8aec45a9 implémenté dans le dépôt existant. Contrat `missions` keyless pour devis/prix figés, séquestre natif NEAR, délai depuis paiement, livraison/échec/remboursement exclusifs, créances fixes et callbacks privés idempotents. Trois profils configurables : TradFi 0,015 NEAR, Crypto 0,02, Liquidité 0,01, valeurs de démonstration. Stockage de devis 0,05 NEAR, gas et capital demoUSD séparés. Demande privée salée, chiffrée hors chaîne sous capacité par compte/navigateur ; aucun contenu privé complet sur chaîne. Worker en processus de données sans clé propriétaire, mode déterministe sans API et adaptateur HTTPS optionnel validé, non configuré lors des essais.

Trois méthodes effectives, propositions structurées et contrôles indépendants : concentration réelle par actif/stratégie, contrats/risques documentés, échéances et réserve. Allocations + réserve = budget entier exact ; exclusions, versions, minimums, horizon, liquidité, capacité et expiration contrôlés. L’abstention ne déclenche aucun investissement. Le paiement d’analyse n’est pas un mandat. Après examen, le propriétaire signe le mandat existant ET le consentement ML-DSA propre à la mission ; le contrat de missions désigné comme agent exécute via la collection existante. Un NFT par souscription, confirmations wallet/index et reprise par opération sans doublon. Aucun changement de format ou migration des wallets/collections existants dans cette extension.

Interface Orbite dans Agent : Choisir un agent / Ma mission / Historique ; devis, attente, échec, remboursement réel, abstention, permissions, dépôt et exécution séparés. Progression conservant le paiement lors d’un échec et montrant l’investissement facultatif/partiel/confirmé ; historique distinguant proposition, abstention et NFT, avec capacité privée manquante explicite. Styles locaux, système visuel global historique préservé. Revue indépendante : deux correctifs demandés, appliqués et tous deux notés résolus ; verdict ship limité à ces corrections, sans audit des contrats. Captures finales recoupées aux mêmes largeurs.

Tests exécutés : 58 Rust (26 wallet, 20 collection, 12 missions), 30 TypeScript, build TypeScript/Vite réussi. WASM `artifacts/missions.wasm` construit avec cargo-near. Preuve réelle isolée de 19 contrôles, dont paiement/rejeu, livraison non autorisée, signatures altérées/montant/nonce et rejeu, deux routes dont une reprise partielle, retrait worker refusé, remboursement unique, délai et transfert prestataire échoué puis payé une fois. Rapport docs/results/agent-missions.json. Chrome réel à390/768/1440 : paiement en NEAR, consentements ML-DSA, 70 demoUSD déposés et NFT confirmé, 30 disponibles, mission distincte échouée/remboursée, abstention, historique, reprise après rafraîchissement et Escape/focus. Treize captures dans agent-missions-ui.json ; deux captures explicitement fictives pour les résultats historiques partiels et privés, zéro commande, dans agent-missions-states.json. Ancien parcours Orbite revérifié en lecture seule sur trois routes/trois largeurs, ainsi que les cinq états réseau/catalogue/capacité. Avertissements transitifs Vite util/eval et warnings Rust historiques toujours présents.

Services conservés : interface5173, ancienne session Orbite8791 avec ses positions et soldes inchangés ; nouvelle session de missions8792, sans migration. Les tests navigateur créent des positions de test distinctes. Ne pas redémarrer ces services pour actualiser : leurs clés sont éphémères. README, .env.example, PRODUCT.md et documentation de protocole mis à jour. Les commandes npm demo:agents, test:missions et test:missions:browser sont disponibles. Les tests historiques utilisent ?session=orbite pour cibler explicitement8791. Aucun commit/push ni déploiement externe de cette passe.

Prochaines étapes avant usage distant : authentification wallet et récupération des capacités, coffre et reprise durable des clés/tâches, isolation OS du worker, réconciliation des transferts natifs inconnus, validation d’un véritable adaptateur puis déploiement testnet audité. Ces composants ne sont pas annoncés comme livrés. Le MVP fonctionne en sandbox avec des actifs sans valeur ; il ne gère ni argent réel, ni gestion autonome continue, ni achats/ventes secondaires par l’agent.

Les sections suivantes décrivent les étapes antérieures.

# Orbite et import Vite — 3 novembre 2026

Direction01 sélectionnée et implémentée sur l’interface existante : palette noir vert/ivoire/vert vif, Space Grotesk + Inter locales sous OFL, ellipse et cartes verticales, positions existantes consultables en lecture sans les confondre avec des annonces, fiche de l’agent déterministe et informations tarif/permissions. Les contrats, fonds, échéances et services existants ne sont pas modifiés ni redémarrés par cette passe. La stratégie unique n’est pas dupliquée et les noms de concepts du triptyque ne sont pas annoncés comme des offres.

Erreur Vite signalée pendant l’implémentation : l’import ./orbite.css avait précédé la création de la feuille. Le fichier src/orbite.css est maintenant une implémentation réelle, avec nom/casse correspondant exactement à SeriesApp.tsx ; aucune ancienne version suivie dans Git à restaurer. Import conservé, overlay actif, autres feuilles conservées. Styles des trois routes, formulaires, panneaux, états, polices, scène et breakpoints couverts. Un chevauchement de satellites observé à 768 px a été corrigé par la composition en une colonne dès1000px.

Vérifications : 24 tests TypeScript réussis, build TypeScript/Vite réussi ; avertissements transitifs util/eval préexistants. Chrome réel : neuf captures à390/768/1440 sur Explorer, Mes positions et Agent ; CSS renvoyée en200, fontes chargées, aucun overlay Vite ni erreur JS, pas de débordement horizontal. Choix d’agent au clavier, méthode/tarif, consultation de position en lecture, Escape/focus, grille et réduction des animations contrôlés ; zéro commande financière. Rapport docs/results/orbite-ui.json. Les différences de fontes avec le DESIGN.md historique et les alertes de fontes courantes du détecteur sont les choix explicitement prescrits par le brief utilisateur ; aucune substitution de palette ou de police n’est justifiée par ces alertes.

Documentation propre à Orbite dans docs/orbite-direction.md et PRODUCT.md. Les fichiers globaux DESIGN.md/sidecar restent préservés ; leur mise à jour globale n’est pas nécessaire pour corriger l’import Vite. Pas de commit/push ou déploiement. Les sections ci-dessous sont historiques.

# Marketplace de positions NFT — point stable, 3 novembre 2026

Brief 392344b3 appliqué dans le dépôt existant. Trois objets distingués : stratégie (mandat versionné), position NFT (compte individuel et actifs), annonce (cession du contrôle à prix fixe, prix séparé du capital). Navigation Explorer / Mes positions / Agent ; menu compte pour wallet, réseau et sécurité. Catalogue Stratégies / Positions en vente, une seule stratégie réelle, manège sans doublon ni autoplay, grille et version mobile. Le composant est testé avec plusieurs éléments uniquement dans un banc explicitement fictif. Surface blanche/vert forêt cohérente sur les trois routes ; identité géométrique héritée par les positions. DESIGN.md historique conservé, tokens actuels dans docs/marketplace-mvp.md.

Terminé : souscription « Créer une position » et récapitulatif exact avec mandat/version/contrats/limites, consultation des données individuelles et de l’activité liée, annulation depuis la position, rotation, annonces détaillées, date réelle du gel pour les nouveaux wallets et absence explicite sur les anciens, affichage/réclamation de créances fixes. Les clés et droits de contrôle restent imposés par les contrats existants. Le seul ajout de métadonnée wallet est sale_valuation_at, dans un espace borné sans changement de racine Borsh. Aucune migration ou suppression d’échéance. Le parcours de planification n’est pas monté. README, modèle, protocole de règlement et limites mis à jour.

Vérifications exécutées : 46 tests Rust (26 wallet + 20 collection), 24 TypeScript, build officiel des cinq WASM, TypeScript et Vite réussis. 33 contrôles WASM série/marché, dont deux acheteurs concurrents réels, paiement vendeur unique et remboursement du perdant, création invalide puis dépôt remboursé, mauvais prédécesseur FT, auto-achat et contournement NFT refusés ; 41 contrôles historiques de transfert/hook et 11 contrôles agent réexécutés. Le scénario complet atteint l’échéance et Bob retire 100 après la vente à97. Coûts dans les rapports, uniquement sandbox. Avertissements transitifs util/eval et warnings Rust préexistants conservés ; aucun lint zéro avertissement revendiqué.

Chrome : parcours réel dépôt100, allocation10, refus de plafond, dénouement, rotation, listing/annulation, vente97 àBob ; mandat/escrow/exécution agent25 distincts et révocation/remboursement10. 21 captures vérifiées à390/768/1440, trois routes, clavier, réduction des animations, états pending/refus/succès. Lecture seule finale sans commande ; cinq états HTTP de rendu ; cercle/flèches/swipe/grille/clavier sur fixtures isolées. Rapports docs/results/mvp-flow.json, mvp-ui.json, mvp-carousel.json, marketplace-states.json, series-demo.json, sandbox.json, agent-subscription.json. Revue indépendante : **ship au scope frontend fourni**, 21 captures ouvertes, aucun correctif matériel demandé ; pas un audit exhaustif de sécurité.

Incident d’environnement à la reprise : tous les services WSL précédents étaient arrêtés ; leurs clés de démonstration en mémoire ne peuvent pas être reconstituées. Leurs données sur disque n’ont pas été supprimées ni migrées et leurs sources restent distinctes, mais ces anciennes sessions ne sont pas restaurées. Ubuntu bloquait même sur echo ; sa terminaison ciblée puis relance a rétabli l’exécution. Nouvelle session distincte sur8791, UI5173, lancées sans fenêtre visible. La session actuelle contient la position100 deBob et la position25 d’Alice issues des vrais tests ; ne pas la réinitialiser pour une retouche UI. Les comptes techniques non financés ne sont pas annoncés comme des NFT émis.

Une première preuve a rencontré une transaction de transport expirée juste après fast-forward. Le harness attend maintenant la convergence de l’ancrage finalisé via settleSandboxFinality avant d’envoyer la transaction suivante, sans rejouer une transaction possiblement acceptée. La preuve33 a ensuite réussi.

À poursuivre avant testnet financier : signataire et nouveau déploiement, login externe, fautes d’accusés/callbacks perdus, course achat/annulation et échéance pendant règlement, reprise automatique sûre d’un Funding ambigu. Toute issue inconnue garde son verrou. Pas de mainnet, fonds réels, faux rendement, intégration OpenSea, commit/push ou publication externe. Les sections suivantes décrivent les étapes historiques.

# Explorer NFT — catalogue recentré, 3 novembre 2026

Dernier brief appliqué : présentation sobre inspirée de SuperRare et Zora, références réellement ouvertes sous Chrome. Explorer met en avant l’achat d’un NFT à échéance : visuel SVG original vert forêt, nom, minimum et échéance ; conditions et montant dans une fiche. Revente contient uniquement les annonces effectives. Navigation Explorer / Mes NFT ; l’outil Agent existant est secondaire, accessible dans l’aide et Mon compte. Ancien manège et deux concepts indisponibles retirés du catalogue. Surface blanche/verte limitée à Explorer, système global DESIGN.md conservé ; tokens et choix dans docs/explorer-marketplace.md et PRODUCT.md. Contrats et contraintes financières inchangés.

Vérifications terminées : 23 tests TypeScript, tsc et build Vite réussis ; avertissements transitifs util/eval préexistants. Chrome réel à 320/390/768/1440 px, catalogue et fiche sans débordement, contrôle clavier/Escape/restauration du focus, réduction des animations et minimum d’achat. Parcours réel : Alice achète un nouveau NFT de 20 demoUSD, le propose à 19, Bob l’achète ; les NFT financés déjà présents conservent leur propriétaire. Aucun redémarrage de chaîne/API. Cinq états de rendu testés séparément (chargement, réseau indisponible/reprise, aucune émission, souscription fermée, capacité dépassée), zéro commande envoyée. Rapports docs/results/marketplace-ui.json, marketplace-flow.json, marketplace-states.json. test:browser cible maintenant le catalogue ; test:explorer:legacy conserve l’ancien test du carrousel.

Revue indépendante : quatre corrections demandées et résolues (visuel séparé du lettrage, masquage du lien clavier, approche typographique, vérité produit). Verdict ship limité à ces quatre corrections, pas une certification globale. Les captures fraîches ont été revues après correction. Les différences de palette/type/arrondis avec DESIGN.md sont des avis du détecteur documentés comme choix de cette seule surface.

Prochaines étapes produit : définir les véritables offres de contrats/obligations et leurs conditions avant de les afficher comme disponibles ; enrichir le catalogue quand ces offres existent, puis reprendre l’outil Agent. Restent aussi les validations intercontrats et le déploiement testnet déjà listés ci-dessous. L’offre actuelle est exclusivement une démonstration demoUSD sans valeur ; les achats testnet restent désactivés. Aucun commit/push ou déploiement dans cette passe. Services locaux existants conservés. Les sections suivantes décrivent les étapes antérieures.

# Explorer / Mes positions / Agent — 3 novembre 2026

Nouveau brief b86e2827 appliqué dans le dépôt existant. Navigation3vues, sous-sections Stratégies/Revente, menu compte/Sécurité. Manège circulaire au toucher/clavier, grille, réduction des animations, une stratégie de démo et deux concepts explicitement indisponibles. Retrait historique sans échéance conservé, collections anciennes lisibles même sans nouveau catalogue, source locale précédente séparée et jamais annoncée comme restaurée si inactive.

Nouveau mandat de souscription on-chain : proposition pure, signature ML-DSA, séquestre exact propriétaire, exécution unique par l’agent, annulation clôturant les reçus tardifs et remboursement fixe. Aucun droit autonome d’achat/vente secondaire. Sécurité montre clé/version/génération et plafonds/expiration ; rotation réelle avec preuve de nouvelle clé. Échéances des positions existantes conservées.

Vérifications exécutées :45tests Rust,23TypeScript, build officiel WASM et Vite. Preuve agent-subscription.json sur vrais WASM, scénario série27contrôles et référence historique41contrôles relancés avec les nouveaux binaires. Parcours Chrome explorer-ui.json complet : proposition sans POST de dépense, mandat/dépôt/exécution, rotation, révocation/remboursement et achatBob. Fixtures UI séparées explorer-edge-ui.json : historique sans échéance, mandat expiré, source inactive, lisibilité320/390/768px. Le glissement tactile réel est aussi vérifié en Chrome via CDP par le reviewer. Revue indépendante : six correctifs demandés et appliqués ; verdict ship au périmètre de ces corrections, sans audit des contrats. Aucune publication, aucun push ni déploiement externe.

Nouvelle API8790, interface5173 ; session de vérification8789 conservée avec ses quatre positions financées. L’ancienne source8788 n’était pas active à l’inspection ; le client l’explique sans prétendre restaurer ses clés. Le protocole financier testnet reste désactivé ; aucun login externe ni transaction testnet revendiqué. Anciennes limites de fautes intercontrats dans option2-validation.md toujours applicables. La nouvelle session8790 a également passé le parcours navigateur complet ; ses souscriptions restent ouvertes, les anciennes échéances restent inchangées. Les sections ci-dessous sont historiques.

# Everkeep — progression

## Option 2 — reprise du 3 novembre 2026

Le brief « fusion limitée » remplace le produit d’épargne libre et ses projections. Implémentation dans le dépôt existant, sans déploiement externe ni push.

Terminé dans le code : série unique à règles immuables et empreinte/version, administration ML-DSA limitée à configuration initiale/fermeture, capacité/minimum/fenêtre, préparation du compte avant capital, dépôt unique et mint après crédit, verrouillage absolu du capital, mandat de série au-dessus de la délégation révocable, allocations interdites après échéance. Nouvelle revente à prix fixe : gel, empreinte, consentement acheteur, séquestre, transmission puis synchronisation, créance fixe, tentatives de paiement idempotentes, annulation et expiration clôturant les commits tardifs. Interface réduite à trois vues, connexion wallet conservée, journal réel, API de séries séparée sur8788. Aucun objectif annuel, projection ou catalogue technique dans les trois vues.

Exécuté : baseline21 tests Rust et41 contrôles WASM ; première preuve règlement9 contrôles ; scénario série complet avec achat97 et retrait100 après fast-forward ; parcours Chrome de bout en bout et quatre largeurs sur trois routes. Rapports datés dans docs/results/settlement-feasibility.json, series-demo.json et series-ui.json. Suite étendue :40 tests Rust et20 TypeScript réussis ; build Vite et Clippy terminés après correctifs (avertissements conservés, pas de lint zéro avertissement revendiqué).

Revue indépendante : composition cohérente ; corrections demandées et appliquées pour UUID de commande/idempotence après réponse perdue, validation des données avant rendu, skip link, sélecteurs44px et confirmation des montants/destinataires. Verdict indépendant ship au scope des six correctifs UI vérifiés ; pas de certification des contrats. Le parcours navigateur étendu a réussi le2novembre à23:30UTC : neuf contrôles, dont perte réelle de réponse HTTP puis reprise du mêmeUUID sans deuxième dépôt. Les vues remplies de Bob et du marché sont également vérifiées à320/390/768/1440px à23:33UTC (series-responsive.json). Le scénario de série27 contrôles a réussi à23:28UTC. Les époques longues accélèrent seulement le fast-forward du runtime de sandbox. Les coûts mesurés sont ceux de sandbox, pas de testnet. Pas de signataire testnet configuré dans le workspace.

À poursuivre/valider : matrice complète de fautes intercontrats (callbacks perdus, courses réelles, échéance pendant règlement), reprise automatisée sûre de Funding ambigu, nouveau déploiement testnet et coûts réels, opérations financières testnet. Ces dernières restent désactivées. docs/option2-validation.md précise chaque limite. Nouvelle collection obligatoire : pas d’upgrade ni migration administrative des fonds des anciens comptes. Les sections ci-dessous sont historiques et ne décrivent pas le nouveau produit.

# Everkeep — point stable

Mise à jour du 2 novembre 2026 après reprise. Le prototype local complet est enregistré dans `C:/Users/niels/OneDrive/fintech/projet/near_hack`. Dépôt Git local sur `main`, remote `origin` : `https://github.com/nielslecodeur/near_nft.git`. Les commits et leur synchronisation se vérifient avec `git status -sb` et `git log -1`. Aucun site publié, déploiement ou transaction testnet, mainnet ou fonds réel.

## Recomposition éditoriale et Portfolio — dernière demande

Le nouveau brief remplace explicitement la palette et la direction précédentes. Référence nearhackathon.com réellement examinée sous Chrome à 1440 et 390 px, avec captures stabilisées ; analyse et contrat de direction dans docs/art-direction-v2.md.

Terminé : nouvelle présentation asymétrique papier/encre/bleu, Public Sans + IBM Plex Mono locales, schéma interactif propriétaire/NFT-compte/agent à trois étapes, section bleue d'exemple financier, explication de l'agent, catalogue en liste, nouvelle identité NFT et langage partagé par les sept vues. Portfolio ajouté avec positions exactes, fonds réservés, gains reçus, proposition admissible, limites du mandat, accès aux commandes existantes et journal de session filtrable. Pas de faux agent autonome ni d'intégration DeFi externe annoncée. Ancien canvas et styles forêt supprimés ; commande test:forest conservée comme alias de test:art.

Vérifications : 16 tests TypeScript ; revue navigateur à 320, 390, 768 et 1440 px sur les sept routes, et six largeurs pour les parcours complémentaires ; focus/clavier, confirmations, erreurs, grands montants/copier exact, données incomplètes et réduction des animations. Contrastes ciblés minimum 5,39. Parcours réel sandbox complet réexécuté le 2 novembre à 22:16 UTC, 12 étapes réussies dont allocation, refus de plafond, révocation, rotation et transfert. Contrats inchangés. Rapports actuels docs/results/art-direction-v2.json, browser.json, ui-quality.json, frontend-design.json, nft-workspace.json, portfolio-ui.json.

Clôture terminée : revue indépendante **ship**, 17 captures V2 et deux états difficiles examinés, aucun correctif matériel demandé ; code échantillonné, pas d'audit exhaustif. DESIGN.md et .impeccable/design.json actualisés au système papier/encre/bleu, tokens et JSON vérifiés, ancien DESIGN sauvegardé localement dans .research/art-direction/. Dernier TypeScript/build Vite réussi ; avertissements transitifs util/eval inchangés. Aucun lint configuré. README explicatif de l'agent et de l'investissement sur NEAR demandé POUR PLUS TARD ; ne pas confondre démo NEAR locale et futurs protocoles de rendement réels. Pas de commit/push ni déploiement dans cette passe. Serveurs de l'utilisateur conservés.

Les sections suivantes sont historiques ; cette section et docs/art-direction-v2.md décrivent la direction actuelle.

## Passe UI/UX actuelle — 2 novembre 2026

Présentation et application séparées par routes partageables. Présentation forêt, exemple explicite Alice → Bob et scène arrêtée par défaut ; application ivoire/anthracite/vert profond, soldes et gains réellement reçus distincts des objectifs et projections. Récapitulatifs avant confirmation, révocation confirmable, champs et fermeture verrouillés pendant l'envoi, garde immédiate contre les doubles soumissions. Formatage exact BigInt, refus des états API incomplets, état de compte en attente expliqué et actions financières bloquées. Historique filtrable, chargement, erreur avec données conservées et nouvelle tentative.

Vérifications actuelles : 16 tests TypeScript réussis, TypeScript et build Vite réussis ; parcours complet de 12 opérations navigateur sur vraie sandbox ; contrôles clavier, focus, chargement, réduction des animations, NFT/écosystème, erreurs injectées et six largeurs 320–1440 px réussis. Les contrats sont inchangés et leurs preuves Rust/sandbox ci-dessous restent historiques. Détails et portée : docs/ui-review.md, docs/results/ui-quality.json. Aucun lint configuré. Les avertissements de dépendances `util` et `eval` persistent.

Revue indépendante terminée : premier verdict fix, puis ship sur les quatre corrections demandées, toutes résolues (grands montants, limite de précision de projection, icônes SVG, direction documentée). Cette validation porte sur les corrections, pas sur un nouvel audit complet. Contrastes ciblés vérifiés : six rôles de texte, minimum 5,02. Système visuel extrait dans DESIGN.md et .impeccable/design.json ; JSON relu et valide. Aucun commit/push ni déploiement dans cette passe. Les serveurs locaux déjà ouverts ont été conservés. Les captures temporaires sont ignorées par Git. Les sections plus anciennes ci-dessous décrivent les étapes antérieures ; cette section fait autorité pour l'UI actuelle.

Prochaines étapes hors de cette passe : validation sur téléphone physique et wallet testnet externe, puis revue de sécurité et adaptateurs externes avant toute utilisation hors démonstration. Aucun testnet externe ni fonds réel utilisé ici.

## Préparation GitHub

Envoi du code autorisé par l’utilisateur. Le dépôt distant ne présentait aucune référence lors de `git ls-remote` et `git fetch origin`, donc aucun historique à remplacer. Push normal uniquement, sans force. Identité définie pour ce dépôt seulement : `nielslecodeur <nielslecodeur@users.noreply.github.com>`.

Le `.gitignore` exclut recherches, dépendances, builds frontend, fichiers `.env` (sauf `.env.example`), coffre de clés local, credentials NEAR, clés privées et journaux. Les fixtures cryptographiques et rapports conservés contiennent uniquement des clés publiques, signatures et résultats de test. Le contenu à versionner est contrôlé avant commit ; aucun credential de connexion GitHub n’est inclus.

Le `.gitattributes` impose les fins de ligne LF pour conserver les scripts Bash fonctionnels après clone sous Windows ; les WASM restent binaires.

## Terminé

### Direction vert forêt inspirée de la référence demandée

Site `https://nearhackathon.com/#top` examiné dans Chromium (mise en page, styles et scène animée). Nouvelle direction Everkeep : fond vert nuit, surfaces forêt, accents menthe, Public Sans en titres larges et navigation compacte en haut. `LivingPlan` ajoute un NFT-compte en particules, rotation au pointeur/clavier, modes explicatifs Compte/Permissions/Transmission, pause, recentrage et lien direct au tableau. Géométrie et code originaux ; aucun actif du site de référence copié.

La réduction des mouvements est respectée ; le rendu se suspend hors écran/onglet masqué. Aucune transaction déclenchée par le schéma. Vérifications Chromium : 7 contrôles forêt, contrôles clavier/projections/modales existants et 7 contrôles NFT/ressources passent sur six largeurs, sans erreur JS. Rapports `docs/results/forest-ui.json`, `frontend-design.json` et `nft-workspace.json`. Les contrats et leurs permissions restent inchangés. Documentation actuelle : `docs/frontend-design.md`. Modifications locales, sans push ni publication externe.

### Passeport NFT et ressources NEAR

Les 15 ressources de la liste ont été cartographiées avec leurs liens officiels, usages envisagés et limites dans `docs/ecosystem.md` et `packages/shared/ecosystem.ts`. Ajout des vues **NFT du plan** (identité réelle chargée, soldes, générations, export sans secret, accès au transfert existant) et **Écosystème** (filtres et état explicite des intégrations). Le passeport n’est ni une preuve signée ni une nouvelle métadonnée on-chain. Aucun contrat ou droit d’agent modifié.

Contrôle réel de `GET /v0/tokens` Intents : 210 actifs au relevé, sans quote, adresse de dépôt, swap ou transaction. La documentation du vérificateur annonce l’absence de déploiement testnet : aucune exécution cross-chain n’est revendiquée. Les services d’IA payants n’ont pas été appelés. HEAD Git et documents : `docs/results/ecosystem-sources.json` ; capacité : `docs/results/ecosystem-capabilities.json`.

Vérifications de cette tranche : 9 tests TypeScript réussis, build TypeScript/Vite réussi, 7 contrôles navigateur NFT/ressources réussis sur six largeurs avec snapshot inchangé et aucune erreur JavaScript (`docs/results/nft-workspace.json`). Les 21 tests Rust/41 contrôles sandbox restent les preuves historiques des contrats inchangés, pas de nouveaux tests exécutés dans cette tranche. Aucun push ni déploiement externe.

### Refonte frontend

Direction « carnet de patrimoine » bleu pétrole/blanc minéral/doré, Newsreader et Public Sans hébergées localement avec licences. Simulation interactive horizon/taux/versements et inspection du graphique, sans modifier mandat ou fonds. États de lecture/signature/attente/succès/erreur ; mouvements et changements de permissions expliqués à partir des snapshots réels. Focus des modales, retour au déclencheur, lien d’évitement, clavier et réduction des animations pris en charge.

La refonte conserve les contrats existants. Vérifications frontend et procédures : `docs/frontend-design.md` ; rapports `docs/results/browser.json` et `docs/results/frontend-design.json`. Les serveurs de démo préexistants ont été réutilisés et conservés pour l’aperçu ; le processus sandbox supplémentaire lancé pendant le travail a été arrêté. Aucun déploiement ni push de cette refonte n’a été effectué.

Résultats de la refonte : 6 tests TypeScript réussis, compilation TypeScript/Vite réussie, 12 parcours métier Chromium sur sandbox réelle, chargement réel et 7 contrôles de design/accessibilité réussis sur six largeurs (320, 390, 650, 768, 1024 et 1440 px). Aucune erreur JavaScript. Les scripts Chromium désactivent l’accélération GPU pour stabiliser les captures headless locales. La connexion/signature d’un wallet externe testnet reste non vérifiée.

- Sources officielles et compétence NEAR réellement étudiées, commits/licences consignés dans `docs/references.md`.
- Cinq contrats Rust : wallet sans access key, collection/factory, demoUSD, stratégie à réserve préfinancée et receiver adversarial de test.
- Vérification ML-DSA-65 réelle dans le host NEAR ; JSON canonique, domaines, expiration, nonces et générations. Rotation avec signature courante et preuve de nouvelle clé.
- Consentement destinataire lié à son véritable compte NEAR. Transmission sans déplacement d’actifs, retrait de l’ancien mandat et synchronisation wallet/collection. Méthodes NFT de collection avec autorisation signée ; transfer_call accepté et rejeté, gel du destinataire temporaire et retour sécurisé.
- Dépôts/retraits FT, allocation et rachat réel du principal ; réservation avant promesse, callbacks privés/idempotents, blocage prudent des résultats inconnus et conservation comptable.
- Agent déterministe en français, mandat imposé sur chaîne avec plafonds opération/jour/allocation, expiration et révocation. Interface d’adaptateur future séparée des droits on-chain.
- Interface React/Vite française responsive, historique corrigé sans doubles succès, erreurs lisibles, objectifs et projections distincts des gains réels. Vérification wallet/collection au même bloc final.
- Surveillance Vite adaptée aux écritures Windows/WSL, sans parcourir les clones de recherche ; port strict 5173 pour conserver l’Origin de l’API.
- Signataire local scrypt + AES-256-GCM ; Wallet Selector pour le relais testnet ; scripts de préparation/déploiement testnet, build, tests et démo. Aucun secret privé dans le frontend ou les rapports.
- README, architecture avec diagrammes Mermaid, menaces, crypto, transfert, guide de démo et tests actualisés. README de scaffold remplacés et scripts de transformation ponctuels retirés de `scripts/`.

## Vérifications effectuées

| Vérification | Résultat |
|---|---|
| Build officiel cargo-near des cinq WASM | Réussi ; empreintes `docs/results/build.json` |
| Tests Rust de la version finale des contrats | **21 réussis**, fixture cryptographique indépendante et cas adversariaux ; journal `.research/rust-tests.log` |
| Formatage Rust | `cargo fmt --all -- --check` réussi |
| Tests TypeScript après dernières retouches | **16 réussis** |
| TypeScript et build Vite après dernières retouches | Réussis ; avertissements transitifs `util` / `eval` documentés |
| Intercontrats sandbox réelle | **41 vérifications réussies**, motifs précis des refus ; `docs/results/sandbox.json` |
| Chromium après dernières retouches UI | **12 parcours**, sandbox vivante, aucune erreur JS, mobile sans débordement ; `docs/results/browser.json` |
| Contrôle UI complémentaire | Initialisation Wallet Selector testnet non connecté, historique français sans doublons, desktop sans débordement ; `docs/results/ui-smoke.json`. Aucune connexion/signature testnet |
| Audit npm du lockfile final | **11 faibles, 0 modérée/élevée/critique** ; `docs/results/audit.json` |
| RPC testnet | Protocole 88 annoncé ; lecture de capacité seulement, `docs/results/testnet-capability.json` |

Mesures du scénario : mandat 3,84 Tgas ; wallet WASM 221 782 octets ; stockage 224 158 octets. Bornes vérifiées et détails dans `docs/testing.md`. Les rapports concernent des exécutions locales, pas un audit ou une validation testnet.

## Blocages résolus

Les sauts d’horloge WSL perturbaient la finalisation : une horloge ancrée sur le temps monotone est injectée uniquement dans le processus sandbox par `scripts/sandbox-env.sh`, sans modifier l’horloge système ni la cryptographie. Le lanceur direct remplace near-workspaces, retiré.

Un build cargo brut omettait `--cfg near` et masquait les motifs de rejet. Le build officiel `cargo near build non-reproducible-wasm --locked --no-abi` corrige ce problème ; les tests sandbox valident désormais les raisons de refus exactes. Aucune substitution de signature n’a été utilisée.

## Relancer

Les serveurs de QA sont arrêtés au point final pour libérer les ressources. Depuis ce dossier, dans deux terminaux PowerShell :

```powershell
wsl -e bash scripts/local-demo.sh
# Dans un second terminal
wsl -e bash scripts/web.sh
```

Puis ouvrir `http://127.0.0.1:5173`. Le premier terminal doit afficher la réussite du scénario et l’écoute API avant de charger le compte. Installation initiale et signataire : `docs/demo.md`.

## Prochaines étapes possibles

1. Revue du code et des limites avant soumission au hackathon ; enregistrer une vidéo avec le parcours du guide.
2. À la demande explicite de l’opérateur, déployer sur des comptes testnet neufs avec les seuls fonds de test, puis vérifier les flux Wallet Selector/signataire et les transferts NFT sur testnet. Le script est préparé mais ce parcours n’est pas validé ici.
3. Avant toute utilisation hors démo : revue de sécurité indépendante, traitement des dépendances signalées et stratégie explicite pour les callbacks inconnus et pertes de clés. Une intégration DeFi externe demande un adaptateur et une revue supplémentaires.

## Limites à conserver

demoUSD n’est pas un dollar ; la réserve est un rendement de test préfinancé, distinct de l’objectif annuel de 4 %. Pas de protocole DeFi externe, LLM, recovery, burn, upgrade, multi-actifs ni sécurité quantique de bout en bout. NFT : consentement et memo signé obligatoires, pas de marketplace universelle ni de conformité Sharded NFT Items. Les envois FT directs sans callback ne sont pas crédités. Les résultats asynchrones inconnus restent bloqués sans administrateur de déblocage. Prototype non audité, impropre à une épargne réelle.
