# Option 2 : preuves et limites

Actualisation marketplace du 3 novembre 2026 : 46 tests Rust, 24 TypeScript, build réussi. `series-demo.json` contient **33 contrôles WASM**, dont deux acheteurs concurrents réels, remboursement exact du perdant, auto-achat refusé, création ML-DSA invalide suivie d’un dépôt remboursé et gel non contournable via les deux méthodes NFT. Les suites historiques 41 et agent 11 ont aussi été réexécutées. Chrome : `mvp-flow.json` ; détails et limites dans [le périmètre actuel](marketplace-mvp.md). Aucune opération financière testnet activée.


Les résultats ci-dessous décrivent des exécutions, pas un audit externe. Les rapports JSON sont datés ; un ancien rapport ne prouve pas automatiquement un changement ultérieur.

| Chemin | Preuve disponible |
|---|---|
| Base historique | 21 tests natifs initiaux et 41 contrôles intercontrats historiques |
| Séquestre / transmission / créance vendeur | `settlement-feasibility.json`, neuf contrôles en vrais WASM |
| Série / dépôt / mandat / vente / échéance | `series-demo.json`, vrais WASM et signatures ML-DSA, fast-forward du runtime |
| Callback dupliqué, achat occupé, annulation après engagement, paiement ambigu | Tests Rust `market_tests` et tests wallet ; certains résultats de promesses sont injectés dans le host natif |
| Parcours utilisateur complet | `series-ui.json`, Chrome réel et API sandbox réelle, trois routes à quatre largeurs |
| Réponse malformée | Tests TypeScript du parseur et vérification navigateur indépendante |
| Login externe et signature financière testnet | Non exécutés ; pas de signataire de déploiement configuré dans ce workspace |

La preuve native de callback ne remplace pas une faute réellement provoquée entre shards. L'échec de paiement du vendeur est réellement provoqué en WASM : Alice désenregistre son stockage FT, Bob reçoit le contrôle, le prix reste dû à Alice, puis Alice se réenregistre et reçoit exactement une fois le prix.

## À compléter avant d'activer des opérations testnet

- Injection systématique de perte/échec à chaque étape, notamment accusé de synchronisation perdu et callback de versement perdu.
- Course achat/annulation en vrais reçus. La course entre deux achats est désormais validée en vrais WASM ; les autres transitions restent aussi testées nativement.
- Échéance atteinte pendant une transmission engagée ; le protocole clôture un commit tardif par un abandon durable, mais cette course précise n'a pas encore été exercée en WASM.
- Reprise automatique sûre d'une souscription dont le resolver FT n'a pas livré un résultat interprétable. Elle reste `Funding` avec capacité réservée et aucun remboursement spéculatif.
- Déploiement d'une **nouvelle** collection de série sur testnet, suppression de ses clés de déploiement, exécution des signatures réelles et mesure de coûts sur ce réseau.
- Connexion à un wallet externe avec une collection déployée ; la connexion de compte et le lecteur NFT existent, les opérations financières testnet restent désactivées dans la nouvelle interface.

## Données, réserves et reprise locale

Le serveur de séries est limité à `127.0.0.1:8791`, Origin exact localhost/127.0.0.1 sur 5173, POST JSON obligatoire. Il signe uniquement les personnages Alice/Bob/agent de sa propre sandbox avec des clés éphémères gardées en mémoire. Il ne reçoit ni ne manipule de clé testnet utilisateur.

Les commandes possèdent un UUID lié à leurs paramètres. Un résultat déjà terminé renvoie l'état actuel sans réexécution. Un résultat échoué ou encore engagé ne peut pas être réexécuté sous cet UUID. Le registre n'évince aucune commande : après 1 024 commandes, il faut recréer la sandbox. Une vérification de disponibilité après lecture du corps empêche deux POST simultanés de passer le verrou avant leur parsing.

Un redémarrage détruit la session locale et crée une nouvelle chaîne, pas une reprise des anciens fonds. Le journal est un journal de session. Le bouton d'échéance appelle uniquement `sandbox_fast_forward` ; aucun contrat ne possède de fonction administrative de voyage temporel.

Les scénarios de séries configurent `epoch_length=10000` dans leur genesis de sandbox. Le runtime doit produire des blocs à chaque frontière d'époque pendant un fast-forward ; les époques très courtes de `--fast` rendaient le parcours inutilement lent. Cette configuration accélère le test sans modifier les timestamps depuis le contrat, les conditions de retrait, ni une chaîne externe. Les tests historiques gardent leur genesis par défaut.

Les 6 NEAR par compte sont une réserve technique de démonstration, pas une commission ni un montant ajouté au capital demoUSD. Le contrat conserve 0,05 NEAR pour le stockage de factory et l'enregistrement FT ; le reste finance le compte sans access key. Aucun retrait de cette réserve technique n'est exposé. Les premières réserves de liquidité et les soldes des personnages sont des fonds de genesis sandbox.

Les contrats de série sont un nouveau format d'état sans upgrade. Les déploiements historiques, créés sans `admin_key`, conservent leur comportement de plans libres pour les tests de référence ; ils ne sont jamais présentés comme des séries à échéance. La nouvelle interface n'envoie pas de dépôt direct à ces anciens contrats.
