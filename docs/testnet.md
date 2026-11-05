> Interface actuelle : [deux validations financières et coffre chiffré facultativement exportable](agent-ux-simple.md). La position utilisateur nifelst.testnet est maintenant confirmée avec 25 demoUSD ; son wallet conserve 75 demoUSD au relevé. Le récit de création interrompue ci-dessous est historique.

# Everkeep sur NEAR testnet

Le parcours navigateur fonctionne avec de vrais comptes, signatures, reçus et soldes testnet. Aucun fonds mainnet. Le modèle Liquidité utilise un jeton demoUSD propre au projet, sans valeur monétaire. Les modèles Diversification et Crypto restent indisponibles : leurs adaptateurs ne sont pas implémentés.

## Démarrer

Depuis la racine du dépôt, avec Node 24 :

```bash
npm ci
npm run dev
# Dans un second terminal, avec les credentials opérateur déjà présents :
npm run testnet:worker
```

Sur ce poste Windows, utiliser le même environnement WSL que pour l’installation :

```powershell
wsl -e bash scripts/web.sh
# Second terminal : le lanceur ajoute Node à PATH.
wsl -e bash scripts/testnet-worker.sh
```

Ouvrir http://127.0.0.1:5173. Le mode par défaut est testnet ; aucune donnée sandbox ne remplace une lecture réseau échouée. La démo locale reste accessible avec `?mode=local` et son serveur distinct sur 8792. Une ancienne sandbox arrêtée ne restaure pas ses clés éphémères en démarrant une nouvelle chaîne.

Configuration publique centralisée : `packages/shared/network.ts`, adresses et empreintes dans `public/testnet.json`. Le RPC FastNEAR testnet est utilisé ; le RPC public historique a renvoyé des erreurs 429 sans CORS pendant les essais. Une panne affiche une erreur, jamais un solde fictif.

## Wallet navigateur courant

Utiliser **Intear**, réseau testnet. Le compte **nifelst.testnet** a été réellement vérifié ; il a reçu 5 NEAR supplémentaires du faucet et 100 demoUSD. L’utilisateur a confirmé la connexion et les soldes, signé le devis puis payé l’analyse ; le contrat confirme sa livraison. Le compte NFT et ses deux autorisations ont été créés avant une fermeture du wallet, sans dépôt de capital à ce point. Voir le [guide de conversation et de reprise](conversation-wallet.md) pour le suivi courant.

NEAR Connect 0.12.0 reçoit les résultats d’Intear automatiquement. NEAR CLI est exclu du sélecteur courant : aucune commande ni référence de transaction à recopier. Meteor annonce testnet dans le manifeste, mais son site est resté bloqué par Cloudflare ici ; aucune signature Meteor validée.

L’ancien compte **everkeep-niels-mw0wq5r0.testnet**, ses positions et ses sauvegardes sont préservés. Les preuves historiques obtenues via NEAR CLI Connect décrivent un ancien transport de signature, pas le parcours courant. Ses credentials CLI restent hors dépôt dans ~/.near-credentials/testnet ; ils n’ont pas été importés dans le wallet de nifelst.testnet.

## Clés et sauvegardes

Le wallet transporte la transaction native ; une clé ML-DSA supplémentaire autorise les actions sensibles. Les nouvelles clés et capacités privées restent seulement en mémoire, avec export local AES-GCM/PBKDF2-SHA256 (310 000 itérations), avant financement. Après rechargement, restaurer la dernière sauvegarde chiffrée avec le mot de passe dédié. Les anciens enregistrements IndexedDB chiffrés sont lus sans être supprimés ; aucune nouvelle écriture privée n’y est faite. Aucune seed ni clé native demandée par Everkeep.

Les anciennes sauvegardes de QA sont hors dépôt dans C:/Users/niels/.near-wallets/backups. La déconnexion verrouille le signataire. La perte du fichier et du mot de passe n’a pas de récupération administrateur.

## Contrats

Tous sont enfants de **everkeep-dev-mw0weth5.testnet**, nouvel opérateur de démonstration. Les anciens déploiements n’ont pas été modifiés.

| Rôle | Compte |
|---|---|
| Collection / modèle | reserve-v3.everkeep-dev-mw0weth5.testnet |
| demoUSD | demousd-v3.everkeep-dev-mw0weth5.testnet |
| Stratégie | strategy-v3.everkeep-dev-mw0weth5.testnet |
| Missions | missions-v3.everkeep-dev-mw0weth5.testnet |

Le script de contrôle compare code hash, absence de clés, mandat et route aux valeurs publiées. Le protocole observé est 88. Une signature ML-DSA réelle a configuré le modèle ; d’autres ont autorisé les annonces et l’investissement de mission.

## Financement reproductible

Pour un autre utilisateur, `npm run testnet:user` crée un nouveau compte via le helper du faucet officiel si le compte enregistré n’existe pas. Il conserve d’abord sa clé **hors dépôt**, puis vérifie existence et solde réseau ; un nom proposé seul n’est jamais annoncé comme créé. La connexion navigateur reste une étape distincte.

Pour des NEAR supplémentaires, utiliser le [faucet documenté par NEAR](https://docs.near.org/getting-started/faucet). Le faucet NEAR ne distribue pas le demoUSD propre à Everkeep.

```bash
# Inspection préalable ; avec le credential opérateur externe.
npm run testnet:grant -- votre-compte.testnet 100
# Complète le solde vers 100 demoUSD, ne rajoute pas 100 à chaque lancement :
npm run testnet:grant -- votre-compte.testnet 100 --execute
# Réserve de rendement simulé : complément idempotent vers 1 000 demoUSD.
npm run testnet:reserve -- --execute
```

Les scripts refusent un credential dans le dépôt. Ne placer aucune clé dans `.env` ou dans une variable `VITE_`. `.env.example` ne contient que des paramètres publics et des noms de variables serveur.

Pour un déploiement sur un parent neuf, après les tests contrats et le build officiel :

```bash
npm run testnet:bootstrap
npm run testnet:deploy                 # inspection uniquement
npm run testnet:deploy -- --execute    # quatre nouveaux contrats keyless
```

Le déploiement refuse tout code différent déjà présent et n’ajoute aucune méthode d’upgrade. Il nécessite environ 12,9 NEAR de provision des contrats, puis du gas. Ne pas relancer pour prolonger l’échéance : les termes existants sont immuables. L’ancien fichier `deploy-testnet.ts` délègue désormais à cette version pour éviter un déploiement incompatible.

## Modele operationnel

Modèle **liquidity-v3**, version 1, catégorie Liquidité. Dépôt initial unique, minimum 10 demoUSD, capacité 10 000 demoUSD. Clôture le **10 novembre 2026 à 17:38:02 Europe/Paris**, échéance le **11 novembre 2026 à 17:38:02**. Après clôture aucune nouvelle souscription ; les positions persistent.

Le modèle copie ses termes et l’empreinte du mandat dans chaque compte. L’allocation de gestion continue reste plafonnée à 20 %, à 10 demoUSD par opération et 20 par jour UTC ; la mission testée utilise un **mandat de dépôt initial distinct**, exact et à usage unique. Aucun agent n’est activé automatiquement par une création directe.

Cette stratégie est une réserve de test préfinancée, sans rendement de marché. Le capital ne peut être retiré avant l’échéance ni avant dénouement du principal et des opérations pendantes. Une annonce ne garantit pas d’acheteur.

Les deux autres modèles ont des règles distinctes consultables, mais aucun contrat d’allocation actif : multi-actifs pour Diversification, adaptateur et documentation crypto pour Crypto. L’agent Crypto reste un analyste des risques du catalogue de démonstration, sans accès implicite à d’autres protocoles.

## Scénario vérifié

1. Connexion du wallet CLI depuis le navigateur, restauration après rechargement, lecture NEAR et demoUSD au bloc final.
2. Création directe : provision technique 6 NEAR, enregistrement stratégie 0,02 NEAR, dépôt unique **10 demoUSD** ; vérification compte financé et NFT. Pas d’annonce automatique.
3. Mise en vente à 9 demoUSD avec autorisation ML-DSA, apparition dans Communauté, puis annulation signée et disparition de l’annonce. Les 10 demoUSD sont conservés.
4. Mission Liquidité : devis **0,05 NEAR de stockage**, analyse **0,01 NEAR**, budget envisagé 50 demoUSD. Paiement et proposition déterministe livrés sur testnet.
5. Validation distincte : compte neuf, sauvegarde chiffrée, mandat wallet ML-DSA et seconde signature liée à la mission, dépôt exact **35 demoUSD**, exécution par l’opérateur, réconciliation du financement et du NFT. Les 15 demoUSD de réserve du budget ne sont pas dépensés.

Positions :

- **paa735da79790483d.reserve-v3.everkeep-dev-mw0weth5.testnet** : création directe, 10 demoUSD.
- **m6c9705d2b156db-0.reserve-v3.everkeep-dev-mw0weth5.testnet** : mission, 35 demoUSD.

Les preuves et hashes publics sont dans `docs/results/testnet-browser-creation.json`, `testnet-browser-actions.json`, `testnet-browser-missions.json` et `testnet-browser-investment.json`.

## Reprises et limites

- Une création conserve le même nom de compte et la même preuve publique. **Actualiser la création** relit les contrats sans renvoyer de fonds. **Réouvrir l’autorisation** ne s’utilise qu’après cette relecture ; la collection refuse une seconde souscription initiale.
- Un financement en cours n’est pas un échec remboursable. Un échec connu ouvre la créance contractuelle ; un résultat inconnu conserve sa réserve. Aucun déblocage administratif spéculatif.
- La vente gèle les actions incompatibles. Consentement acheteur et nouvelle clé sont obligatoires ; prix en séquestre, révocation des anciens accès, reprise et créances sont portés par le protocole existant. La mise en vente/annulation est vérifiée sur testnet ; l’achat entre deux utilisateurs reste à vérifier dans ce navigateur. Ses tests intercontrats sandbox sont distincts de cette preuve.
- Les documents privés de mission sont chiffrés hors chaîne, dans le profil navigateur et dans **~/.local/share/everkeep/testnet-missions** côté opérateur. La capacité de lecture reste dans le navigateur ; la sauvegarde des clés de positions ne sauvegarde pas ces documents. L’opérateur ne détient aucune clé ML-DSA utilisateur. Le processus d’analyse reçoit des données, jamais de signataire.
- Sans endpoint IA configuré, le mode est déterministe et explicitement affiché. L’opérateur local doit être actif pour une nouvelle mission. Les contrats restent la source des états, livraisons, autorisations et remboursements.
- Les contrats et l’interface ne sont pas audités. La primitive ML-DSA ne confère pas de sécurité post-quantique à toute la pile NEAR et au wallet classique.

## Vérifications

```bash
npm test
npm run build
npm run testnet:check -- everkeep-niels-mw0wq5r0.testnet
```

Les tests TypeScript couvrent calcul exact des réserves, statuts des modèles et protection/persistance des documents. Les preuves antérieures de contrats et de missions sandbox restent dans `docs/testing.md`. Les contrôles testnet ne prétendent pas remplacer un audit ni une exécution à maturité.

Reprise d’un achat : dans Mes positions, ouvrir **Suivre un achat ou un règlement interrompu**, renseigner le compte de la position et le numéro d’annonce, puis **Lire le règlement**. Cette lecture reste accessible lorsque la paire NFT/index ne peut pas être vérifiée. La reprise utilise seulement resume_sale, release_settled ou release_cancelled selon l’état persistant. Elle ne réémet aucun paiement. Les tests TypeScript couvrent une réponse perdue après règlement et l’interdiction du remboursement spéculatif ; le navigateur couvre un état RPC négatif explicitement simulé (docs/results/testnet-recovery.json), sans transaction. Cela ne vaut pas validation d’un achat réel entre deux utilisateurs.

Dernière validation : 36 tests TypeScript, build Vite réussi et neuf captures des trois routes à 390/768/1440 px. Revue visuelle indépendante : ship sur ce périmètre. Audit npm production : 11 alertes faibles héritées des dépendances classiques, aucune modérée/haute/critique ; aucun audit fix forcé.

Le contrôle navigateur utilisant Chrome Windows se lance avec Node Windows depuis PowerShell. Sous Linux, renseigner EVERKEEP_CHROME avec le chemin d’un Chromium Linux. Les tests de contrats et le build sur ce poste restent dans WSL.
