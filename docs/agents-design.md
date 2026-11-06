# Agent seats: design and threat model (Checkpoint 1)

Status: **approved 2026-11-06 (Q1 = b, Q2 = USDC only)**. No contract code yet. Only the day-1 wallet probe exists (`/keepers/probe`).
Builds on `docs/keepers-contract.md` and `docs/keepers-inventory.md`. Keepers v2 stays deployed and unchanged.

## 1. Goal

Any NFT a user already owns can carry a task agent: a **Buyer** or a **Payer**. The NFT stays in the user's wallet and in its own collection.

- The owner grants access **once**.
- The agent then acts **without any further signature**, within limits the contract enforces.
- The owner signs again only to change settings, stop the agent, or withdraw money.
- If the NFT changes hands, the agent stops working for the old owner.

One line for judges: *"Give an AI a card, not your wallet."*

Track 10 fit: "NFTs as accounts that own money … carry credentials, memberships or access rights". Here the NFT is the access right to run a funded agent.

## 2. Pieces

| Piece | What it is | New? |
|---|---|---|
| `agents` contract | Holds each seat's budget and policy. Checks NFT ownership on every action. Pays or buys. Logs everything. | **New** (Rust, near-sdk 5), keyless deploy |
| Agent key | An ed25519 function-call key **on the owner's own account**, with `receiver_id = agents contract` and `method_names = [agent_pay, agent_buy, pause]` | Added by the owner's wallet (probe: `/keepers/probe`) |
| Runner | A Node service that holds agent secret keys and runs the Buyer and Payer loops. Runs locally with `npm run agent:runner`; hosting it is a stretch goal. | **New** |
| Agent Dock and "My agents" | UI to create a seat, grant the key, and watch analytics | **New** pages under `/agents` |
| Keepers v2 | The market the Buyer buys from (`listings`, `buy` with `listing_id`) | Existing, unchanged |

## 3. Seat model

A **seat** binds an agent to one NFT: `(nft_contract, token_id)`.

```
Seat {
  id: u64,
  nft_contract: AccountId, token_id: String,
  kind: Buyer | Payer,              // fixed at creation
  owner: AccountId,                 // who created and funded it; checked against the NFT owner
  agent_key: Option<PublicKey>,     // the only key allowed to run this seat
  paused: bool,
  policy: Policy,
  balances: Map<Asset, u128>,       // Asset = NEAR | NEP-141 from the allowlist
  spent_today: Map<Asset, (day, u128)>,
  stats: { actions, refused, spent_total per asset },
  log: ring buffer, last 50 entries
}
Policy {
  per_tx_max: Map<Asset, u128>,
  per_day_max: Map<Asset, u128>,
  payees: Vec<AccountId>,           // Payer only, at most 10
  market: AccountId,                // Buyer only: keepers-v2 for the MVP
}
```

- **Assets** (Q2): the Payer pays in **Circle USDC testnet only**, and the Buyer pays in **NEAR**, since the Keepers market prices in NEAR. The USDC contract is fixed at `new` and cannot change.
- **Storage** (seat plus 50 log entries, about 0.08 NEAR) is paid by the owner at creation and refunded when the seat is closed.

## 4. Who can call what

| Method | Caller | Deposit | Effect |
|---|---|---|---|
| `create_seat(nft_contract, token_id, kind, policy)` | NFT owner, checked by cross-call | storage | New seat |
| `fund(seat_id)` / `ft_transfer_call(msg = seat_id)` | `seat.owner` | NEAR / FT | Adds budget |
| `set_policy`, `set_agent_key(pk)`, `withdraw`, `close_seat` | `seat.owner` | **1 yocto** | Owner-only. A function-call key cannot attach a deposit, so the agent key **can never call these.** |
| `pause(seat_id)` | `seat.owner` (any key, including the agent key) | none | Kill switch. If the runner leaks, an attacker can only stop the agent. |
| `resume(seat_id)` | `seat.owner` | **1 yocto** | Owner-only |
| `agent_pay(seat_id, payee, asset, amount, memo)` | agent key only | none | Payer action (§5) |
| `agent_buy(seat_id, token_id, listing_id, price)` | agent key only | none | Buyer action (§5) |
| `claim_seat(seat_id)` | the new NFT owner | 1 yocto | Takes over a seat after a sale (§6) |
| Views: `seat`, `seats_for_owner`, `seats_for_nft`, `seat_log`, `stats` | anyone | — | Analytics |

The **agent-only** check has three parts:
- `predecessor == signer`: the call is direct, not made through another contract;
- `signer == seat.owner`;
- `env::signer_account_pk() == seat.agent_key`.

So another app key on the same account cannot run the seat. Rotating or revoking the agent needs only `set_agent_key`; deleting the key from the account (`DeleteKey`) also works.

## 5. One agent action, step by step

```
agent_pay / agent_buy   (signed by the agent key, no deposit)
 1. agent-only check (§4) and not paused             -> else panic (not this seat's agent)
 2. policy check: payee allowed / market allowed,
    amount <= per_tx_max, spent_today + amount <= per_day_max,
    amount <= balance                                -> else LOG "refused: <reason>", return false
 3. debit the balance and spent_today now (no double spend while in flight)
 4. cross-call nft_contract.nft_token(token_id)      (5 Tgas)
 5. callback: owner_id == seat.owner ?
      no  -> credit back, reset the seat (§6), LOG "refused: NFT changed hands"
      yes -> Payer: transfer NEAR or ft_transfer (1 yocto paid by the contract)
             Buyer: keepers-v2.buy{value: price} then nft_transfer of the bought card to seat.owner
 6. final callback: success -> LOG "done", tx hash visible in explorer
                    failure -> credit back, LOG "failed: <reason>"
```

- **Refusals do not panic.** A panic would roll back the log entry, and "the agent tried 3 USDC and was blocked at 2" is the most useful line in the analytics. Only calls that are not from this seat's agent panic.
- **The Buyer's taste** (tier, maximum price) is chosen by the runner. **The contract enforces the money**: the market, per-transaction and per-day caps, and the budget. The README will say this plainly.
- **Gas**: about 100 Tgas for a payment and 150 for a purchase. The key allowance is set to 1 test NEAR, which allows about 100 actions; the Dock shows what remains (`view_access_key`).

## 6. When the NFT changes hands

NEP-171 sends no notice to us when the NFT is sold elsewhere, so the contract checks the owner on every action (step 4) and on `claim_seat`.

**Decision Q1 (2026-11-06): (b), the funder keeps the budget.**

| Option | Rule | For | Against |
|---|---|---|---|
| **(b) Funder keeps it** *(chosen)* | The budget belongs to `seat.owner`, the funder. They can `withdraw` at any time, even after selling. The new owner gets the seat's identity and history, and funds it again. | Safe for an NFT sold on Paras or Mintbase by a seller who never thought about the seat. Removes the check-then-act race on money. | The NFT "owns" the agent and its record, not the money. |
| (a) Money follows the NFT | As in Keepers: the new owner claims the budget. | The strongest track story. | An unaware seller can lose money on a third-party market. |

With (b), on a detected owner change:
- the seat is paused;
- `agent_key`, `payees` and the caps are cleared;
- `kind`, `stats` and `log` stay;
- the old balance stays withdrawable by the old owner.

`claim_seat` lets the new owner, after a cross-call check, become `seat.owner` with an empty budget and empty settings.

## 7. Threat model

| Threat | What stops it |
|---|---|
| Runner or agent key leaked | The key can only call `agent_pay`, `agent_buy` and `pause` on this contract with no deposit, so it cannot withdraw, change limits or transfer the NFT. The worst case is the policy's daily cap paid to **allowlisted** payees, or Keepers bought for the owner. `pause` and `DeleteKey` stop it. |
| Prompt injection ("pay evil.testnet") | `payees` allowlist; refused and logged |
| Agent loops and drains the budget | `per_tx_max`, `per_day_max`, and the budget itself |
| Agent drains the owner's gas | The key's allowance (1 NEAR) is the ceiling |
| Old owner's agent keeps acting after a sale | Ownership cross-check on every action; the seat resets |
| Sale between the check and the payment (a few blocks) | Under (b), the money is the funder's own, so no buyer funds are at risk. Under (a), the risk is bounded by `per_tx_max`. |
| Payee not registered on the FT | `ft_transfer` fails, the callback credits back, and the log says "failed" |
| Buyer pays and the card goes to the wrong place | The contract is the buyer, then transfers to `seat.owner` in a callback. Keepers checks `listing_id`, so the price cannot change under us. |
| Another app key on the owner's account runs the seat | `signer_account_pk == seat.agent_key` |
| A fake NFT contract claims ownership | The seat stores `nft_contract`. A fake contract can only fake its own NFTs, and the money in such a seat is the funder's own. |
| Storage griefing (log growth) | Fixed 50-entry ring buffer, paid at creation |

Not covered (written in the README):
- the runner's choices within the limits, such as a bad purchase under the cap;
- trust in the third-party NFT contract's `nft_token` answer;
- testnet only.

## 8. Tests (sandbox, near-workspaces)

1. A Payer pays an allowlisted payee within the caps: done and logged.
2. Over `per_tx_max`, over `per_day_max`, a payee not on the list, or a balance too low: `false`, logged as refused, balance unchanged.
3. The agent key calls `withdraw` or `set_policy`: rejected by the protocol, since a function-call key cannot attach a deposit.
4. Another key of the owner calls `agent_pay`: panics.
5. **Sale mid-flight**: the NFT is transferred, then the agent acts. Refused, the seat resets, the old owner can still withdraw (Q1 = b), and the new owner can `claim_seat`.
6. The Buyer buys a listed Keeper: the card arrives in `seat.owner`'s wallet and the price is debited. The listing changes in the meantime: credited back, logged "failed".
7. FT payee not registered: credited back.
8. Pause by the agent key works; resume by the agent key is rejected.
9. Option 1 with an NFT from **another** collection (Keepers v1 in tests, plus a third-party testnet collection for the demo; to pick at Checkpoint 3).

## 9. Plan (checkpoints)

| Checkpoint | Content | Target |
|---|---|---|
| **0 ✅** | Wallet probe: **Intear accepts `AddKey` (method A)**. On 2026-11-06 a function-call key (one method, the Keepers contract, 0.05 NEAR allowance) was added to `nifelst.testnet` with one wallet signature, read back from chain, then deleted. Method B was not needed. | 2026-11-06 |
| **1 (this doc)** | Design and threat model. Answer Q1 and Q2. | 2026-11-06 |
| 2 | `contracts/agents` plus the sandbox tests in §8 | 2026-11-07 |
| 3 ✅ | **Live, keyless: `agents-v1.everkeep-dev-mw0weth5.testnet`** (code hash `9U2S5GhWuR68DSQQ7kPdYXxWe4emkL8cVzfUP4Yr76rY`, same as the sandbox-tested wasm), registered on Circle USDC testnet. Record: `docs/results/agents-v1-testnet-deployment.json`. Third-party collection for the demo: `nft.examples.testnet` (NEAR's NFT tutorial contract) or `paras-token-v2.testnet`, both answer NEP-171 on testnet; to confirm with a real mint at Checkpoint 5. | 2026-11-06 |
| 4 | Runner: Buyer and Payer loops, key generation (the secret never leaves the runner) | 2026-11-09 |
| 5 | Agent Dock and "My agents" analytics. **Feature freeze at the end of 2026-11-10.** | 2026-11-10 |
| 6 | Stretch: "steal our agent" key, hosted runner, user story, demo on a third-party collection | 2026-11-11 → 12 |
| F | README, video, X post (with the user's yes) | 2026-11-13 → 14 |

**Decision Q2 (2026-11-06): USDC testnet only.**
- **USDC testnet (Circle) only** *(chosen)*: one clear story ("pays my subscriptions in USDC").
- **NEAR plus USDC**: more general, but more UI states to handle.
