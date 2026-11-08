> Extension du 5 novembre 2026 : [autorités et limites des paniers](thematic-baskets.md#autorités-et-signatures). La formule fictive est compilée, sans service de prix ni réserve de gains. Seuls les tokens réellement disponibles peuvent être retirés après clôture signée ; le frontend ne fixe aucun gain payable. Les contrôles de transfert/révocation et les anciennes maturités restent conservés. Code non audité.

> Parcours courant (4 novembre 2026) : [Agents, deux validations financières](agent-ux-simple.md). Avec l’accord explicite de l’utilisateur, les clés ML-DSA et capacités sont désormais conservées uniquement sous forme chiffrée dans un coffre IndexedDB local ; le mot de passe et les clés déchiffrées restent en mémoire. Export externe facultatif. Devis/paiement combinés puis création groupée dans Intear ; résultats finaux vérifiés et inconnus non rejoués. Les passages historiques ci-dessous décrivent les étapes antérieures. Contrats inchangés dans cette tranche.

> Mise à jour testnet du 4 novembre 2026 : création et mission sont exécutées sur le réseau public de test, avec transport wallet natif et autorisations ML-DSA navigateur. Les clés sont hors dépôt et sauvegardées chiffrées. L’opérateur local détient uniquement sa clé native ; un client compromis ou une XSS pendant le déverrouillage reste une menace. La capacité d’analyse n’autorise aucun investissement : deux consentements ML-DSA et le dépôt exact sont contrôlés sur chaîne. Les assertions historiques ci-dessous de testnet désactivé ne s’appliquent plus au parcours décrit dans [testnet.md](testnet.md).

## Missions d’analyse payées

Le paiement de l’analyse ne donne aucun droit sur les demoUSD. Le contrat keyless `missions` choisit une seule branche livraison ou remboursement, réserve les transferts natifs avant promesse et ne réouvre une créance qu’après échec connu. Une livraison atteste le protocole, pas la qualité du conseil. L’opérateur peut livrer une analyse médiocre ; le client doit l’examiner avant de consentir à une allocation.

Le worker n’a ni clé ni objet de signature. Ses entrées et celles de l’adaptateur sont non fiables ; les sorties passent un validateur indépendant puis une relecture de catalogue/capacité avant toute autorisation. Les permissions d’investissement exigent le mandat wallet existant et une signature ML-DSA distincte liant mission, empreintes, contrats, montant, version, nonce, expiration et générations. Le worker natif ne peut pas contourner le contrat de missions pour consommer le séquestre, retirer ou agir sur le marché secondaire. Le financement et l’index NFT sont relus avant confirmation ; une opération incertaine n’est jamais assimilée à un échec remboursable.

La confidentialité est limitée : documents AES-GCM hors dépôt, engagement salé sur chaîne, capacité porteur dans le navigateur. La machine locale et le service signataire sont de confiance ; choix Alice/Bob et origine HTTP ne sont pas une authentification distante. Le processus worker ne constitue pas une isolation OS face à un exécutable malveillant. Serveur actif compromis/XSS peuvent exposer une capacité ; un adaptateur configuré reçoit la demande. Reprise durable des clés/tâches, authentification wallet distante et réconciliation des transferts natifs inconnus restent hors MVP. Détails et tests dans [agent-missions.md](agent-missions.md).

## Mandat de souscription d’agent

Une discussion ou proposition ne signe aucune transaction. L’agent n’obtient qu’un dépôt initial exact vers le token, la stratégie et le bénéficiaire liés au wallet. Les domaines ML-DSA, nonce, générations et version couvrent cette autorisation. Le hook FT exige le propriétaire prévu et réserve la capacité avant transfert. Le seul agent désigné peut passer Authorized à Funding, une fois.

La révocation signée laisse une tombstone ; elle ne rembourse pas un financement déjà engagé. La créance reste liée au propriétaire initial. Une clé classique ne peut pas contourner cette annulation par `pause_agent` pendant un mandat de souscription. Une rotation ou un transfert est bloqué tant que ce mandat reste en attente. L’agent ne possède aucun droit autonome sur le marché secondaire.

Le nouvel affichage historique peut lire un état gelé cohérent, mais le mode financier de vérification refuse toujours cet état. Une session locale inactive n’est jamais annoncée comme restaurée par une nouvelle chaîne. Les secrets du signataire de démo sont éphémères et ne sont fournis ni au navigateur ni au module de proposition.

## Menaces nouvelles : séries et séquestre

- Élargissement administratif : seule configuration initiale avant ouverture, sans item préexistant, puis fermeture signée ; aucune modification de termes, de maturité ou de fonds. Clé admin ML-DSA vérifiée par le host.
- Retrait anticipé ou agent trop puissant : échéance et limites immuables dans le wallet, indépendantes de la délégation du propriétaire. Révocation/pause n’ouvrent aucun retrait.
- Vente et double remboursement : capital gelé avant annonce ; prix accepté par hook détachant les promesses ; transfert confirmé et index correspondant avant créance vendeur. Un commit gagne sur abort. Aucun remboursement fondé sur un timeout ou un simple owner lu.
- Résultat FT ambigu : conservation de Funding/Paying ou du verrou ; indisponibilité possible plutôt que double dépense. Les reprises automatiques manquantes sont une limite réelle, pas une promesse de récupération.
- Souscription répétée après réponse HTTP perdue : UUID lié aux paramètres, registre local sans éviction et état de commande conservé ; une nouvelle tentative ne réexécute pas le même identifiant. Limité à la durée de cette sandbox, détruite au redémarrage.
- État RPC/API malformé : validation u64/u128, dates et structures avant rendu ; alerte de reprise au lieu de soldes inventés.

La matrice de fautes n’est pas exhaustive : voir option2-validation.md. Le marché n’est activé que dans la démo locale ; aucune validation testnet ou certification n’est revendiquée. Les références historiques d’objectif annuel/projection ci-dessous sont retirées de l’interface actuelle.

# Modèle de menace

Les signatures sont vérifiées dans un vrai host NEAR. Cela ne protège ni un poste de signature compromis, ni une perte totale des clés, ni tous les composants classiques du réseau. Le prototype n’est pas audité et n’accueille aucun fonds réel.

| Menace | Protection et limite |
|---|---|
| Ancien propriétaire | Epoch et versions renouvelées, nonces, suppression du mandat et aucune access key du wallet |
| Vendeur qui conserve une clé | Bob doit générer sa propre clé et enregistrer lui-même son consentement ; le protocole ne peut pas prouver qu’une clé n’a jamais été copiée |
| Relais classique ou déployeur | Relayer ne remplace pas la preuve ML-DSA ; contrats sans clé, sans upgrade ni méthode d’ajout de clé |
| Agent compromis | Route FT/stratégie fixée, plafonds par opération/jour UTC/allocation, expiration, générations, révocation ; pause classique autorisée uniquement pour réduire les droits |
| Rejeu ou modification | Domaine réseau/wallet/collection/NFT, JSON canonique, nonce strict, expiration et paramètres exacts signés |
| Faux FT, item ou callback | Predecessor réel contrôlé, namespace immédiat et callbacks privés |
| Appels concurrents et remboursement double | Réservation avant promesse, identifiant de pending et callbacks idempotents ; résultat ambigu conservé bloqué |
| Receiver temporaire hostile | Gel maintenu pendant le hook ; retrait même valablement signé refusé ; retour avec nouvelles générations |
| Index NFT désynchronisé | Gel et accusé ; client lit wallet/collection au même bloc final et compare epoch/séquence |
| Faux rendement | Réserve de demoUSD préfinancée et transferts vérifiables ; objectif annuel et projection clairement séparés |
| Signataire local exposé | API sandbox en loopback avec Origin exact et JSON obligatoire ; seulement personnages de test. Signataire testnet hors frontend, scrypt + AES-256-GCM |

## Risques résiduels

Le FT et la stratégie sont des contrats explicitement choisis, pas un protocole DeFi indépendant. Le rejet d’un résultat inconnu privilégie la conservation comptable et peut bloquer durablement un plan. Pas de déblocage administrateur, récupération après perte totale, burn ou upgrade. Un envoi FT direct sans `ft_transfer_call` n’est pas crédité et n’a pas de mécanisme de rescue. L’agent est déterministe ; aucune inférence LLM n’est revendiquée.

Un dépôt technique NEAR couvre gas et stockage, distinct du capital demoUSD. Les consentements enregistrés occupent du stockage ; les montants fixes ont été mesurés pour ce prototype, pas pour une exploitation ouverte. Le chiffrement local n’est pas un portefeuille matériel. Les limites et alertes de dépendances figurent dans [les tests](testing.md).
