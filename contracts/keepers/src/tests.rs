use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::{PromiseResult, testing_env};

const CONTRACT: &str = "keepers.testnet";
const CREATOR: &str = "creator.testnet";
const ALICE: &str = "alice.testnet";
const BOB: &str = "bob.testnet";
const CAROL: &str = "carol.testnet";
const MINT_COST: u128 = MINT_PRICE + STORAGE_RESERVE;
/// Two allowlisted NEP-141 tokens (inventory slots 0 and 1).
const TOKEN_A: &str = "wrap.testnet";
const TOKEN_B: &str = "usdc.testnet";
const FAKE_TOKEN: &str = "fake-usdc.testnet";

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

/// Sets the next call's context. `result` simulates the outcome of the promise a callback awaits.
fn ctx_full(predecessor: &str, deposit: u128, now: u64, result: Option<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id(CONTRACT))
        .signer_account_id(id(predecessor))
        .predecessor_account_id(id(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(now)
        .random_seed([now as u8; 32])
        .account_balance(NearToken::from_near(1_000));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::default(),
        result.into_iter().collect()
    );
}

fn ctx(predecessor: &str, deposit: u128) {
    ctx_full(predecessor, deposit, 1_000, None);
}

fn setup() -> Contract {
    ctx(CREATOR, 0);
    Contract::new(id(CREATOR), vec![id(TOKEN_A), id(TOKEN_B)], None)
}

/// The listing id a buyer sees right now (0 when not listed).
fn listing(c: &Contract, token: &str) -> U64 {
    card(c, token).listing_id.unwrap_or(U64(0))
}

/// Simulates `ft_transfer_call` on token slot `slot` crediting card `token`.
fn fill(c: &mut Contract, token: &str, slot: usize, amount: u128) -> U128 {
    ctx([TOKEN_A, TOKEN_B][slot], 0);
    match c.ft_on_transfer(
        id(CAROL),
        U128(amount),
        format!("{{\"token_id\":\"{token}\"}}"),
    ) {
        PromiseOrValue::Value(refund) => refund,
        PromiseOrValue::Promise(_) => panic!("unexpected promise"),
    }
}

/// ft_transfer calls created by the last call, as (token contract, receiver, amount).
fn ft_transfers() -> Vec<(String, String, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let to = r.receiver_id.to_string();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::FunctionCallWeight {
                    method_name, args, ..
                } if method_name == b"ft_transfer" => {
                    let v: serde_json::Value = serde_json::from_slice(&args).unwrap();
                    Some((
                        to.clone(),
                        v["receiver_id"].as_str().unwrap().to_string(),
                        v["amount"].as_str().unwrap().parse().unwrap(),
                    ))
                }
                _ => None,
            })
        })
        .collect()
}

fn slot(c: &Contract, token: &str, slot: usize) -> u128 {
    card(c, token).inventory[slot].amount.0
}

fn mint_to(c: &mut Contract, who: &str) -> TokenId {
    ctx(who, MINT_COST);
    c.mint().token_id
}

/// NEAR transfers created by the last call, as (receiver, yoctoNEAR).
fn transfers() -> Vec<(String, u128)> {
    get_created_receipts()
        .into_iter()
        .flat_map(|r| {
            let to = r.receiver_id.to_string();
            r.actions.into_iter().filter_map(move |a| match a {
                MockAction::Transfer { deposit, .. } => Some((to.clone(), deposit.as_yoctonear())),
                _ => None,
            })
        })
        .collect()
}

fn events(name: &str) -> Vec<serde_json::Value> {
    get_logs()
        .into_iter()
        .filter_map(|l| {
            l.strip_prefix("EVENT_JSON:")
                .map(|s| serde_json::from_str(s).unwrap())
        })
        .filter(|e: &serde_json::Value| e["event"] == name)
        .collect()
}

fn card(c: &Contract, token: &str) -> CardView {
    c.card(token.to_string()).expect("card exists")
}

/// The contract's books always match the sum of the card balances, in NEAR and per token.
fn assert_books(c: &Contract) {
    let cards = c.cards(None, None);
    let sum: u128 = cards.iter().map(|v| v.balance.0).sum();
    assert_eq!(sum, c.total_card_balances, "total_card_balances drifted");
    for (i, total) in c.token_totals.iter().enumerate() {
        let sum: u128 = cards.iter().map(|v| v.inventory[i].amount.0).sum();
        assert_eq!(sum, *total, "token_totals[{i}] drifted");
    }
}

fn deposit(c: &mut Contract, token: &str, amount: u128) {
    ctx(CAROL, amount);
    c.deposit(token.to_string());
}

fn list(c: &mut Contract, owner: &str, token: &str, price: u128) -> U64 {
    ctx(owner, 1);
    c.list(token.to_string(), U128(price))
}

// ---------------------------------------------------------------------------
// Mint: the creator gets the mint payment and nothing else
// ---------------------------------------------------------------------------

#[test]
fn mint_pays_creator_exact_price_and_refunds_excess() {
    let mut c = setup();
    ctx(ALICE, 2 * ONE_NEAR);
    let token = c.mint();
    assert_eq!(token.token_id, "1");
    assert_eq!(token.owner_id, id(ALICE));
    let t = transfers();
    assert!(t.contains(&(CREATOR.into(), MINT_PRICE)));
    assert!(t.contains(&(ALICE.into(), 2 * ONE_NEAR - MINT_COST)));
    assert_eq!(t.len(), 2);
    assert_eq!(events("nft_mint").len(), 1);
    let v = card(&c, "1");
    assert_eq!((v.balance.0, v.tier, v.trades), (0, 0, 0));
    assert_eq!(v.tier_name, "matte");
}

#[test]
fn mint_with_exact_cost_sends_no_refund() {
    let mut c = setup();
    ctx(ALICE, MINT_COST);
    c.mint();
    assert_eq!(transfers(), vec![(CREATOR.to_string(), MINT_PRICE)]);
}

#[test]
#[should_panic(expected = "Attach at least 1.02 NEAR")]
fn mint_rejects_insufficient_deposit() {
    let mut c = setup();
    ctx(ALICE, MINT_COST - 1);
    c.mint();
}

#[test]
fn mint_storage_fits_well_within_reserve() {
    let mut c = setup();
    mint_to(&mut c, ALICE); // first token creates contract-level structures
    ctx(BOB, MINT_COST);
    let before = env::storage_usage();
    c.mint();
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used * 100 <= STORAGE_RESERVE * 40,
        "mint used {used} yocto of storage"
    );
}

#[test]
fn token_ids_are_sequential_and_dna_is_set() {
    let mut c = setup();
    assert_eq!(mint_to(&mut c, ALICE), "1");
    ctx_full(BOB, MINT_COST, 2_000, None);
    assert_eq!(c.mint().token_id, "2");
    assert_ne!(card(&c, "1").dna, card(&c, "2").dna);
    assert_eq!(c.nft_total_supply().0, 2);
}

// ---------------------------------------------------------------------------
// C. Tier computation
// ---------------------------------------------------------------------------

#[test]
fn tier_boundaries() {
    assert_eq!(tier_for(0), 0);
    assert_eq!(tier_for(ONE_NEAR / 2 - 1), 0);
    assert_eq!(tier_for(ONE_NEAR / 2), 1);
    assert_eq!(tier_for(2 * ONE_NEAR - 1), 1);
    assert_eq!(tier_for(2 * ONE_NEAR), 2);
    assert_eq!(tier_for(10 * ONE_NEAR - 1), 2);
    assert_eq!(tier_for(10 * ONE_NEAR), 3);
    assert_eq!(tier_for(u128::MAX), 3);
    assert_eq!(next_tier_at(0), Some(ONE_NEAR / 2));
    assert_eq!(next_tier_at(3 * ONE_NEAR), Some(10 * ONE_NEAR));
    assert_eq!(next_tier_at(10 * ONE_NEAR), None);
}

#[test]
fn deposits_raise_tier_and_emit_tier_events() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR / 2);
    assert_eq!(events("card_tier")[0]["data"][0]["to"], "brushed");
    deposit(&mut c, &t, ONE_NEAR);
    assert!(
        events("card_tier").is_empty(),
        "no tier change inside a tier"
    );
    deposit(&mut c, &t, ONE_NEAR / 2);
    assert_eq!(card(&c, &t).tier_name, "holographic");
    deposit(&mut c, &t, 8 * ONE_NEAR);
    let v = card(&c, &t);
    assert_eq!(
        (v.tier, v.tier_name.as_str(), v.next_tier_at),
        (3, "animated", None)
    );
    assert_eq!(v.deposited_total.0, 10 * ONE_NEAR);
    assert_eq!(c.tier_of(t), 3);
    assert_books(&c);
}

#[test]
#[should_panic(expected = "Attach the NEAR to deposit")]
fn deposit_requires_funds() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(CAROL, 0);
    c.deposit(t);
}

// ---------------------------------------------------------------------------
// A. Withdraw
// ---------------------------------------------------------------------------

#[test]
fn owner_withdraws_part_then_all() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, 3 * ONE_NEAR);

    ctx(ALICE, 1);
    let _ = c.withdraw(t.clone(), Some(U128(ONE_NEAR)));
    assert_eq!(transfers(), vec![(ALICE.to_string(), ONE_NEAR)]);
    assert_eq!(card(&c, &t).balance.0, 2 * ONE_NEAR);
    assert_eq!(card(&c, &t).tier_name, "holographic");

    ctx(ALICE, 1);
    let _ = c.withdraw(t.clone(), None);
    assert_eq!(transfers(), vec![(ALICE.to_string(), 2 * ONE_NEAR)]);
    assert_eq!(events("card_tier")[0]["data"][0]["to"], "matte");
    let v = card(&c, &t);
    assert_eq!(
        (v.balance.0, v.withdrawn_total.0, v.tier),
        (0, 3 * ONE_NEAR, 0)
    );
    assert_books(&c);
}

#[test]
#[should_panic(expected = "Only the owner can withdraw")]
fn withdraw_is_owner_only() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    ctx(BOB, 1);
    let _ = c.withdraw(t, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_requires_one_yocto() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    ctx(ALICE, 0);
    let _ = c.withdraw(t, None);
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn withdraw_cannot_exceed_balance() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.withdraw(t, Some(U128(ONE_NEAR + 1)));
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn withdraw_of_empty_card_fails() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(ALICE, 1);
    let _ = c.withdraw(t, None);
}

#[test]
#[should_panic(expected = "Delist the card before withdrawing")]
fn withdraw_is_refused_while_listed() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.withdraw(t, None);
}

#[test]
fn failed_withdraw_recredits_the_card_not_the_caller() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, 2 * ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.withdraw(t.clone(), None);
    assert_eq!(card(&c, &t).balance.0, 0);

    // The card is sold before the failed transfer's callback runs.
    ctx(ALICE, 1);
    c.nft_transfer(id(BOB), t.clone(), None, None);

    ctx_full(CONTRACT, 0, 1_000, Some(PromiseResult::Failed));
    assert!(!c.on_withdraw(t.clone(), U128(2 * ONE_NEAR)));
    let v = card(&c, &t);
    assert_eq!(v.balance.0, 2 * ONE_NEAR, "funds return to the card");
    assert_eq!(v.owner_id, id(BOB), "and so belong to the new owner");
    assert_eq!(v.withdrawn_total.0, 0);
    assert_eq!(events("card_withdraw_refunded").len(), 1);
    assert_books(&c);
}

#[test]
fn successful_withdraw_callback_changes_nothing() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.withdraw(t.clone(), None);
    ctx_full(CONTRACT, 0, 1_000, Some(PromiseResult::Successful(vec![])));
    assert!(c.on_withdraw(t.clone(), U128(ONE_NEAR)));
    assert_eq!(card(&c, &t).balance.0, 0);
    assert_books(&c);
}

// `#[private]` on callbacks is enforced by the WASM entry point, not by direct
// calls in unit tests; scripts/keepers-proof.ts checks it against the real contract.

// ---------------------------------------------------------------------------
// B. Royalty split on resale
// ---------------------------------------------------------------------------

#[test]
fn resale_credits_royalty_to_the_card_and_rest_to_seller() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, 5 * ONE_NEAR);
    assert_eq!(c.listings(None, None).len(), 1);

    ctx_full(BOB, 5 * ONE_NEAR, 5_000, None);
    let _ = c.buy(t.clone(), listing(&c, &t));
    let royalty = 5 * ONE_NEAR / 10;
    // Seller is paid price - royalty; the creator receives nothing on resale.
    assert_eq!(
        transfers(),
        vec![(ALICE.to_string(), 5 * ONE_NEAR - royalty)]
    );
    let v = card(&c, &t);
    assert_eq!(v.owner_id, id(BOB));
    assert_eq!(v.balance.0, royalty);
    assert_eq!(v.royalties_earned.0, royalty);
    assert_eq!(v.trades, 1);
    assert_eq!(v.list_price, None);
    assert_eq!(v.held_since.0, 5_000);
    assert_eq!(v.tier_name, "brushed", "0.5 NEAR royalty reaches tier 1");
    assert_eq!(
        events("card_sold")[0]["data"][0]["royalty"],
        royalty.to_string()
    );
    assert_eq!(events("card_tier")[0]["data"][0]["to"], "brushed");
    assert_eq!(events("nft_transfer").len(), 1);
    assert!(c.listings(None, None).is_empty());
    assert_books(&c);
}

#[test]
fn royalty_accumulates_over_several_sales() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, 10 * ONE_NEAR);
    ctx(BOB, 10 * ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
    list(&mut c, BOB, &t, 20 * ONE_NEAR);
    ctx(CAROL, 20 * ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
    let v = card(&c, &t);
    assert_eq!(
        (v.balance.0, v.trades, v.owner_id),
        (3 * ONE_NEAR, 2, id(CAROL))
    );
    assert_eq!(v.tier_name, "holographic");
    assert_books(&c);
}

#[test]
fn royalty_rounds_down_and_split_is_exact() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    let price = MIN_LIST_PRICE + 7; // not divisible by 10
    list(&mut c, ALICE, &t, price);
    ctx(BOB, price);
    let _ = c.buy(t.clone(), listing(&c, &t));
    let royalty = card(&c, &t).balance.0;
    assert_eq!(royalty, price * ROYALTY_BPS / BPS_DENOMINATOR);
    assert_eq!(transfers(), vec![(ALICE.to_string(), price - royalty)]);
}

#[test]
#[should_panic(expected = "Attach exactly the list price")]
fn buy_requires_exact_price() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(BOB, ONE_NEAR - 1);
    let _ = c.buy(t.clone(), listing(&c, &t));
}

#[test]
#[should_panic(expected = "Not listed")]
fn buy_requires_listing() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(BOB, ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
}

#[test]
#[should_panic(expected = "You already own this card")]
fn owner_cannot_buy_own_card() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
}

#[test]
#[should_panic(expected = "Listing changed since you reviewed it")]
fn buyer_is_protected_by_listing_id() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, 2 * ONE_NEAR);
    fill(&mut c, &t, 0, 500);
    // The buyer reviews listing #1 (2 NEAR + 500 token units)…
    list(&mut c, ALICE, &t, ONE_NEAR);
    let reviewed = listing(&c, &t);
    // …the seller delists, empties the card, relists at the same price.
    ctx(ALICE, 1);
    c.delist(t.clone());
    ctx(ALICE, 1);
    let _ = c.withdraw(t.clone(), None);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_A), None);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(BOB, ONE_NEAR);
    let _ = c.buy(t, reviewed);
}

#[test]
#[should_panic(expected = "Minimum price is 0.1 NEAR")]
fn list_enforces_minimum_price() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, MIN_LIST_PRICE - 1);
}

#[test]
#[should_panic(expected = "Only the owner can list")]
fn list_is_owner_only() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, BOB, &t, ONE_NEAR);
}

#[test]
fn failed_seller_payout_becomes_claimable() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(BOB, ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
    let proceeds = ONE_NEAR - ONE_NEAR / 10;

    ctx_full(CONTRACT, 0, 1_000, Some(PromiseResult::Failed));
    assert!(!c.on_payout(id(ALICE), U128(proceeds)));
    assert_eq!(c.pending_payout(id(ALICE)).0, proceeds);
    assert_eq!(c.total_pending_payouts, proceeds);
    // The sale itself stands.
    assert_eq!(card(&c, &t).owner_id, id(BOB));

    ctx(ALICE, 0);
    let _ = c.claim_payout();
    assert_eq!(transfers(), vec![(ALICE.to_string(), proceeds)]);
    assert_eq!(c.pending_payout(id(ALICE)).0, 0);
    assert_eq!(c.total_pending_payouts, 0);
}

#[test]
#[should_panic(expected = "Nothing to claim")]
fn claim_without_pending_payout_fails() {
    let mut c = setup();
    ctx(ALICE, 0);
    let _ = c.claim_payout();
}

// ---------------------------------------------------------------------------
// Transfer (NEP-171) and access
// ---------------------------------------------------------------------------

#[test]
fn transfer_moves_balance_tier_and_access_together() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, 2 * ONE_NEAR);
    assert!(c.is_holder(id(ALICE)));
    assert!(!c.is_holder(id(BOB)));

    ctx_full(ALICE, 1, 9_000, None);
    c.nft_transfer(id(BOB), t.clone(), None, None);
    let v = card(&c, &t);
    assert_eq!(v.owner_id, id(BOB));
    assert_eq!(v.balance.0, 2 * ONE_NEAR, "the money moves with the NFT");
    assert_eq!(v.tier_name, "holographic");
    assert_eq!(v.held_since.0, 9_000);
    assert_eq!(v.trades, 0, "a gift is not a trade");
    assert!(!c.is_holder(id(ALICE)), "the seller loses access");
    assert!(c.is_holder(id(BOB)));

    // The previous owner can no longer withdraw.
    ctx(ALICE, 1);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.withdraw(t.clone(), None);
    }));
    assert!(r.is_err());
}

#[test]
fn transfer_cancels_listing() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, 1);
    c.nft_transfer(id(BOB), t.clone(), None, None);
    assert_eq!(card(&c, &t).list_price, None);
    assert_eq!(events("card_delisted").len(), 1);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn transfer_requires_one_yocto() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(ALICE, 0);
    c.nft_transfer(id(BOB), t, None, None);
}

#[test]
#[should_panic(expected = "Sender not approved")]
fn stranger_cannot_transfer() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(CAROL, 1);
    c.nft_transfer(id(CAROL), t, None, None);
}

#[test]
fn approved_account_can_transfer_once_and_approvals_are_cleared() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(ALICE, ONE_NEAR / 100); // storage deposit for the approval
    let _ = c.nft_approve(t.clone(), id(CAROL), None);
    // near-contract-standards numbers approvals from 1.
    assert!(c.nft_is_approved(t.clone(), id(CAROL), Some(1)));

    ctx(CAROL, 1);
    c.nft_transfer(id(BOB), t.clone(), Some(1), None);
    assert_eq!(card(&c, &t).owner_id, id(BOB));
    assert!(
        !c.nft_is_approved(t.clone(), id(CAROL), None),
        "approvals cleared on transfer"
    );
}

#[test]
fn approvals_are_cleared_by_a_sale() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(ALICE, ONE_NEAR / 100);
    let _ = c.nft_approve(t.clone(), id(CAROL), None);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(BOB, ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
    assert!(
        !c.nft_is_approved(t, id(CAROL), None),
        "the seller's approvals die with the sale"
    );
}

#[test]
fn returned_transfer_call_resets_holding_for_previous_owner() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.nft_transfer_call(id(BOB), t.clone(), None, None, "".into());
    assert_eq!(card(&c, &t).list_price, None);
    // The receiver returns the token (nft_on_transfer -> true).
    ctx_full(
        CONTRACT,
        0,
        7_000,
        Some(PromiseResult::Successful(b"true".to_vec())),
    );
    assert!(!c.nft_resolve_transfer(id(ALICE), id(BOB), t.clone(), None));
    let v = card(&c, &t);
    assert_eq!((v.owner_id, v.held_since.0), (id(ALICE), 7_000));
}

// ---------------------------------------------------------------------------
// NEP-177 dynamic metadata and views
// ---------------------------------------------------------------------------

#[test]
fn token_metadata_follows_the_tier() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    let m = c.nft_token(t.clone()).unwrap().metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Keeper #1 · Matte"));
    let matte_media = m.media.unwrap();
    assert!(matte_media.starts_with("data:image/svg+xml,"));
    assert!(!matte_media.contains('#') && !matte_media.contains('<'));

    deposit(&mut c, &t, 10 * ONE_NEAR);
    let m = c.nft_token(t.clone()).unwrap().metadata.unwrap();
    assert_eq!(m.title.as_deref(), Some("Keeper #1 · Animated"));
    assert!(m.media.unwrap().contains("animateTransform"));
    let extra: CardView = serde_json::from_str(&m.extra.unwrap()).unwrap();
    assert_eq!(extra, card(&c, &t));
}

#[test]
fn enumeration_returns_dynamic_tokens() {
    let mut c = setup();
    mint_to(&mut c, ALICE);
    mint_to(&mut c, BOB);
    let all = c.nft_tokens(None, None);
    assert_eq!(all.len(), 2);
    assert!(
        all.iter()
            .all(|t| t.metadata.as_ref().unwrap().media.is_some())
    );
    assert_eq!(c.nft_tokens_for_owner(id(BOB), None, None)[0].token_id, "2");
    assert_eq!(c.cards_for_owner(id(ALICE), None, None)[0].token_id, "1");
    assert_eq!(c.nft_metadata().symbol, "KEEPER");
    assert!(c.card("99".into()).is_none());
}

#[test]
fn every_dna_and_tier_renders_valid_looking_svg() {
    for dna in [0u32, 1, 0xFFFF_FFFF, 0x1234_5678, 0x0F0F_0F0F] {
        for tier in 0..4u8 {
            let s = art::svg(dna, tier);
            assert!(s.starts_with("<svg") && s.ends_with("</svg>"));
            assert!(!s.contains('"'), "attributes use single quotes");
        }
    }
}

// ---------------------------------------------------------------------------
// v2 inventory: the card holds NEP-141 tokens
// ---------------------------------------------------------------------------

#[test]
fn allowlisted_token_deposit_credits_the_card() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    assert_eq!(fill(&mut c, &t, 0, 700).0, 0, "nothing refunded");
    assert_eq!(fill(&mut c, &t, 1, 50).0, 0);
    assert_eq!(fill(&mut c, &t, 0, 300).0, 0);
    assert_eq!((slot(&c, &t, 0), slot(&c, &t, 1)), (1_000, 50));
    let e = &events("card_token_deposit")[0]["data"][0];
    assert_eq!(e["token"], TOKEN_A);
    assert_eq!(e["balance"], "1000");
    assert_eq!(c.inventory(t.clone())[1].token, id(TOKEN_B));
    assert_eq!(
        card(&c, &t).tier,
        0,
        "tokens never change the NEAR-based tier"
    );
    assert_books(&c);
}

#[test]
fn non_allowlisted_token_is_fully_refunded() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(FAKE_TOKEN, 0);
    let refund = c.ft_on_transfer(id(CAROL), U128(1_000), format!("{{\"token_id\":\"{t}\"}}"));
    assert!(matches!(refund, PromiseOrValue::Value(U128(1_000))));
    assert_eq!(slot(&c, &t, 0) + slot(&c, &t, 1), 0);
    assert_books(&c);
}

#[test]
fn bad_message_or_unknown_card_is_fully_refunded() {
    let mut c = setup();
    mint_to(&mut c, ALICE);
    for msg in ["", "not json", "{\"token_id\":\"99\"}", "{\"card\":\"1\"}"] {
        ctx(TOKEN_A, 0);
        let refund = c.ft_on_transfer(id(CAROL), U128(42), msg.into());
        assert!(
            matches!(refund, PromiseOrValue::Value(U128(42))),
            "msg {msg:?}"
        );
    }
    assert_eq!(c.token_totals, vec![0, 0]);
}

#[test]
fn owner_withdraws_a_token() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 1, 900);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_B), Some(U128(400)));
    assert_eq!(
        ft_transfers(),
        vec![(TOKEN_B.to_string(), ALICE.to_string(), 400)]
    );
    assert_eq!(slot(&c, &t, 1), 500);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_B), None);
    assert_eq!(ft_transfers()[0].2, 500, "None withdraws the whole slot");
    assert_eq!(slot(&c, &t, 1), 0);
    assert_books(&c);
}

#[test]
#[should_panic(expected = "Only the owner can withdraw")]
fn token_withdraw_is_owner_only() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 0, 10);
    ctx(BOB, 1);
    let _ = c.withdraw_token(t, id(TOKEN_A), None);
}

#[test]
#[should_panic(expected = "Delist the card before withdrawing")]
fn token_withdraw_is_refused_while_listed() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 0, 10);
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t, id(TOKEN_A), None);
}

#[test]
#[should_panic(expected = "Invalid amount")]
fn token_withdraw_cannot_exceed_slot() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 0, 10);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t, id(TOKEN_A), Some(U128(11)));
}

#[test]
#[should_panic(expected = "Token not in the allowlist")]
fn token_withdraw_rejects_unknown_token() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t, id(FAKE_TOKEN), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn token_withdraw_requires_one_yocto() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 0, 10);
    ctx(ALICE, 0);
    let _ = c.withdraw_token(t, id(TOKEN_A), None);
}

#[test]
fn failed_token_withdraw_recredits_the_card_even_after_a_sale() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 1, 900);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_B), None);
    // For example the owner is not registered on the token: ft_transfer fails,
    list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(BOB, ONE_NEAR);
    let _ = c.buy(t.clone(), listing(&c, &t));
    // and the callback lands after Bob bought the card.
    ctx_full(CONTRACT, 0, 1_000, Some(PromiseResult::Failed));
    assert!(!c.on_token_withdraw(t.clone(), id(TOKEN_B), U128(900)));
    assert_eq!(slot(&c, &t, 1), 900, "tokens return to the card");
    assert_eq!(
        card(&c, &t).owner_id,
        id(BOB),
        "so they belong to the new owner"
    );
    assert_eq!(events("card_token_withdraw_refunded").len(), 1);
    assert_books(&c);
}

#[test]
fn successful_token_withdraw_callback_changes_nothing() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 0, 5);
    ctx(ALICE, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_A), None);
    ctx_full(CONTRACT, 0, 1_000, Some(PromiseResult::Successful(vec![])));
    assert!(c.on_token_withdraw(t.clone(), id(TOKEN_A), U128(5)));
    assert_eq!(slot(&c, &t, 0), 0);
    assert_books(&c);
}

#[test]
fn sale_moves_the_whole_inventory() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    deposit(&mut c, &t, ONE_NEAR);
    fill(&mut c, &t, 0, 2_000);
    fill(&mut c, &t, 1, 75);
    let lid = list(&mut c, ALICE, &t, 2 * ONE_NEAR);
    assert_eq!(listing(&c, &t), lid);
    assert!(events("card_listed")[0]["data"][0]["listing_id"].is_string());
    ctx(BOB, 2 * ONE_NEAR);
    let _ = c.buy(t.clone(), lid);
    let v = card(&c, &t);
    assert_eq!(v.owner_id, id(BOB));
    assert_eq!(v.balance.0, ONE_NEAR + 2 * ONE_NEAR / 10);
    assert_eq!(
        (v.inventory[0].amount.0, v.inventory[1].amount.0),
        (2_000, 75)
    );
    assert_eq!(v.listing_id, None);
    // The buyer can now withdraw what the seller put in.
    ctx(BOB, 1);
    let _ = c.withdraw_token(t.clone(), id(TOKEN_A), None);
    assert_eq!(
        ft_transfers(),
        vec![(TOKEN_A.to_string(), BOB.to_string(), 2_000)]
    );
    assert_books(&c);
}

#[test]
fn every_listing_gets_a_new_id_and_transfers_clear_it() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    let first = list(&mut c, ALICE, &t, ONE_NEAR);
    ctx(ALICE, 1);
    c.delist(t.clone());
    assert_eq!(card(&c, &t).listing_id, None);
    let second = list(&mut c, ALICE, &t, ONE_NEAR);
    assert_ne!(first, second);
    ctx(ALICE, 1);
    c.nft_transfer(id(BOB), t.clone(), None, None);
    assert_eq!(card(&c, &t).listing_id, None);
}

#[test]
fn nft_transfer_moves_the_inventory() {
    let mut c = setup();
    let t = mint_to(&mut c, ALICE);
    fill(&mut c, &t, 1, 33);
    ctx(ALICE, 1);
    c.nft_transfer(id(BOB), t.clone(), None, None);
    assert_eq!(card(&c, &t).owner_id, id(BOB));
    assert_eq!(slot(&c, &t, 1), 33);
    let extra: CardView =
        serde_json::from_str(&c.nft_token(t).unwrap().metadata.unwrap().extra.unwrap()).unwrap();
    assert_eq!(extra.inventory[1].amount.0, 33);
}

#[test]
fn mint_with_four_tokens_fits_the_reserve() {
    ctx(CREATOR, 0);
    let mut c = Contract::new(
        id(CREATOR),
        ["a.testnet", "b.testnet", "c.testnet", "d.testnet"]
            .map(id)
            .to_vec(),
        None,
    );
    mint_to(&mut c, ALICE);
    ctx(BOB, MINT_COST);
    let before = env::storage_usage();
    c.mint();
    let used = (env::storage_usage() - before) as u128 * env::storage_byte_cost().as_yoctonear();
    assert!(
        used * 100 <= STORAGE_RESERVE * 40,
        "mint used {used} yocto of storage"
    );
    assert_eq!(card(&c, "2").inventory.len(), 4);
}

#[test]
#[should_panic(expected = "At most 4 tokens")]
fn init_rejects_more_than_four_tokens() {
    ctx(CREATOR, 0);
    Contract::new(
        id(CREATOR),
        [
            "a.testnet",
            "b.testnet",
            "c.testnet",
            "d.testnet",
            "e.testnet",
        ]
        .map(id)
        .to_vec(),
        None,
    );
}

#[test]
#[should_panic(expected = "Duplicate token")]
fn init_rejects_duplicate_tokens() {
    ctx(CREATOR, 0);
    Contract::new(id(CREATOR), vec![id(TOKEN_A), id(TOKEN_A)], None);
}
