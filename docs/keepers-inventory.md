# Keepers v2: card inventory (design, Checkpoint A′)

Status: **design for review**. No code yet.
Builds on `docs/keepers-contract.md` (v1, live at `keepers-v1.everkeep-dev-mw0weth5.testnet`).

## 1. Goal

A Keeper holds its NEAR balance **and an inventory of fungible tokens**: a basket. Track 10 lists exactly this ("assets that own money, earn royalties, **hold inventory**").

| Behavior | v1 | v2 |
|---|---|---|
| Holds funds | NEAR only | NEAR **plus up to 4 NEP-141 tokens** per card |
| Deposit | `deposit` (NEAR) | the same, plus `ft_transfer_call` to the contract with the card id in `msg` |
| Withdraw | owner withdraws NEAR | the same, plus `withdraw_token` per token |
| Sale | NEAR, tier and access move | **the whole inventory moves too**, in the same receipt |
| Royalty | 10% in NEAR, into the card | unchanged (sales are paid in NEAR) |
| Tier | NEAR balance | **unchanged: still NEAR balance only** (see §6) |

The baskets come back as an on-chain reality: the card really holds the tokens, and anyone can verify it with `ft_balance_of` on each token contract. They come back **without real stock names and without simulated prices**.

## 2. Which tokens (allowlist, fixed at deploy)

The contract is keyless, so the allowlist is passed to `new` and can never change. The contract accepts at most 4 tokens. These candidates were checked live on testnet on 2026-11-05 with `ft_metadata`:

| Token | Account | Decimals | How a user gets it | Recommendation |
|---|---|---|---|---|
| wNEAR | `wrap.testnet` | 24 | Wrap your own NEAR (`near_deposit`). This can happen in the same signing flow as the deposit. | ✅ yes |
| USDC (Circle testnet) | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | 6 | Circle's testnet faucet (to verify for NEAR before deploy) | ✅ yes, if the faucet works for NEAR testnet |
| demoUSD | `demousd-v3.everkeep-dev-mw0weth5.testnet` | 6 | Everkeep's existing grant script / worker | ✅ yes (we control distribution) |
| USDT.e (Ref fakes) | `usdt.fakes.testnet` | 6 | Public `mint` on the fakes (to verify) | optional 4th slot |

**Option: thematic tokens.** We could deploy 3 fictional tokens, for example `VOLT` (energy), `ORBIT` (space) and `CORE` (compute), using the existing `contracts/demo-token`. The thematic baskets would then come back with themes but no real companies.
- **Cost:** about 3 × 2 NEAR to deploy, plus a faucet, because `demo-token` mints a fixed supply to its owner and has no public mint.
- **Downside:** these are tokens we invent, and their value is as fictional as the old prices.
- This is open question 1 in §10.

## 3. Basket presets (UI only)

The theme is a **preset in the UI**, not a contract concept. A preset is a suggested composition, for example:

| Preset | Contents |
|---|---|
| Stable | 50% USDC, 50% demoUSD |
| Balanced | 50% wNEAR, 50% USDC |
| (with thematic tokens) Energy | VOLT + USDC… |

"Fill the card" sends one wallet request containing several transactions (`signAndSendTransactions`, which Intear already handles in Everkeep's `depositPlan`):
1. `wrap.testnet.near_deposit`, if the preset contains wNEAR;
2. `<token>.ft_transfer_call(receiver_id = keepers-v2, amount, msg = "{\"token_id\":\"12\"}")`, once per token.

The contract only stores amounts. The preset name is not stored, so the card shows what it **actually** holds.

## 4. Contract changes

### 4.1 State
```rust
pub struct Contract {
    // … everything from v1 …
    tokens_allowed: Vec<AccountId>,   // ≤ 4, fixed at init
    token_totals: Vec<u128>,          // Σ over cards, per allowlisted token (solvency)
    listing_seq: u64,                 // source of listing ids
}
pub struct Card {
    // … everything from v1 …
    inventory: Vec<u128>,             // one amount per allowlisted token, allocated at mint
    listing_id: Option<u64>,          // replaces list_price's role as the listing identity
}
```
The inventory is a **fixed-length vector inside `Card`**, with one slot per allowlisted token, created at mint.
- **No storage growth on deposit.** A deposit through `ft_transfer_call` cannot attach NEAR for storage. Because all slots exist from mint, depositing a token never grows storage.
- **Moves with the card for free.** The inventory is keyed by token id, not by owner, so it moves with the card on every transfer or sale without any extra code.

### 4.2 Methods

| Method | Who | Effect |
|---|---|---|
| `new(creator, tokens: Vec<AccountId>, base_uri)` | deployer | `tokens.len() ≤ 4`, no duplicates |
| `ft_on_transfer(sender_id, amount, msg) -> U128` | an allowlisted token contract | Parses `{"token_id"}` from `msg` and credits that card's slot. **Returns `amount` (a full refund) if the caller is not allowlisted, `msg` is invalid, or the card doesn't exist.** Emits `card_token_deposit`. |
| `withdraw_token(token_id, token, amount: Option<U128>)` | owner, 1 yocto | Refused while listed. Checks → effects (debit) → `ft_transfer(owner, amount)` with 1 yocto → callback `on_token_withdraw`. **On failure, re-credits the card**, for example when the owner isn't registered on the token. |
| `list(token_id, price)` | owner, 1 yocto | As in v1, and also assigns a new `listing_id` |
| `buy(token_id, listing_id)` | anyone but the owner, exact price | **Replaces `min_card_balance`.** Fails if `listing_id` isn't the current one. |
| `inventory(token_id)` | view | `[{token, amount}]` |
| `tokens()` | view | the allowlist with its order |
| `card(token_id)` | view | v1 fields plus `inventory` and `listing_id` |
| `stats()` | view | v1 fields plus `token_totals`, so anyone can compare them with `ft_balance_of(contract)` on each token |

### 4.3 Why `listing_id` replaces `min_card_balance`
`min_card_balance` only protects the NEAR. With an inventory, a seller could delist, withdraw the USDC, then relist at the same price.
- **With `listing_id`:** any delist or relist creates a new id, and the buyer's transaction names the id they saw. So the buyer gets **exactly** the card they reviewed: NEAR and every token.
- **Withdrawals stay blocked while listed** (NEAR and tokens), as in v1.
- **Deposits during a listing** can only add to the card, so they never hurt the buyer.

### 4.4 Events (NEP-297, standard `keepers` 2.0.0)
- New: `card_token_deposit {token_id, token, from, amount, balance}`, `card_token_withdraw {…}` and `card_token_withdraw_refunded {…}`.
- `card_listed` now carries `listing_id`.

## 5. Storage and costs

| Item | v1 | v2 |
|---|---|---|
| Per mint | ~550 B | ~550 B + 4 × 16 B inventory + 9 B `listing_id` ≈ **630 B** |
| `STORAGE_RESERVE` | 0.02 NEAR | **0.02 NEAR (unchanged)**: 630 B ≈ 0.0063 NEAR, still about 3× headroom |
| Token deposit | — | **0 new storage** (the slot already exists) |
| Contract registration on each token | — | One `storage_deposit` per allowlisted token (~0.00125 NEAR each), paid by the deployer at deploy |
| Deploy | ~3.4 NEAR | ~3.6 NEAR (slightly larger WASM) |

**Gas:**

| Call | Budget |
|---|---|
| `ft_transfer_call` from the user | 50 Tgas |
| `withdraw_token` | 40 Tgas (ft_transfer plus callback) |

The receiving owner must be registered on the token, or `ft_transfer` fails and the card is re-credited. The UI checks `storage_balance_of(owner)` first and, if needed, adds a `storage_deposit` to the same signing request.

## 6. What does not change, and why

- **The tier stays based on the NEAR balance.** Ranking a basket would need prices, and testnet has no reliable price source. Without prices we can't rank 100 USDC against 3 wNEAR, so inventing a price would bring back the problem of the old fake prices. The card shows its inventory clearly, but the tier stays honest.
- **The royalty is in NEAR**, because sales are paid in NEAR.
- **NEP-171/177/178/181 are unchanged.** `metadata.extra` adds `inventory`.

## 7. Threat model additions (how could a seller keep the tokens?)

| # | Attack | Mitigation |
|---|---|---|
| 10 | Withdraw tokens right before the sale | `withdraw_token` is refused while listed |
| 11 | Delist, withdraw, relist at the same price | The buyer's `listing_id` no longer matches, so `buy` fails |
| 12 | A fake token contract calls `ft_on_transfer` to inflate a card | Only allowlisted callers (`predecessor_account_id`) are credited; everything else is refunded |
| 13 | A token withdraw fails, and the refund goes to the caller | The callback re-credits the **card**, as with NEAR in v1 |
| 14 | Withdraw to an account that isn't registered on the token | `ft_transfer` fails, so the card is re-credited and the tokens are not lost |
| 15 | A sale and a token withdraw race each other | Withdraws are blocked while listed, and the debit happens before the promise |

**Known limit:** tokens sent with a plain `ft_transfer` (not `ft_transfer_call`) are not attributed to any card. The contract is keyless with no admin, so **they cannot be recovered**. The UI only ever uses `ft_transfer_call`. This will be documented.

## 8. Migration

- v1 is keyless and cannot be upgraded, so v2 is a **new collection** at `keepers-v2.everkeep-dev-mw0weth5.testnet`.
- **v1 cards stay on v1** with their NEAR. Owners can still withdraw it through v1.
- The UI will point to v2 by default. A small "v1 legacy" link keeps v1 cards reachable, so your Keeper #1 isn't stranded.

## 9. Tests planned (Checkpoint B′)

| Area | Cases |
|---|---|
| **Unit** | `ft_on_transfer` (allowlisted caller credited; unknown caller, bad `msg` and unknown card fully refunded); `withdraw_token` (owner-only, 1 yocto, bounds, refused while listed, callback re-credits the card on failure even after a sale); `buy` with a stale `listing_id` is refused; a sale moves the full inventory; `token_totals` equals the sum of the cards; storage per mint stays ≤ 40% of the reserve; all v1 tests adapted |
| **Sandbox** | Deploys `demo-token` twice as stand-ins for wNEAR and USDC. Fill a card with two tokens, sell it, and check the buyer can withdraw both. Then the stale-listing attack, a withdraw to an unregistered account (re-credited), and the solvency check `token_totals ≤ ft_balance_of(contract)`. |

## 10. Open questions

1. **Thematic tokens:** should we deploy 3 fictional tokens (VOLT / ORBIT / CORE) with a faucet to bring back the themes? Or stay with real testnet tokens (wNEAR, USDC, demoUSD) and use generic presets (Stable, Balanced)?
2. **4th slot:** USDT.e (Ref fakes), or keep it free?
3. **v1 in the UI:** keep a "v1 legacy" link, or point only to v2 (after you withdraw the NEAR from Keeper #1)?

**Estimate:** about 2–3 days in total (B′ contract and tests, C′ deploy, D′ UI), out of the roughly 9 days left.

## 11. Checkpoint B′ results (2026-11-05)

**Code:** `contracts/keepers` now builds v2. v1 is preserved by the git tag `keepers-v1` and by `artifacts/keepers-v1.wasm`, whose hash `B4W6Dai…` matches the testnet deployment.

**API changes compared with v1:**
- `new` takes `tokens`.
- `buy` takes `listing_id` instead of `min_card_balance`.
- `list` returns the new `listing_id`.
- New: `ft_on_transfer`, `withdraw_token`, `on_token_withdraw`, `tokens`, `inventory`.
- `card`, `config` and `stats` gain the inventory, listing and token-total fields.

**Unit tests:** 54/54 pass (`npm run test:contracts`). The 37 v1 tests are adapted (the `min_card_balance` test became the stale-`listing_id` attack, now including a token withdraw), and 17 are new:
- deposit credited;
- full refund for a non-allowlisted token, a bad `msg` or an unknown card;
- token withdraw: owner-only, 1 yocto, bounds, refused while listed, unknown token rejected;
- a failed `ft_transfer` re-credits the card even after a sale;
- a sale or transfer moves the whole inventory;
- new `listing_id` on every listing;
- storage for a mint with 4 token slots stays ≤ 40% of the reserve;
- init validation (at most 4 tokens, no duplicates).

**Sandbox:** 15/15 checks pass (`npm run test:keepers`), including 6 with real NEP-141 contracts (two `demo-token` deployments on the allowlist and a third one off it). Results are in `docs/results/keepers-sandbox.json`.

**Measured gas (sandbox):**

| Call | Gas burnt |
|---|---|
| `mint` | 4.7 Tgas |
| `buy` | 6.8 Tgas |
| `withdraw` | 5.4 Tgas |
| `ft_transfer_call` (token deposit) | 6.5 Tgas |
| `withdraw_token` | 6.8 Tgas |

**Size and storage:** the WASM is 323 KB (v1: 293 KB). The contract with 2 cards uses about 3.25 NEAR of storage.

## 12. Checkpoint C′ results (2026-11-05)

`keepers-v2.everkeep-dev-mw0weth5.testnet` is **live and keyless**:
- **Code:** hash `D5iY3Vaqqy7GG3AhTRvLf77C9KFN4FbMsoW42eYGWAEy`, the same as the build tested in B′.
- **Init and creator:** created, funded with 3.6 NEAR, deployed and initialised in one transaction (`949EfkiTmnTEHfJU2ruVAKjKvaPw4GtDsjhfSFLDiDo7`), with `creator = everkeep-dev-mw0weth5.testnet`.
- **Allowlist:** fixed forever, in this slot order: `wrap.testnet` (wNEAR), `3e2210e1…f8af` (Circle USDC testnet), `demousd-v3.everkeep-dev-mw0weth5.testnet` (demoUSD), `usdt.fakes.testnet` (USDT.e).
- **Token registration:** the contract is registered on all four tokens (`storage_deposit`, one transaction each, listed in `docs/results/keepers-v2-testnet-deployment.json`).

**Post-deploy checks (read-only):**
- no access key;
- code hash;
- `config` (creator, 10% royalty);
- `nft_metadata`;
- `tokens()` matches the allowlist;
- `storage_balance_of(contract)` is set on every token.

**Records:**
- `public/testnet.json` → `keepers` now points to v2.
- v1 is kept as `keepers_v1` and still serves its cards (Keeper #1 of v1).
- The v1 deployment record stays in `docs/results/keepers-testnet-deployment.json`.
- Redeploy (new name): `KEEPERS_VERSION=v3 npm run testnet:keepers -- --execute`.
