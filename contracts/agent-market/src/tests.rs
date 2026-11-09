//! Unit tests: listing through nft_on_approve, the buy guards, and the three
//! checks of a sale (agent as listed, NFT moved, budget still there). The real
//! cross-contract path (NFT, agents v2) is proven on testnet by
//! scripts/agent-market-testnet-proof.ts.

use super::*;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{PromiseResult, testing_env};
use std::collections::HashMap;

const MARKET: &str = "market.testnet";
const AGENTS: &str = "agents.testnet";
const NFT: &str = "nft.testnet";
const SELLER: &str = "seller.testnet";
const BUYER: &str = "buyer.testnet";
const EVIL: &str = "evil.testnet";
const PRICE: u128 = 2 * 10u128.pow(24);
const BUDGET: u128 = 800_000;

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

struct Ctx {
    predecessor: &'static str,
    signer: &'static str,
    deposit: u128,
    gas: u64,
    result: Option<PromiseResult>,
}

impl Ctx {
    fn by(who: &'static str) -> Self {
        Self { predecessor: who, signer: who, deposit: 0, gas: 300, result: None }
    }
    /// The NFT contract calling back on behalf of `signer`.
    fn nft(signer: &'static str) -> Self {
        Self { predecessor: NFT, signer, deposit: 0, gas: 300, result: None }
    }
    fn deposit(mut self, d: u128) -> Self {
        self.deposit = d;
        self
    }
    fn gas(mut self, g: u64) -> Self {
        self.gas = g;
        self
    }
    fn result(mut self, r: PromiseResult) -> Self {
        self.result = Some(r);
        self
    }
    fn set(self) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(id(MARKET))
            .signer_account_id(id(self.signer))
            .predecessor_account_id(id(self.predecessor))
            .attached_deposit(NearToken::from_yoctonear(self.deposit))
            .prepaid_gas(Gas::from_tgas(self.gas))
            .account_balance(NearToken::from_near(100));
        testing_env!(
            b.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            HashMap::default(),
            self.result.into_iter().collect()
        );
    }
}

fn msg(price: u128, budget: u128) -> String {
    format!(r#"{{"price":"{price}","seat_id":"7","budget":"{budget}"}}"#)
}

fn listed() -> Contract {
    Ctx::by(MARKET).set();
    let mut c = Contract::new(id(AGENTS));
    Ctx::nft(SELLER).set();
    c.nft_on_approve("42".into(), id(SELLER), 3, msg(PRICE, BUDGET));
    c
}

fn listing() -> Listing {
    Listing {
        nft_contract: id(NFT),
        token_id: "42".into(),
        seller: id(SELLER),
        approval_id: U64(3),
        price: U128(PRICE),
        seat_id: U64(7),
        budget: U128(BUDGET),
        listed_at: U64(0),
    }
}

fn seat(owner: &str, paused: bool, balance: u128, follows: bool, held: bool) -> SeatLite {
    SeatLite { seat_id: U64(7), owner: id(owner), paused, balance: U128(balance), budget_follows: follows, held_for_next_owner: held }
}

/// The agents contract's `seat_for_nft` answer, with fields this market ignores.
fn seat_answer(owner: &str, paused: bool, balance: u128, follows: bool, held: bool) -> PromiseResult {
    PromiseResult::Successful(
        format!(
            r#"{{"seat_id":"7","nft_contract":"{NFT}","token_id":"42","kind":"Payer","asset":"USDC","owner":"{owner}","agent_key":null,
            "paused":{paused},"policy":null,"balance":"{balance}","in_flight":0,"spent_today":"0","left_today":"0","spent_total":"5",
            "done":3,"refused":1,"failed":0,"created_at":"1","profile":{{"name":"Coach","role":"skill","tool":null,"avatar":null,"manifest":null}},
            "owners":1,"budget_follows":{follows},"held_for_next_owner":{held}}}"#
        )
        .into_bytes(),
    )
}

fn events(name: &str) -> usize {
    get_logs().iter().filter(|l| l.contains(&format!(r#""event":"{name}""#))).count()
}

#[test]
fn approve_lists_the_agent() {
    let c = listed();
    let l = c.listing(id(NFT), "42".into()).unwrap();
    assert_eq!(l.seller, id(SELLER));
    assert_eq!(l.approval_id, U64(3));
    assert_eq!(l.price, U128(PRICE));
    assert_eq!(l.budget, U128(BUDGET));
    assert_eq!(c.listings(None, None).len(), 1);
    assert_eq!(events("listed"), 1);
}

#[test]
fn re_approving_re_prices_without_a_second_listing() {
    let mut c = listed();
    Ctx::nft(SELLER).set();
    c.nft_on_approve("42".into(), id(SELLER), 4, msg(PRICE * 2, 0));
    let l = c.listing(id(NFT), "42".into()).unwrap();
    assert_eq!((l.price, l.budget, l.approval_id), (U128(PRICE * 2), U128(0), U64(4)));
    assert_eq!(c.listings(None, None).len(), 1);
}

#[test]
#[should_panic(expected = "Only the NFT's owner can list it")]
fn nobody_lists_someone_elses_nft() {
    let mut c = listed();
    Ctx::nft(EVIL).set();
    c.nft_on_approve("43".into(), id(SELLER), 1, msg(PRICE, 0));
}

#[test]
#[should_panic(expected = "The price must be positive")]
fn a_free_listing_is_refused() {
    let mut c = listed();
    Ctx::nft(SELLER).set();
    c.nft_on_approve("43".into(), id(SELLER), 1, msg(0, 0));
}

#[test]
#[should_panic(expected = "At most 10 listings per seller")]
fn a_seller_lists_ten_at_most() {
    let mut c = listed();
    for t in 0..10 {
        Ctx::nft(SELLER).set();
        c.nft_on_approve(format!("t{t}"), id(SELLER), 1, msg(PRICE, 0));
    }
}

#[test]
fn only_the_seller_delists() {
    let mut c = listed();
    Ctx::by(SELLER).deposit(1).set();
    c.delist(id(NFT), "42".into());
    assert!(c.listing(id(NFT), "42".into()).is_none());
    assert_eq!(events("delisted"), 1);
}

#[test]
#[should_panic(expected = "Only the seller can take it down")]
fn a_stranger_cannot_delist() {
    let mut c = listed();
    Ctx::by(EVIL).deposit(1).set();
    c.delist(id(NFT), "42".into());
}

#[test]
fn buying_takes_the_listing_off_the_market() {
    let mut c = listed();
    Ctx::by(BUYER).deposit(PRICE).set();
    let _ = c.buy(id(NFT), "42".into(), U128(PRICE), U128(BUDGET));
    assert!(c.listing(id(NFT), "42".into()).is_none());
}

#[test]
#[should_panic(expected = "Attach exactly the price")]
fn buying_needs_the_exact_price() {
    let mut c = listed();
    Ctx::by(BUYER).deposit(PRICE - 1).set();
    let _ = c.buy(id(NFT), "42".into(), U128(PRICE), U128(BUDGET));
}

#[test]
#[should_panic(expected = "The listing changed")]
fn a_lower_budget_than_seen_is_refused() {
    let mut c = listed();
    Ctx::by(BUYER).deposit(PRICE).set();
    let _ = c.buy(id(NFT), "42".into(), U128(PRICE), U128(BUDGET + 1));
}

#[test]
#[should_panic(expected = "You are the seller")]
fn the_seller_cannot_buy_their_own_agent() {
    let mut c = listed();
    Ctx::by(SELLER).deposit(PRICE).set();
    let _ = c.buy(id(NFT), "42".into(), U128(PRICE), U128(BUDGET));
}

#[test]
#[should_panic(expected = "Attach 150 TGas")]
fn buying_needs_enough_gas() {
    let mut c = listed();
    Ctx::by(BUYER).deposit(PRICE).gas(100).set();
    let _ = c.buy(id(NFT), "42".into(), U128(PRICE), U128(BUDGET));
}

#[test]
fn before_the_transfer_the_agent_must_be_as_listed() {
    let l = listing();
    assert_eq!(mismatch(Some(&seat(SELLER, true, BUDGET, true, false)), &l, None), None);
    assert_eq!(mismatch(None, &l, None), Some("the NFT carries no agent"));
    let mut other = seat(SELLER, true, BUDGET, true, false);
    other.seat_id = U64(8);
    assert_eq!(mismatch(Some(&other), &l, None), Some("the NFT carries another agent"));
    assert_eq!(mismatch(Some(&seat(EVIL, true, BUDGET, true, false)), &l, None), Some("the seller does not hold this agent"));
    assert_eq!(mismatch(Some(&seat(SELLER, true, BUDGET, true, true)), &l, None), Some("the seller does not hold this agent"));
    assert_eq!(
        mismatch(Some(&seat(SELLER, false, BUDGET, true, false)), &l, None),
        Some("the agent must be paused while its budget is for sale")
    );
    assert_eq!(mismatch(Some(&seat(SELLER, true, BUDGET, false, false)), &l, None), Some("the budget no longer goes to the buyer"));
    assert_eq!(
        mismatch(Some(&seat(SELLER, true, BUDGET - 1, true, false)), &l, None),
        Some("the agent holds less than the promised budget")
    );
}

#[test]
fn an_agent_sold_without_money_may_keep_running() {
    let mut l = listing();
    l.budget = U128(0);
    assert_eq!(mismatch(Some(&seat(SELLER, false, 0, false, false)), &l, None), None);
}

#[test]
fn after_the_transfer_the_budget_must_still_be_there() {
    let l = listing();
    let buyer = id(BUYER);
    // Still recorded under the seller (lazy reset), or already held for the next owner: fine.
    assert_eq!(mismatch(Some(&seat(SELLER, false, BUDGET, true, false)), &l, Some(&buyer)), None);
    assert_eq!(mismatch(Some(&seat(SELLER, true, BUDGET, true, true)), &l, Some(&buyer)), None);
    // The buyer already claimed it: whatever is in it is theirs.
    assert_eq!(mismatch(Some(&seat(BUYER, true, 0, false, false)), &l, Some(&buyer)), None);
    // The seller took the promise back before the NFT moved: the buyer is refunded.
    assert_eq!(mismatch(Some(&seat(SELLER, true, 0, false, false)), &l, Some(&buyer)), Some("the budget no longer goes to the buyer"));
    assert_eq!(mismatch(None, &l, Some(&buyer)), Some("the NFT carries no agent"));
}

#[test]
fn a_mismatch_before_the_transfer_refunds_and_moves_nothing() {
    let mut c = listed();
    Ctx::by(MARKET).result(seat_answer(SELLER, false, BUDGET, true, false)).set();
    match c.on_pre_checked(listing(), id(BUYER)) {
        PromiseOrValue::Value(ok) => assert!(!ok),
        PromiseOrValue::Promise(_) => panic!("the NFT must not move"),
    }
    assert_eq!(events("sale_refunded"), 1);
    assert!(get_logs().iter().any(|l| l.contains("must be paused") && l.contains(r#""buyer_keeps_nft":false"#)));
}

#[test]
fn an_agent_as_listed_moves_the_nft() {
    let mut c = listed();
    Ctx::by(MARKET).result(seat_answer(SELLER, true, BUDGET, true, false)).set();
    assert!(matches!(c.on_pre_checked(listing(), id(BUYER)), PromiseOrValue::Promise(_)));
    assert_eq!(events("sale_refunded"), 0);
}

#[test]
fn a_failed_transfer_refunds_the_buyer() {
    let mut c = listed();
    Ctx::by(MARKET).result(PromiseResult::Failed).set();
    assert!(matches!(c.on_transferred(listing(), id(BUYER)), PromiseOrValue::Value(false)));
    assert!(get_logs().iter().any(|l| l.contains("could not be transferred")));
    assert_eq!(c.stats()["refunded"], 1);
}

#[test]
fn the_seller_is_paid_when_the_budget_stayed() {
    let mut c = listed();
    Ctx::by(MARKET).result(seat_answer(SELLER, true, BUDGET, true, true)).set();
    assert!(c.on_post_checked(listing(), id(BUYER)));
    assert_eq!(events("sold"), 1);
    let sales = c.sales();
    assert_eq!(sales.len(), 1);
    assert_eq!((sales[0].buyer.clone(), sales[0].budget), (id(BUYER), U128(BUDGET)));
    assert_eq!(c.stats()["sold"], 1);
    assert_eq!(c.stats()["volume"], PRICE.to_string());
}

#[test]
fn a_pulled_budget_refunds_the_buyer_who_keeps_the_nft() {
    let mut c = listed();
    Ctx::by(MARKET).result(seat_answer(SELLER, true, 0, false, false)).set();
    assert!(!c.on_post_checked(listing(), id(BUYER)));
    assert!(get_logs().iter().any(|l| l.contains(r#""buyer_keeps_nft":true"#)));
    assert_eq!(c.stats()["sold"], 0);
    assert_eq!(c.stats()["refunded"], 1);
}

#[test]
fn history_keeps_the_last_sales() {
    let mut c = listed();
    for _ in 0..(HISTORY + 5) {
        Ctx::by(MARKET).result(seat_answer(SELLER, true, BUDGET, true, false)).set();
        assert!(c.on_post_checked(listing(), id(BUYER)));
    }
    assert_eq!(c.sales().len(), HISTORY);
    assert_eq!(c.stats()["sold"], (HISTORY + 5) as u64);
}

// `#[private]` is enforced by the wasm entry points only, so it is checked on testnet
// (scripts/agent-market-testnet-proof.ts calls on_post_checked directly and is refused).
