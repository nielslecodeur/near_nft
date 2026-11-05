# Keepers v2 — security audit

- **Date:** 2026-11-05.
- **Scope:** `contracts/keepers/src/lib.rs` (v2, deployed keyless as `keepers-v2.everkeep-dev-mw0weth5.testnet`, code hash `D5iY3Vaq…`).
- **Method:** the official NEAR agent skill `near-contract-audit` (near/agent-skills): its 15 detectors applied by manual review. I also checked the rules of the `near-smart-contracts` skill. No automated NEAR scanner was run.

## Summary

| Severity | Count | Fix needs a new deployment (v3)? |
|---|---|---|
| High | 0 | — |
| Medium | 1 (latent, not triggered by the current tokens) | yes |
| Low / informational | 5 | optional |

All 8 high-severity detectors pass:
- **non-private callbacks:** every callback is `#[private]`, and `ft_on_transfer` checks the token allowlist;
- **reentrancy:** state is written before every promise;
- **types:** U128 is used for every amount;
- **unsaved changes:** every mutated `Card` is re-inserted;
- **owner checks:** present on `withdraw`, `withdraw_token`, `list` and `delist`;
- **`assert_one_yocto`:** present on every owner action;
- **storage prefixes:** each prefix is unique;
- **initialisation:** `#[init]` with `PanicOnDefault`.

`overflow-checks = true` is set in the workspace release profile. There is no floating-point math.

## Findings

### M1 — Callback success check treats a long success value as a failure (Medium, latent)

- **Where:** `on_token_withdraw` (`promise_result_checked(0, 64).is_ok()`), and in the same way `on_withdraw` and `on_payout` (`max_len = 0`).
- **What:** `promise_result_checked` returns `Err(PromiseError::TooLong)` when the promise **succeeded** but returned more than `max_len` bytes. `.is_ok()` treats that like `Failed`.
- **Scenario:** an allowlisted token whose `ft_transfer` returns more than 64 bytes. The owner calls `withdraw_token` and the tokens leave the contract, but the callback re-credits the card, so the owner can withdraw a second time. The contract would then owe more than it holds (`token_totals > ft_balance_of(contract)`).
- **Exposure today:**
  - NEAR transfers always return an empty value, so `on_withdraw` and `on_payout` are safe.
  - The four allowlisted tokens are standard NEP-141 contracts whose `ft_transfer` returns nothing. A wNEAR withdraw was verified on testnet.
  - The allowlist is fixed forever, so no other token can be added.
- **Check before the demo:** after one `withdraw_token` per token (USDC, USDT.e, demoUSD), compare `stats().token_totals` with `ft_balance_of(keepers-v2)` on each token. They must be equal.
- **Fix (v3):** treat only `Err(PromiseError::Failed)` as a failure:
  ```rust
  if !matches!(env::promise_result_checked(0, 0), Err(near_sdk::PromiseError::Failed)) {
      return true;
  }
  ```

### L1 — Fixed callback and `ft_transfer` gas (Low)

- `GAS_FOR_CALLBACK` is 10 Tgas and `GAS_FOR_FT_TRANSFER` is 15 Tgas. Both are enough according to the sandbox and testnet runs, including the re-credit path. The `near-smart-contracts` skill recommends about 30 Tgas for cross-contract calls.
- **Scenario:** if a callback ran out of gas after a failed transfer, the debit would stand while the tokens stayed in the contract. They would not be lost, but they would no longer be attributed to any card.
- **Fix (v3):** 20 Tgas for callbacks and 30 Tgas for `ft_transfer`. The front end already attaches 30–50 Tgas per call.

### L2 — DNA from `env::random_seed()` (Low, by design)
Validators can bias the seed, and a minter can wait for a convenient block. The DNA only drives the art; it never affects money or tier. This is documented in `docs/keepers-contract.md`.

### L3 — Card funds and contract storage share one balance (Informational)
The runtime counts the NEAR owed to cards as part of the account balance that pays for storage. If storage grew past the per-mint reserves, it would be paid out of what the cards hold.
- **Bounded:**
  - each mint prepays 0.02 NEAR for about 630 bytes;
  - a listing adds 24 bytes;
  - an owner set exists only while the owner holds a card.
- `stats()` exposes every term so anyone can check solvency.

### L4 — Native integers in a few JSON fields (Informational)
- `limit: Option<u64>` and `approval_id: Option<u64>` follow NEP-171/181.
- `dna: u32`, `tier: u8`, `trades: u32`, `minted` and `max_supply` stay far below 2^53, so they are safe for JavaScript.
- Every amount is `U128`.

### L5 — No minimum on deposits (Informational)
`deposit` and `ft_on_transfer` accept any non-zero amount. Neither grows storage (inventory slots are allocated at mint), so spam only costs the spammer gas and produces events.

## Also checked (no issue)

- **Seller-side attacks:**
  - emptying a listed card is refused;
  - delist, empty, relist fails because the buyer names the old `listing_id`;
  - approvals are cleared on every transfer;
  - a failed withdraw (NEAR or token) re-credits the **card**, even after a sale;
  - a fake token calling `ft_on_transfer` is refunded in full.
- **Wrong deposits:** an unknown card or an invalid `msg` in `ft_on_transfer` returns a full refund.
- **Arithmetic:** `price * ROYALTY_BPS` cannot overflow `u128` for any amount that can actually be attached.
- **View limits:** every paginated view caps `limit` at 50, and the only loop in `new` runs over 4 or fewer tokens.
- **Storage layout:** the `StorageKey` layout matches the official near-sdk NFT example. The internal `TokensPerOwner` keys of near-contract-standards are hashed per account.
