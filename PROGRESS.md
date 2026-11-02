# Everkeep — point stable

Mise à jour du 2 novembre 2026 après reprise. Le prototype local complet est enregistré dans `C:/Users/niels/OneDrive/fintech/projet/near_hack`. Dépôt Git local sur `main`, remote `origin` : `https://github.com/nielslecodeur/near_nft.git`. Les commits et leur synchronisation se vérifient avec `git status -sb` et `git log -1`. Aucun site publié, déploiement ou transaction testnet, mainnet ou fonds réel.

## Préparation GitHub

Envoi du code autorisé par l’utilisateur. Le dépôt distant ne présentait aucune référence lors de `git ls-remote` et `git fetch origin`, donc aucun historique à remplacer. Push normal uniquement, sans force. Identité définie pour ce dépôt seulement : `nielslecodeur <nielslecodeur@users.noreply.github.com>`.

Le `.gitignore` exclut recherches, dépendances, builds frontend, fichiers `.env` (sauf `.env.example`), coffre de clés local, credentials NEAR, clés privées et journaux. Les fixtures cryptographiques et rapports conservés contiennent uniquement des clés publiques, signatures et résultats de test. Le contenu à versionner est contrôlé avant commit ; aucun credential de connexion GitHub n’est inclus.

Le `.gitattributes` impose les fins de ligne LF pour conserver les scripts Bash fonctionnels après clone sous Windows ; les WASM restent binaires.

## Terminé

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
| Tests TypeScript après dernières retouches | **6 réussis** |
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
