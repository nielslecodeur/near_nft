# Sources et versions

Complément écosystème : [analyse des 15 ressources](ecosystem.md), documentations officielles et [HEAD des dépôts repérés](results/ecosystem-sources.json). La collecte de références est distinguée d’une revue de code ou d’une intégration exécutée. [Observation publique Intents](results/ecosystem-capabilities.json) : métadonnées en lecture seule, pas de swap.

Consultation : 2 novembre 2026. Les copies d'étude sont dans `.research/`, exclu de Git. Les liens ci-dessous sont épinglés aux commits lus, et non à une branche susceptible de changer.

| Source | Révision consultée | Utilisation |
|---|---|---|
| [Compétence NEAR](https://github.com/near/agent-skills/tree/cb32b6af195e636c1e9c2efe2ea75a6d85b6b67b/skills/near-smart-contracts) | `cb32b6af195e636c1e9c2efe2ea75a6d85b6b67b` | SKILL.md, règles stockage, promises, intégration ; génération officielle cargo near new |
| [House of Stake](https://github.com/houseofstake/tla-contracts/tree/d85860a8cc2bfcb8b617b28cab558da5d39333fc) | `d85860a8cc2bfcb8b617b28cab558da5d39333fc` | hos-wallet, registrar, tla-registry/nft, hos-extension ; tests authority et sharded_item |
| [Sharded NFT Items](https://github.com/houseofstake/tla-contracts/blob/d85860a8cc2bfcb8b617b28cab558da5d39333fc/docs/sharded-nft-items.md) | Draft 1.0.0, 19 septembre 2026 | Autorité wallet, compte nommé, double lecture ; aucune revendication de conformité à ce brouillon |
| [NEPs](https://github.com/near/NEPs/tree/91562ccd72f6d30f4e37e4b53f7f193cc808b5d8/neps) | `91562ccd72f6d30f4e37e4b53f7f193cc808b5d8` | NEP-171 final 1.2.0, NEP-177, 181, 297, 141, 145 ; NEP-616 approved 1.0.0 et NEP-645 draft 1.0.0 |
| [Track NFTs](https://github.com/nearai/near-hackathon-prompt-examples/blob/78733430eac004f9ebca44cdb9f2bc72b403c057/tracks/10-nfts.md) | `78733430eac004f9ebca44cdb9f2bc72b403c057` | Track principal « NFTs That Do Something » |
| [SDK source](https://github.com/near/near-sdk-rs/blob/e19629c8e6381f67a77301379e850ad7b057dc32/near-sdk/src/environment/env.rs) | `e19629c8e6381f67a77301379e850ad7b057dc32` | API exacte ml_dsa_verify, tailles et gas ; dépendance compilée =5.30.0 depuis crates.io |
| [nearcore source](https://github.com/near/nearcore/tree/c1cd7c2a34380de3a37b852ddbcd418664a07b58) | `c1cd7c2a34380de3a37b852ddbcd418664a07b58` | État de développement, configurations réseau et sandbox ; pas le commit du binaire exécuté |
| [nearcore 2.14.0](https://github.com/near/nearcore/releases/tag/2.14.0) | `bc4e9e8cfb03d9e82f027883055624e18576993e` | Binaire sandbox stable, protocole 88 ; ajout documenté du host ML-DSA |
| [nearcore 2.14.0-rc.5](https://github.com/near/nearcore/releases/tag/2.14.0-rc.5) | `b7b4737cab46f17a6daa2ed694d7aebbd204363a` | Runtime annoncé par testnet ; binaire de comparaison pour diagnostic sandbox |
| [FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) | final du 13 août 2024 ; note d'errata du 31 juillet 2026 | ML-DSA et tailles, contexte vide ; pas de certification FIPS revendiquée pour Everkeep |
| [Wallet Selector](https://github.com/near/wallet-selector/tree/main/packages) | paquets npm =10.1.4 | README core et my-near-wallet consultés ; actions de la version 10, dépendances verrouillées |

## Outils retenus

- Rust Windows 1.98.0 ; build et tests Linux/WSL Rust 1.98.1.
- cargo-near 0.22.0, installé depuis la release officielle. `cargo near new --help` et `cargo near build --help` vérifiés ; projets générés officiellement, puis simplifiés dans le monorepo. Le premier scaffold wallet a été créé mais son commit automatique a échoué faute d'identité Git WSL ; les sources étaient présentes et ont été conservées. Aucune identité Git globale modifiée.
- near-sdk et near-contract-standards **=5.30.0**, Cargo.lock ; target wasm32-unknown-unknown.
- Node 24.12.0 ; React 19.2.0, TypeScript 5.9.3, Vite 7.3.7, Noble post-quantum 0.6.1, near-api-js 7.4.0, Wallet Selector 10.1.4 ; versions transitives exactes dans package-lock.json.
- near-workspaces a été retiré. Le lanceur direct de sandbox suit les configurations de [near-sandbox-rs](https://github.com/near/near-sandbox-rs/tree/56e17cd309bcf98645d306bca80dbeca3bab33c9), commit `56e17cd309bcf98645d306bca80dbeca3bab33c9` consulté ; les transactions utilisent near-api-js 7.4.0.

## Licences et réutilisation

La compétence NEAR déclare MIT. Les manifests hos-wallet/registrar/hos-extension/tla-registry déclarent MIT OR Apache-2.0 ; aucun code de ces contrats n'a été copié. Leur audit n'est pas celui d'Everkeep. Les mécanismes de location, reprise, sweep, expiration et recovery sont écartés. Les interfaces sont réimplémentées dans un code propre au prototype. Le token réutilise la bibliothèque officielle near-contract-standards (MIT OR Apache-2.0) comme dépendance. Noble est MIT. Les dépendances conservent leurs notices dans les distributions npm/crates.

La page GitHub de la compétence était initialement inaccessible au navigateur ; le clone Git a permis de lire réellement SKILL.md et ses fichiers. La règle `security-access-control.md` citée dans la compétence n'existe pas dans le commit cloné : les règles listées dans SKILL.md, les contrats et les exigences du présent modèle sont utilisés sans inventer ce fichier. Les affirmations de coût issues de documentation sont distinguées des mesures réellement exécutées.

Build officiel : `cargo near build non-reproducible-wasm --locked --no-abi`, avec `--cfg near` et wasm-opt. Prettier 3.9.10, Playwright 1.64.1 et Chrome 156.0.8078.74 utilisés pour la vérification locale. Empreintes : `results/build.json` ; audit : `results/audit.json`.

Sous WSL, la correction locale de sauts d’horloge utilise `clock_gettime`/`gettimeofday` et une base monotone dans le seul processus sandbox. Elle ne modifie ni l’horloge système ni la validation ML-DSA.
