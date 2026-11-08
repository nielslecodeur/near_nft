# Audit: NFT art and robot placeholders (Phase 1, read-only)

Date: 2026-11-06. Branch `keepers`. No code was changed for this audit.

## 1. Where a robot is shown as an NFT image

There are **two kinds of robot**. The difference matters for Phase 2.

### A. The robot *is* the NFT: generated art stored on chain

The Keepers collection draws a robot from each card's `dna` and `tier`: shell, visor, accessory and glow. The contract returns that SVG as the token's `metadata.media`. Wallets and explorers show it, and so do our pages.

| File:line | What it is |
|---|---|
| `contracts/keepers/src/art.rs:21` `svg_data_uri`, `:38` `svg` | On-chain robot generator (Rust). |
| `contracts/keepers/src/lib.rs:821` | `m.media = Some(art::svg_data_uri(card.dna, view.tier))`: the robot becomes the NFT image in `nft_token`. |
| `src/keepers/art.ts:59` `keeperSvg`, `:110` `keeperArt` | Front-end mirror of the same robot (4:3 framing, same traits). |
| `src/keepers/KeeperCard.tsx:26` | `art={keeperArt(card.dna, tier)}` in `KeeperTile`. |
| `src/keepers/KeeperPage.tsx:343-345` | `<img src={token.metadata.media}>` in the "On-chain proof" panel. |
| `src/keepers/agents.ts:167` `nftImage()` | Reads `metadata.media` of any NFT: Keepers robots appear on agent cards through it. |
| `src/keepers/agents.ts:443` `exampleMedia()` | Robot-face SVG used as `media` when minting on `nft.examples.testnet`. |
| `scripts/mint-example-nft.ts:18` | The same SVG for deployer-side mints. |

`keepers-v1` and `keepers-v2` are deployed **keyless**, so their on-chain art can never change. Tokens already minted on `nft.examples.testnet` also keep their media.

### B. The lucide `Bot` icon

| File:line | Role | NFT image? |
|---|---|---|
| `src/keepers/AgentsPage.tsx:148-155` `NftArt` | Placeholder when an NFT has no usable `media`. | **Yes** (fallback). |
| `src/keepers/AgentsPage.tsx:651` | Mark on the intro stage. | No, brand mark. |
| `src/keepers/AgentsPage.tsx:718` | Mark next to the "Agent Wallet" title. | No, brand mark. |
| `src/keepers/KeepersApp.tsx:159` | Header logo. | No, brand mark. |
| `src/keepers/KeepersApp.tsx:183` | "Agents" nav icon. | No, nav icon. |

No emoji 🤖, robot image files or other icon libraries (Phosphor and the like) were found. Other matches of "robot" are the "Space & Robotics" basket text in the older Everkeep app, unrelated to NFT art.

## 2. Components that render NFT cards

| Component | File | Pages |
|---|---|---|
| `AgentCard` (portrait card, full-bleed art) | `src/keepers/AgentsPage.tsx` (~line 160) | `/agents` carousel, `/agents/:id`, `/agents/new` preview |
| `NftArt` (image or placeholder) | `src/keepers/AgentsPage.tsx:148` | Inside `AgentCard` and the NFT picker of `/agents/new` (`:1343`) |
| `KeeperTile` → `CardFrame` | `src/keepers/KeeperCard.tsx:49`, `src/terminal/CardFrame.tsx:19` | `/keepers` (`CollectionPage.tsx:282`), `/vault` (`VaultPage.tsx:344`) |
| Keeper detail art + proof image | `src/keepers/KeeperPage.tsx` | `/keepers/:id` |
| `CardFrame` (older Everkeep positions) | `src/BasketExperience.tsx:365`, `src/MarketplaceV3.tsx` | Legacy Everkeep app, not part of the hackathon demo |

## 3. Current theme: where colours, fonts and radii live

| Source | Content |
|---|---|
| `design-system/terminal/tokens.json` | Source of truth for tokens. |
| `scripts/generate-design-tokens.mjs` (runs as `prebuild`) | Generates `public/design/tokens.css` and `tokens.json`. |
| `public/design/tokens.css` | `--color-bg #07080C`, `--color-s1/s2/s3`, `--color-text #F0F2EA`, `--color-muted #A6B0A8`, `--color-brand #B5F36B` (lime), `--color-up/down`, `--font-ui: Inter`, `--font-numeric: IBM Plex Mono`, type scale, `--radius-control 8px`, `--radius-surface 12px`, `--radius-feature 20px`. |
| `public/design/components.css` | Primitives (`ek-button`, `ek-badge`, …). |
| `src/fonts.css` | Font files (Inter, IBM Plex Mono). |
| `src/keepers/keepers.css` | Keepers pages, using the tokens. |
| `src/keepers/agents.css`, `src/keepers/agents-stage.css` | Agent Wallet. The stage hard-codes its own night palette (`#060a14`, `#0f1d3d`, ice `#9cc8ff`) instead of tokens. |

## 4. Points to settle before Phase 2

1. **The robot is the real NFT image, read from chain.** Replacing it in the UI with mock art would make the pages show something the chain does not hold. The project states "every value comes from chain", and AI judges check this. Options:
   - **(a) Real art on chain** *(recommended)*: host the 5 images under `public/nft-art/` and mint them on `nft.examples.testnet` with `media` pointing at them. They become real NFTs that can carry agents, and every page keeps reading from chain. Keepers v1/v2 keep their robots, because they cannot change.
   - **(b) Display layer only**: show the new art over chain data, with the disclosure "illustration, not the on-chain image".
2. **Mock fields with no on-chain source**: `status: New/Popular`, `size`, `highestBid`, `price`. Nothing on chain backs "Highest bid" for these NFTs, and a judge following the README would find invented numbers. Suggested mapping onto real data: status → agent status, highest bid → budget left, and so on. Otherwise they must be clearly labelled as demo data.
3. **Rights to the artwork**: the 5 reference images (Angel, Galaxy Soldier, Space Warrior, Galaxy Princess, Fate) appear to come from a third-party design shot. A public repo and a public hackathon submission need either a licence for them or our own art, for example generated images.
4. **`next/image` does not apply**: the app is Vite + React, so Phase 2 would use `<img>` with a fixed `aspect-ratio` and `object-fit: cover`.
5. **One accent**: a single cyan accent would replace the lime brand used on every page. To decide: everywhere, or only the Agent Wallet pages.
6. **Phase 5 "lint"**: `package.json` has no lint script, only `prettier`. The checks available are `tsc --noEmit`, `vite build`, `npm test` and `scripts/browser-agents-check.mjs`.

Stopping here, waiting for your go.
