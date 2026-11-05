# Agents : deux validations financières

Cette version remplace le parcours de signatures successives et de téléchargement JSON obligatoire. L’utilisateur a explicitement accepté un coffre local chiffré, protégé par un mot de passe Everkeep, avec export facultatif.

## Parcours courant

1. Connecter Intear sur NEAR testnet et décrire budget, réserve et horizon.
2. Examiner les paramètres et le total des frais. **Première validation wallet** : devis et analyse ensemble. Le contrat exécute deux actions dans la même transaction : `quote` puis `pay`. Les tarifs viennent du contrat : 0,05 NEAR de stockage plus 0,01 / 0,015 / 0,02 NEAR d’analyse, selon l’expertise, plus gas.
3. Recevoir une proposition compacte : modèle, montant à investir, réserve sur le budget, échéance et coûts. Les risques et permissions restent accessibles ; historique et informations techniques sont repliés.
4. Choisir **Créer ma position**, examiner le récapitulatif puis effectuer la **seconde validation wallet**. Intear reçoit un groupe ordonné de transactions. La création, les consentements et le dépôt sont liés au compte et aux montants examinés.
5. Le worker exécute et, si nécessaire, réconcilie la souscription déjà autorisée. Le NFT n’est annoncé créé qu’après lecture des états et de l’index effectifs. La mise en vente reste une action distincte.

Deux validations ne signifient pas deux transactions sur chaîne : le groupe de création contient plusieurs transactions distinctes et n’est pas atomique. Le gas et les coûts de stockage restent dus. La connexion wallet, le déverrouillage du coffre, une récupération d’erreur ou une vente ultérieure sont des actions séparées.

Le regroupement est activé pour Intear, dont l’intégration officielle expose `signAndSendTransactions` et dont la file séquence les opérations. Un wallet différent n’est pas remplacé silencieusement par dix demandes individuelles. Sources : [intégration Intear](https://github.com/INTEARnear/wallet), [file de transactions](https://github.com/INTEARnear/wallet/blob/main/web/src/contexts/transaction_queue_context.rs), [API NEAR Connect](https://docs.near.org/tools/near-connect).

## Coffre et migration

Les clés ML-DSA et capacités privées sont chiffrées avant écriture dans IndexedDB. AES-GCM lie le contenu au propriétaire et à sa position ; le mot de passe passe par PBKDF2-SHA256, 310 000 itérations. Les clés de chiffrement déverrouillées et le matériel déchiffré restent en mémoire. Une écriture du coffre échouée empêche de poursuivre le financement.

Il n’y a plus de téléchargement ni de confirmation de fichier obligatoire. Après rechargement, le mot de passe suffit sur le même navigateur avec son coffre intact. **Options → Coffre et sauvegarde** propose une copie de secours chiffrée et sa restauration. Cette copie est facultative ; le coffre n’est pas une sauvegarde cloud.

Les sauvegardes de l’ancienne version restent compatibles. Une ancienne position dont la clé n’a jamais été conservée dans IndexedDB nécessite une importation unique de son ancien fichier, avec son mot de passe. Aucune clé n’est recréée à la place d’une clé existante. Les générations déjà connues ne sont pas supprimées à l’importation.

La clé native NEAR reste dans Intear. Le worker conserve seulement son credential opérateur de test, hors dépôt. Il n’a aucune clé propriétaire de position. La clé d’authentification applicative limitée d’Intear reste en mémoire ; une reconnexion peut être nécessaire après rechargement. Ce coffre chiffré remplace, avec l’accord explicite de l’utilisateur, la contrainte précédente de secrets exclusivement en mémoire.

## Expiration et reprise

Une expiration n’est pas contournée en réactivant un bouton. Un compte déjà provisionné mais non financé peut être réutilisé par un **nouveau devis explicite**, dont les nouveaux frais sont affichés. L’ancien mandat est annulé et de nouveaux consentements liés à la nouvelle mission sont signés. Les 6 NEAR de création ne sont pas payés à nouveau.

Le journal persistant contient les références publiques et les actions autorisées. Toutes les actions d’une transaction, leur ordre, montants, paramètres, signataire et destinataire sont comparés aux reçus finaux. Tous les résultats renvoyés d’un groupe sont conservés avant vérification ; un échec ne masque pas les références des autres transactions. Un résultat inconnu n’est jamais renvoyé automatiquement.

Les signatures ML-DSA de la création groupée sont préparées pour les générations et nonces exacts attendus. Les contrats inchangés les vérifient réellement ; un état concurrent incompatible provoque un refus. Aucun droit de retrait, de revente ou d’administration n’est ajouté à l’agent.

## Vérifications réellement exécutées

| Preuve | Portée |
|---|---|
| `npm test` | 45 tests TypeScript, dont signatures altérées, reçus échoués, ordre exact des actions combinées, réserve minimale et réutilisation bornée |
| `npm run build` | Types et compilation Vite |
| `npm run test:conversation:browser` | Coffre chiffré persistant, verrouillage au rechargement, mauvais mot de passe/autre propriétaire, export/import, reprise et refus sans nouveau paiement ; reçus synthétiques explicitement identifiés |
| `npm run test:agents:ux` | Captures à 390/768/1440, proposition compacte, expiration, succès, coffre, Options, clavier et mouvement réduit ; états de proposition explicitement fictifs |
| `grouped-agent-proof.json` | Vraie création testnet de 14 demoUSD, deux appels de validation au signataire de QA autorisé ; répétition sans troisième appel, zéro téléchargement |
| `grouped-native-qa.json` | Hashes de la transaction devis/paiement et des six transactions du second groupe, sans échec de reçus |
| `conversation-user-testnet.json` | Position réelle de nifelst.testnet : 25 demoUSD financés, 75 demoUSD extérieurs ; compte réutilisé après expiration, avec l’ancien parcours Intear séquentiel |

Le signataire QA est un adaptateur isolé pour un compte de démonstration contrôlé, pas une substitution cryptographique : les transactions et vérifications ML-DSA ont réellement été exécutées sur testnet. Son service temporaire a été arrêté. **Les deux appels API ont été vérifiés ; les deux fenêtres réelles d’Intear de cette nouvelle version restent à confirmer par un utilisateur.** Les essais précédents d’Intear ne prouvent pas ce nouveau regroupement.

Les contrats Rust n’ont pas changé dans cette tranche. Les résultats historiques de 58 tests Rust et 19 scénarios WASM missions ne sont pas présentés comme réexécutés ici. Aucun mainnet, aucune clé utilisateur au serveur et aucune publication GitHub dans cette reprise.

## Commandes

```bash
npm run dev
# second terminal, credential opérateur déjà hors dépôt
npm run testnet:worker
npm test
npm run build
npm run test:conversation:browser
npm run test:agents:ux
```

Sous Windows : `wsl -e bash scripts/web.sh` et `wsl -e bash scripts/testnet-worker.sh`. Ouvrir `http://127.0.0.1:5173/#agent`. Ces commandes sont celles du développeur ; l’utilisateur signe dans son wallet.
