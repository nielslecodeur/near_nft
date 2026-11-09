# AUDIT — Everkeep (Phase 1, read-only)

Audit date: 2026-11-05. Scope: the whole repository at `HEAD` 6e8941f, plus the uncommitted working tree.
The only file this phase creates is this one. No other file was modified.

Commands run (none of them write to the repo):
`npx tsc --noEmit` on Windows, `tsx --test tests/*.test.ts` in WSL, `scripts/test-contracts.sh` in WSL (its cargo target dir is outside the repo), and read-only RPC `view_account` / `nft_total_supply` calls on testnet.
`npm run build` was **not** run because its `prebuild` step regenerates token files.

---

## TL;DR

- **Blockchain: YES.** There are 6 Rust contracts (near-sdk 5.30.0), and 5 of them are live on **NEAR testnet**. The NFT design is already "NFT = its own sub-account wallet contract", which is close to the Track 10 brief.
- **But it does not match the Phase 2 spec as written.** Positions hold **demoUSD (NEP-141)**, not NEAR. There are **no royalties**, the rarity frames are **purely editorial**, and transfers need an **ML-DSA signature in the memo**, which no standard marketplace can produce. There is **no gated page**.
- **Tests are green:** 64/64 TS tests and 60/60 Rust unit tests. The TS type-check is clean. However, `npm test` **fails 100% on native Windows** because `node_modules` was installed from WSL.
- **IP risk:** all three "special" artworks show a frog character that is visually a **Pepe the Frog derivative**. The `moon-executive` card (a space CEO holding a rocket cigar, with the Moon behind him) is the most likely "Musk reference". No literal "Musk" or "Elon" string exists in the code.
- **Timeline:** the first commit is **2026-11-02**. No project file has a timestamp before 2026-11-01. Details are in the "Timeline" section; the call on eligibility is yours.

---

## Stack

| Layer | What is in place |
|---|---|
| Front end | React 19.2, TypeScript 5.9 (strict type-check passes), Vite 7.3 |
| Styling | Plain CSS: 23 files in `src/` and `src/terminal/`, about 13k lines. Design tokens live in `design-system/terminal/tokens.json` and are turned into `public/design/tokens.css` by `scripts/generate-design-tokens.mjs`. No Tailwind or CSS-in-JS. |
| UI libraries | Radix UI (dialog, dropdown, tabs, tooltip), lucide-react, recharts |
| Animation | No library. Holo, tilt and the animated frame are CSS plus a little JS in `src/terminal/CardFrame.tsx` and `card-frame.css`. |
| NEAR JS | `near-api-js` 7.4, `@near-js/transactions` 2.5, `@hot-labs/near-connect` 0.12 (this is the one actually used, with the Intear wallet). `@near-wallet-selector/*` 10.1.4 is installed but **not imported anywhere**. |
| Crypto | `@noble/post-quantum` (ML-DSA-65 signatures on the client) |
| Contracts | Rust 1.98.1 (`rust-toolchain.toml`), near-sdk `=5.30.0`, Cargo workspace with 6 crates. Built WASM files are committed under `artifacts/`. |
| Package manager | npm (`package-lock.json`), Node 24 |
| Tests | `node:test` via `tsx`, `cargo test`, about 30 Playwright-based `scripts/browser-*.mjs` checks, sandbox proofs (`*-proof.sh`) |
| Scripts | 55 npm scripts: dev/build, contract build and test, sandbox demos, testnet deploy, seed, worker and top-up, browser checks |

## Structure

```
contracts/      6 Rust crates (Cargo workspace), ~4.9k lines
  collection/   NFT collection + factory + fixed-price market + series subscription (lib.rs, market.rs, series.rs, agent_funding.rs)
  wallet/       per-NFT position wallet: ML-DSA authority, accounting, agent mandate, sale, basket (lib.rs 1370 lines)
  missions/     paid agent analysis missions (NEAR fees)
  strategy/     versioned mandate registry
  demo-token/   demoUSD NEP-141
  test-receiver/ nft_on_transfer test receiver
artifacts/      committed collection.wasm / wallet.wasm (wallet.wasm hash is embedded in collection)
packages/
  shared/       domain logic shared by UI + scripts (network, transactions, baskets, catalogue, series state…)
  agent/        deterministic "agents" (conversation, investment, missions, thematic) — no LLM by default
src/            React app (~10k lines TSX)
  SeriesApp.tsx         1187-line root component: hash routing, global state, actions
  MarketplaceV3.tsx, TestnetPositions.tsx, AgentMissions.tsx, BasketExperience.tsx … feature screens
  client.ts             NearConnector (HOT near-connect) wallet session
  testnet-*.ts          testnet reads/actions/creation/state
  key-vault.ts          encrypted local ML-DSA key vault (localStorage)
  terminal/             current design system components: CardFrame, PositionCard, PositionsWallet, primitives
design-system/terminal/ tokens.json, card-themes.json, component/page docs
public/         testnet.json (live addresses), art/, fonts/, design/tokens.css
scripts/        deploy, seed, worker, sandbox, ~30 browser checks
tests/          17 node:test files (64 tests)
docs/           ~30 design/architecture docs (French), results/*.json proof logs, screenshots/
.research/      (gitignored) third-party clones: near-sdk, nearcore, near-sandbox-rs, tla-contracts, hackathon brief, many one-off helper scripts
.local/         (gitignored) testnet deployment record
```

- **Routes:** there is no router library. Routing is hash-based in `SeriesApp.tsx` (`#explorer`, `#positions`, `#agent`, `#market`), plus query modes `?mode=local` and `?session=orbite|missions`.
- **State management:** React `useState` held in the monolithic `SeriesApp`. There is no store library. Encrypted keys are kept in `localStorage` (`src/key-vault.ts`).
- **API layer:** there are three back ends.
  - Direct RPC (`VITE_RPC_URL`, fastnear).
  - A local sandbox API on ports 8791/8792 for demos.
  - An operator **testnet worker** on port 8793 (`scripts/testnet-worker.ts`). It holds deployer credentials outside the repo.
- **Mock / fixture data:** `src/terminal/demo-fixtures.ts`, `packages/shared/baskets.v1.json` (deterministic fictional prices), `public/testnet-demo.json`, `contracts/wallet/fixtures/ml-dsa65.json` (public key and signature only).
- **Config:** `.env.example` (public `VITE_*` only), `public/testnet.json`, `vite.config.ts`, `tsconfig.json`, `Cargo.toml`, `rust-toolchain.toml`.

## Blockchain status

**YES, contracts are deployed on NEAR testnet.** I checked them live on 2026-11-05: the code hashes match `public/testnet.json`.

| Role | Account | Notes |
|---|---|---|
| Parent / deployer | `everkeep-dev-mw0weth5.testnet` | |
| NFT collection (liquidity series) | `reserve-v3.everkeep-dev-mw0weth5.testnet` | `nft_total_supply` = **6** |
| NFT collection (thematic baskets) | `baskets-v1.everkeep-dev-mw0weth5.testnet` | `nft_total_supply` = **0**. Its source (`contracts/wallet/src/basket.rs`) is **uncommitted**. |
| demoUSD FT | `demousd-v3.everkeep-dev-mw0weth5.testnet` | NEP-141 |
| Strategy registry | `strategy-v3.everkeep-dev-mw0weth5.testnet` | |
| Agent missions | `missions-v3.everkeep-dev-mw0weth5.testnet` | |

Deployed 2026-11-03 (v3) and 2026-11-05 (baskets). No mainnet deployment.

**How the NFT works today:**

- **Each token is its own account.** The token ID *is* a sub-account (`<id>.reserve-v3…`) running the `wallet` contract. The collection only tracks `owner_id`, `epoch` and `sequence` for each token.
- **Funds:** each position wallet holds **demoUSD**, not NEAR. The owner can withdraw it, under the position's maturity and constraints.
- **Control:** the wallet is controlled by an **ML-DSA-65 (post-quantum) key**, not by the NEAR owner account directly. A transfer rotates the key, bumps the "generation" and revokes agent permissions.

**NEP-171 / NEP-177 compliance (partial):**

| Method / standard | Status |
|---|---|
| `nft_token`, `nft_metadata`, `nft_total_supply`, `nft_tokens`, `nft_tokens_for_owner`, `nft_supply_for_owner` | ✅ Present |
| `nft_transfer`, `nft_transfer_call`, `nft_resolve_transfer` | ✅ Present |
| NEP-297 events (`nft_mint`, `nft_transfer`) | ✅ Emitted |
| Transfer semantics | ⚠️ Non-standard. Transfers **require a signed ML-DSA authorization JSON in `memo`** (`SIGNED_AUTHORIZATION_REQUIRED_IN_MEMO`), so a standard marketplace or wallet cannot transfer the token. |
| Approval extension (NEP-178) | ❌ Explicitly rejected (`APPROVAL_EXTENSION_NOT_SUPPORTED`) |
| Royalties / payout (NEP-199) | ❌ None. The custom market (`market.rs`) sells for a fixed demoUSD price with escrow, and 100% goes to the seller. |
| Token metadata (NEP-177) | ⚠️ Generic: the same title for every token, no `media` or `reference`, and `extra` holds the account ID. |

**Phase 2 requirements against what exists today:**

| Requirement | Today |
|---|---|
| A. Card holds funds, owner withdraws | Partly: in demoUSD (via a sub-account), not in NEAR held by the contract for each token |
| B. Royalties credited to the token | ❌ Not implemented |
| C. Tier computed from on-chain state | ❌ The tier is editorial. `src/terminal/catalogue-presentation.ts:7` says: *"Frames are editorial treatments, never financial ratings or NFT rarity."* Line 21 picks the frame by checking whether the art path starts with `/art/special/`. |
| D. Gated page | ❌ None (no `/vault` page) |
| E. Original character | ❌ See Risks: the frog art |
| Unit tests for withdraw, royalty, tier and transfer | Transfer and withdraw-like flows are tested (60 Rust tests). Royalty and tier tests don't exist because those features don't exist. |

## Design system status

**Where design is defined:**

- **Tokens:** `design-system/terminal/tokens.json` is the source. `scripts/generate-design-tokens.mjs` turns it into `public/design/tokens.css` (107 custom properties).
- **Card themes:** `design-system/terminal/card-themes.json` defines 5 themes: `special`, `matte`, `metal`, `holo`, `live`. Each has a rarity (standard, rare, epic, legendary), a frame (matte, metal, holo, animated), a palette, art layers and a `liveFeed` flag. They are parsed and validated by `src/terminal/card-theme.ts` and rendered by `src/terminal/CardFrame.tsx` and `card-frame.css` (holo, tilt, animated frame).
- **Fonts:** Inter and IBM Plex Mono are the current choice. Space Grotesk is legacy from "Orbite". All are self-hosted in `public/fonts` and `src/fonts.css`.
- **Docs:** `DESIGN.md`, `.impeccable/design.json`, and `design-system/terminal/*.md` (PRIMITIVES, COMPONENTS, PAGES, WORKSPACES, POSITION_CARDS).

**Why it looks "flat":** I based this on `docs/screenshots/position-cards/explorer-front-1440.png` and the CSS.

1. **Too many style layers.** About 23 CSS files from successive directions (`orbite.css`, `interface-theme.css`, `design.css`, `style.css`, `marketplace*.css`, `terminal/*.css`…), with **~258 distinct hard-coded hex colors** in `src/`. The tokens exist, but many styles bypass them.
2. **The surface is one flat near-black.** Header, hero, filters and cards all sit on almost the same tone. Hierarchy relies on thin borders, so there is little depth.
3. **Cards are mostly text and buttons.** The art sits in the top third, followed by labels, "À définir" placeholders, and two stacked buttons (one of them disabled). Nothing on the card shows it is a *living* NFT: no balance, no tier, no owner, no trade count.
4. **The frame system is barely used.** Matte, metal, holo and animated exist, but the catalogue only switches between `special` and `matte`, and the choice is driven by the art path.
5. **Copy is heavy.** Long disclaimers in French ("Réseau de test… sans valeur réelle", repeated) compete with the content. There are two search fields on one screen.
6. **One accent does every job.** Lime `#b5f36b`-like green is used for CTAs, links and status at the same time.

## Working features

These are backed by passing tests or on-chain state. "Verified by me" means I re-checked it today.

- **Wallet connection** with HOT `near-connect` and the Intear wallet on testnet (`src/client.ts`). It reads the wallet's NEAR and demoUSD balances in the header.
- **Creating a position:** subscribe with demoUSD, the factory deploys a wallet sub-account, and the NFT is minted. *Verified by me:* 6 NFTs exist on `reserve-v3`.
- **"My positions":** reads `nft_tokens_for_owner` and each wallet's snapshot from chain (held, committed and reserved funds, maturity, permissions).
- **Withdrawing the position's demoUSD** after maturity or closing, signed with ML-DSA.
- **Listing a position for sale, cancelling, expiring:** contract logic is complete and unit-tested. The README says *"buying a position between two users is the next testnet browser flow to verify"*, so the **browser buy flow is not proven on testnet**.
- **Agent missions:** a paid analysis (NEAR fee) with a frozen quote, a deterministic analysis, and an investment that needs a separate authorization. The contract is deployed.
- **Thematic baskets:** the contract is deployed, the subscription flow is wired, and there are browser checks. No basket NFT has been minted yet on testnet.
- **Encrypted local key vault**, with optional export.
- **Test status:** TS tests 64/64 ✅ (in WSL). Rust unit tests 60/60 ✅ (collection 20, missions 12, wallet 28; demo-token, strategy and test-receiver have 0). `tsc --noEmit` ✅.

## Mocked features

- **Basket prices:** deterministic fictional prices (`everkeep-fictional-v1`), compiled into the wallet. There is no live market data. The "valuation" is informative only.
- **Agents:** a deterministic analysis with no AI by default. `EVERKEEP_ANALYSIS_ENDPOINT` is empty.
- **demoUSD** is a demo token. The "Liquidity reserve" yields come from a prefunded demo reserve.
- **Card rarity and frames:** editorial choices from `card-themes.json`, not from chain state.
- **"Diversification" and "Crypto" models** are shown as "À définir / Création indisponible".
- **Price history** is "Non indexé" (not indexed). Favorites (heart icon) appear to be UI-only.
- **Local demo mode** (`?mode=local`) uses sandbox personas (Alice…) with ephemeral keys.
- **`src/terminal/demo-fixtures.ts`** feeds the component previews.

## Risks

**🔴 High**

1. **Phase 2 is a large change from the current contracts.** The contracts are ~4.9k lines of sophisticated logic: post-quantum authority, missions, series, baskets, escrow market. Phase 2 asks for a simpler NFT built around NEAR, with royalties, tiers and standard transfers. Retrofitting that into `wallet` and `collection` touches the most complex code. Judges will read this contract, and the current one is hard to review in 2 minutes.
2. **NEP-171 transfers are not interoperable.** The ML-DSA memo requirement and the rejected approvals mean no NEAR marketplace can trade the token. This directly contradicts "so marketplaces can trade it".
3. **IP / likeness.**
   - `public/art/special/moon-executive.webp`, `orbital-strategist.webp` and `reserve-keeper.webp` all show a green frog that is **recognisably Pepe the Frog** (a third-party copyrighted character).
   - The provenance says the images were generated from a user-supplied reference, *"Carte Everkeep, PDG grenouille dans l'espace.png"* (an Everkeep card mockup of a frog CEO in space), and its origin is unknown.
   - The "space CEO with a rocket cigar and the Moon" theme reads as a Musk allusion. The Energy Transition basket includes **Tesla (TSLA)**.
4. **Uncommitted work backs a live deployment.** 34 files are modified and ~40 are untracked, including `contracts/wallet/src/basket.rs` and the art. The code running at `baskets-v1…testnet` **is not in git history**, so one bad checkout loses it.

**🟠 Medium**

5. **Windows environment.** `node_modules` holds the Linux esbuild binary, so `npm test` and `npm run dev` fail on native Windows. Everything must run inside WSL, or you need a fresh `npm ci` on each platform.
6. **Real-world securities.** The baskets name 15 real companies and tickers (NVDA, MSFT, TSLA…) as a "simulation". It is heavily disclaimed, but it is off-theme for Track 10 and draws regulatory and optics questions.
7. **Language.** The README, PRODUCT and all docs are in **French**. The judges, including AI judges, expect a README they can follow with "do X, see Y" steps. The current README does not have that and doesn't cover Track 10 features.
8. **Front-end maintainability.** `SeriesApp.tsx` is 1187 lines, `AgentMissions.tsx` 1385, `MarketplaceV3.tsx` 1097. Several historical UI directions coexist, which slows Phase 2 UI work.
9. **Wallet library.** The spec asks for the NEAR Wallet Selector. The app actually uses HOT `near-connect`. Wallet-selector packages are installed but unused.
10. **Royalty and funds model.** Phase 2 wants NEAR held per token *by the contract*. Today the funds sit in per-token **sub-accounts** in demoUSD. These are two different architectures (see Open questions).

**🟢 Low / OK**

11. **Secrets:** no secret found.
    - `.gitignore` covers `.env*`, credentials, keys and `.local/`.
    - The tracked ML-DSA fixture holds only a public key and signature.
    - `docs/results/testnet-secret-scan.json` reports 0 findings across 341 files.
    - Deployer credentials live in `~/.near-credentials`, outside the repo.
    - *Still recommended:* run a full history scan (for example gitleaks) before making the repo public.
12. **Repo visibility unknown.** The remote is `github.com/nielslecodeur/near_nft` and `main` is pushed (6e8941f). I couldn't check if it is public because `gh` is not installed.
13. **Clutter:** `PROGRESS.md` is 80 KB, there are ~100 `docs/results/*.json` files, and `.research/` holds hundreds of one-off scripts (it is gitignored). This is noise for judges, not a blocker.
14. **RPC mismatch:** `.local/testnet-deployment.json` uses `rpc.testnet.near.org`, while the app uses `test.rpc.fastnear.com`. This is harmless.

## Timeline: code before vs after Nov 1, 2026

Hackathon window: **2026-11-01 00:00 UTC → 2026-11-14 23:59 UTC.**

| Evidence | Date (local +01:00) | UTC | What it contains |
|---|---|---|---|
| Earliest tracked-file mtime | 2026-11-02 16:05 | 2026-11-02 15:05 | `contracts/*/.gitignore` |
| Commit `7325767` (first commit) | 2026-11-02 21:19 | 2026-11-02 20:19 | "Everkeep NEAR savings NFT prototype": 78 files, +14,916 lines (contracts, initial app) |
| Testnet v3 deployment | 2026-11-03 17:38 | 2026-11-03 16:38 | collection, demoUSD, strategy, missions |
| Commit `6e8941f` | 2026-11-05 01:01 | 2026-11-05 00:01 | marketplace, agents, terminal UI: 483 files, +62,648 / −5,838 |
| Uncommitted working tree | 2026-11-05 | — | baskets contract, special art (generated 2026-11-05), position cards |
| Files dated before 2026-11-01 | — | — | **None** (outside `node_modules/` and the gitignored `.research/`) |

**Flags. These are for you to decide; I am not deciding:**

- Every date in git and on the filesystem points to work **after** Nov 1. The history is only 2 commits, though, and the first one already holds ~15k lines written in a single day.
- Git dates and file mtimes are set locally, so they **cannot prove** that nothing was designed or written earlier (for example in another repo, or as the design references). If any of it was, you should be ready to disclose it.
- `.research/` (gitignored) contains **third-party** code: `near-sdk`, `nearcore`, `near-sandbox-rs`, `tla-contracts`. It is reference material, not your code. If you copied any snippet from it (for example from the near-sdk NFT example), give it attribution.
- The frog art reference image ("PDG grenouille dans l'espace.png") has an unknown origin and date.

## Open questions for me

1. **Build on Everkeep or start a focused contract?**
   - **Option a:** extend `collection` + `wallet`. This keeps the existing "NFT = sub-account" design, which already fits Track 10's "NFT as account", but it means retrofitting into complex code.
   - **Option b:** write a new, small, reviewable NEP-171 contract (for example `contracts/keepcard`). It would hold a NEAR balance per token, credit royalties to the token, compute the tier on-chain and support gating. It would reuse the front-end design system and leave Everkeep as legacy.
   - *My recommendation: (b).* The spec says the balance is "held by the contract for that token", and judges need to read the contract quickly.
2. **Funds asset:** native NEAR (as the Phase 2 spec says) or keep demoUSD?
3. **ML-DSA post-quantum transfer authorization:** drop it for the new token so transfers are plain NEP-171 and marketplace-compatible? Or keep it as an optional extra?
4. **Tier metric for the MVP:** balance thresholds, number of trades, or holding duration? I'll justify my pick at Checkpoint A, but tell me if you already have a preference.
5. **"Musk reference":** I found no literal mention. Is it the `moon-executive` frog CEO card (and its siblings)? Should I **replace the frog character entirely**, given the Pepe resemblance? And should the **Tesla/real-ticker baskets** be removed or hidden from the demo path?
6. **Existing Everkeep features** (baskets, agent missions, series, liquidity reserve): keep them visible, hide them behind a "legacy" flag, or remove them from the demo path?
7. **README language:** switch to English for the judges? Should French docs move to `docs/fr/`?
8. **Wallet:** keep HOT `near-connect` (already working with Intear), or switch to `@near-wallet-selector` as the spec says? Both satisfy "connect a NEAR wallet". Switching costs time.
9. **Commit first:** may I commit the current uncommitted work, including the deployed baskets source, as a baseline before Phase 2?
10. **Repo:** is `github.com/nielslecodeur/near_nft` the submission repo, and is it public yet? Is there a team, and a mainnet account for the payout?
11. **Dev environment:** should WSL be the single canonical environment? Every command would run through `wsl -e bash …`.
12. **Pre-Nov-1 work:** did any design, art reference or code exist before Nov 1 that should be disclosed?

---

*Phase 1 complete. Stopping here until you say go.*
