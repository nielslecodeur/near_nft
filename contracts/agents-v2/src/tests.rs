//! Unit tests: policy, key binding, refusal logging and the ownership callbacks,
//! plus v2: profile, track record, refusal merging and the budget that follows the NFT.
//! Cross-contract paths (real NFT, market, USDC, function-call keys) are covered
//! end to end in scripts/agents-proof.ts.

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, testing_env};
use std::collections::HashMap;

const CONTRACT: &str = "agents.testnet";
const USDC: &str = "usdc.testnet";
const NFT: &str = "keepers.testnet";
const MARKET: &str = "keepers.testnet";
const ALICE: &str = "alice.testnet";
const BOB: &str = "bob.testnet";
const SHOP: &str = "shop.testnet";
const EVIL: &str = "evil.testnet";
const DAY: u64 = 86_400_000_000_000;

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn agent_pk() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap()
}
fn other_pk() -> PublicKey {
    "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847".parse().unwrap()
}

struct Ctx<'a> {
    who: &'a str,
    pk: PublicKey,
    deposit: u128,
    now: u64,
    result: Option<PromiseResult>,
}

impl<'a> Ctx<'a> {
    fn new(who: &'a str) -> Self {
        Self { who, pk: other_pk(), deposit: 0, now: DAY * 100, result: None }
    }
    fn pk(mut self, pk: PublicKey) -> Self {
        self.pk = pk;
        self
    }
    fn deposit(mut self, d: u128) -> Self {
        self.deposit = d;
        self
    }
    fn now(mut self, n: u64) -> Self {
        self.now = n;
        self
    }
    fn result(mut self, r: PromiseResult) -> Self {
        self.result = Some(r);
        self
    }
    fn set(self) {
        let mut b = VMContextBuilder::new();
        b.current_account_id(id(CONTRACT))
            .signer_account_id(id(self.who))
            .signer_account_pk(self.pk)
            .predecessor_account_id(id(self.who))
            .attached_deposit(NearToken::from_yoctonear(self.deposit))
            .block_timestamp(self.now)
            .account_balance(NearToken::from_near(1_000));
        testing_env!(
            b.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            HashMap::default(),
            self.result.into_iter().collect()
        );
    }
}

/// `nft_token` answer naming `owner` (or `null` when `owner` is None).
fn nft_answer(owner: Option<&str>) -> PromiseResult {
    let body = match owner {
        Some(o) => format!(r#"{{"token_id":"7","owner_id":"{o}","metadata":null}}"#),
        None => "null".into(),
    };
    PromiseResult::Successful(body.into_bytes())
}

fn payer_policy() -> Policy {
    Policy {
        per_tx_max: U128(2_000_000),
        per_day_max: U128(5_000_000),
        payees: vec![id(SHOP)],
        market: None,
    }
}

fn buyer_policy() -> Policy {
    Policy {
        per_tx_max: U128(2 * ONE_NEAR),
        per_day_max: U128(3 * ONE_NEAR),
        payees: vec![],
        market: Some(id(MARKET)),
    }
}

/// A contract with seat 1 for Alice on NFT #7: a Payer funded with 10 USDC and
/// the agent key registered.
fn payer_setup() -> Contract {
    Ctx::new(ALICE).set();
    let mut c = Contract::new(id(USDC));
    Ctx::new(CONTRACT).result(nft_answer(Some(ALICE))).set();
    let seat = c.on_create_checked(id(ALICE), id(NFT), "7".into(), Kind::Payer,
                                   Some(payer_policy()), None, U128(SEAT_STORAGE));
    assert_eq!(seat, Some(U64(1)));
    Ctx::new(USDC).set();
    assert!(matches!(
        c.ft_on_transfer(id(ALICE), U128(10_000_000), r#"{"seat_id":"1"}"#.into()),
        PromiseOrValue::Value(U128(0))
    ));
    Ctx::new(ALICE).deposit(1).set();
    c.set_agent_key(U64(1), Some(agent_pk()));
    c
}

fn view(c: &Contract) -> SeatView {
    c.seat(U64(1)).unwrap()
}

fn last_log(c: &Contract) -> LogView {
    c.seat_log(U64(1)).remove(0)
}

fn pay(c: &mut Contract, payee: &str, amount: u128) -> bool {
    Ctx::new(ALICE).pk(agent_pk()).set();
    match c.agent_pay(U64(1), id(payee), U128(amount), Some("invoice".into())) {
        PromiseOrValue::Value(v) => v,
        PromiseOrValue::Promise(_) => true,
    }
}

#[test]
fn create_refuses_a_non_owner_and_refunds() {
    Ctx::new(ALICE).set();
    let mut c = Contract::new(id(USDC));
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    let seat = c.on_create_checked(id(ALICE), id(NFT), "7".into(), Kind::Payer, None,
                                   None, U128(SEAT_STORAGE));
    assert_eq!(seat, None);
    assert!(c.seat_for_nft(id(NFT), "7".into()).is_none());
}

#[test]
fn pays_within_policy_and_debits_before_the_promise() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_500_000));
    let s = view(&c);
    assert_eq!(s.balance, U128(8_500_000));
    assert_eq!(s.spent_today, U128(1_500_000));
    assert_eq!(s.in_flight, 1);
    assert_eq!(last_log(&c).status, "pending");
}

#[test]
fn refusals_are_logged_not_panicked() {
    let mut c = payer_setup();
    assert!(!pay(&mut c, SHOP, 3_000_000)); // over per-action cap
    assert_eq!(last_log(&c).detail, "over the per-action cap");
    assert!(!pay(&mut c, EVIL, 1_000_000)); // not on the list
    assert_eq!(last_log(&c).detail, "payee not on the list");
    assert!(pay(&mut c, SHOP, 2_000_000));
    assert!(pay(&mut c, SHOP, 2_000_000));
    assert!(!pay(&mut c, SHOP, 2_000_000)); // 6 > daily 5
    assert_eq!(last_log(&c).detail, "over the daily cap");
    let s = view(&c);
    assert_eq!(s.refused, 3);
    assert_eq!(s.balance, U128(6_000_000));
}

#[test]
fn daily_cap_resets_the_next_day() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 2_000_000));
    assert!(pay(&mut c, SHOP, 2_000_000));
    Ctx::new(ALICE).pk(agent_pk()).now(DAY * 101).set();
    assert!(matches!(
        c.agent_pay(U64(1), id(SHOP), U128(2_000_000), None),
        PromiseOrValue::Promise(_)
    ));
}

#[test]
#[should_panic(expected = "This key is not the seat's agent key")]
fn another_key_of_the_owner_cannot_run_the_agent() {
    let mut c = payer_setup();
    Ctx::new(ALICE).pk(other_pk()).set();
    let _ = c.agent_pay(U64(1), id(SHOP), U128(1), None);
}

#[test]
#[should_panic(expected = "Only the seat owner's agent can act")]
fn someone_else_cannot_run_the_agent() {
    let mut c = payer_setup();
    Ctx::new(BOB).pk(agent_pk()).set();
    let _ = c.agent_pay(U64(1), id(SHOP), U128(1), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn policy_changes_need_one_yocto() {
    let mut c = payer_setup();
    Ctx::new(ALICE).pk(agent_pk()).set();
    c.set_policy(U64(1), payer_policy());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_needs_one_yocto() {
    let mut c = payer_setup();
    Ctx::new(ALICE).pk(agent_pk()).set();
    let _ = c.withdraw(U64(1), None);
}

#[test]
fn the_agent_key_can_pause_but_not_resume() {
    let mut c = payer_setup();
    Ctx::new(ALICE).pk(agent_pk()).set();
    c.pause(U64(1));
    assert!(view(&c).paused);
    assert!(!pay(&mut c, SHOP, 1));
    assert_eq!(last_log(&c).detail, "agent paused");
    Ctx::new(ALICE).deposit(1).set();
    c.resume(U64(1));
    assert!(!view(&c).paused);
}

#[test]
fn a_sale_mid_flight_refuses_resets_and_sets_the_budget_aside() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_000_000));
    // The ownership check comes back: Bob now owns NFT #7.
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    let r = c.on_pay_checked(U64(1), id(ALICE), id(SHOP), U128(1_000_000), None);
    assert!(matches!(r, PromiseOrValue::Value(false)));
    let s = view(&c);
    assert_eq!(s.balance, U128(0));
    assert_eq!(s.in_flight, 0);
    assert!(s.paused && s.policy.is_none() && s.agent_key.is_none());
    assert_eq!(s.owner, id(ALICE));
    // The funder keeps the whole budget, the in-flight payment included.
    assert_eq!(c.refund_of(id(ALICE)).usdc, U128(10_000_000));
    // Bob claims the seat: empty, paused, his.
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    assert!(c.on_claim_checked(U64(1), id(BOB)));
    let s = view(&c);
    assert_eq!(s.owner, id(BOB));
    assert_eq!(s.balance, U128(0));
    assert_eq!(c.seats_for_owner(id(ALICE)).len(), 0);
    assert_eq!(c.seats_for_owner(id(BOB)).len(), 1);
}

#[test]
fn an_unreadable_owner_refuses_without_reset() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_000_000));
    Ctx::new(CONTRACT).result(PromiseResult::Failed).set();
    let r = c.on_pay_checked(U64(1), id(ALICE), id(SHOP), U128(1_000_000), None);
    assert!(matches!(r, PromiseOrValue::Value(false)));
    let s = view(&c);
    assert_eq!(s.balance, U128(10_000_000));
    assert!(!s.paused && s.agent_key.is_some());
}

#[test]
fn a_failed_payment_is_credited_back() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_000_000));
    Ctx::new(CONTRACT).result(PromiseResult::Failed).set();
    assert!(!c.on_paid(U64(1), id(ALICE), id(SHOP), U128(1_000_000)));
    let s = view(&c);
    assert_eq!(s.balance, U128(10_000_000));
    assert_eq!(s.spent_today, U128(0));
    assert_eq!(s.failed, 1);
}

#[test]
fn usdc_from_anyone_else_or_any_other_token_is_refunded() {
    let mut c = payer_setup();
    Ctx::new("fake-usdc.testnet").set();
    assert!(matches!(
        c.ft_on_transfer(id(ALICE), U128(5), r#"{"seat_id":"1"}"#.into()),
        PromiseOrValue::Value(U128(5))
    ));
    Ctx::new(USDC).set();
    assert!(matches!(
        c.ft_on_transfer(id(BOB), U128(5), r#"{"seat_id":"1"}"#.into()),
        PromiseOrValue::Value(U128(5))
    ));
}

#[test]
fn a_buyer_spends_near_on_its_market_only() {
    Ctx::new(ALICE).set();
    let mut c = Contract::new(id(USDC));
    Ctx::new(CONTRACT).result(nft_answer(Some(ALICE))).set();
    c.on_create_checked(id(ALICE), id(NFT), "7".into(), Kind::Buyer, Some(buyer_policy()),
                        None, U128(SEAT_STORAGE));
    Ctx::new(ALICE).deposit(5 * ONE_NEAR).set();
    c.fund(U64(1));
    Ctx::new(ALICE).deposit(1).set();
    c.set_agent_key(U64(1), Some(agent_pk()));
    Ctx::new(ALICE).pk(agent_pk()).set();
    assert!(matches!(
        c.agent_buy(U64(1), "3".into(), U64(1), U128(3 * ONE_NEAR)),
        PromiseOrValue::Value(false)
    ));
    assert!(matches!(
        c.agent_pay(U64(1), id(SHOP), U128(1), None),
        PromiseOrValue::Value(false)
    ));
    assert!(matches!(
        c.agent_buy(U64(1), "3".into(), U64(1), U128(ONE_NEAR)),
        PromiseOrValue::Promise(_)
    ));
    assert_eq!(view(&c).balance, U128(4 * ONE_NEAR));
}

#[test]
#[should_panic(expected = "A payer needs at least one payee")]
fn a_payer_policy_needs_payees() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    c.set_policy(U64(1), Policy { payees: vec![], ..payer_policy() });
}

#[test]
fn the_log_keeps_the_last_entries_only() {
    let mut c = payer_setup();
    // Different amounts: nothing merges, the ring keeps LOG_SIZE entries, refusals at most MAX_REFUSED_KEPT.
    for i in 0..(LOG_SIZE + 10) {
        pay(&mut c, EVIL, 1 + i as u128);
    }
    let log = c.seat_log(U64(1));
    assert!(log.len() <= LOG_SIZE);
    assert_eq!(log.iter().filter(|e| e.status == "refused").count(), MAX_REFUSED_KEPT);
    assert_eq!(view(&c).refused, (LOG_SIZE + 10) as u32);
}

fn profile() -> Profile {
    Profile {
        name: "Pocket money".into(),
        role: "allowance".into(),
        tool: Some("claude-code".into()),
        avatar: Some("https://example.com/a.png".into()),
        manifest: Some("https://example.com/agent.json".into()),
    }
}

#[test]
fn identical_refusals_merge_and_never_crowd_out_the_rest() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_000_000)); // a real payment, pending in the log
    for _ in 0..500 {
        assert!(!pay(&mut c, EVIL, 1_000_000));
    }
    let log = c.seat_log(U64(1));
    let top = &log[0];
    assert_eq!((top.status.as_str(), top.times), ("refused", 500));
    assert_eq!(top.detail, "payee not on the list");
    assert!(log.iter().any(|e| e.action == "pay" && e.status == "pending"), "the payment is still in the log");
    assert!(log.iter().any(|e| e.action == "create"), "creation is still in the log");
    assert_eq!(view(&c).refused, 500);
    // The merged entry gets a fresh seq, so readers see the new attempts.
    let seq = top.seq;
    assert!(!pay(&mut c, EVIL, 1_000_000));
    assert!(c.seat_log(U64(1))[0].seq.0 > seq.0);
}

#[test]
fn the_profile_is_checked_and_follows_the_nft() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    c.set_profile(U64(1), Some(profile()));
    assert_eq!(view(&c).profile, Some(profile()));
    assert_eq!(view(&c).owners, 1);
    // A sale: Bob claims; the profile and the track record stay, the owner count goes up.
    assert!(pay(&mut c, SHOP, 1_000_000));
    Ctx::new(CONTRACT).result(PromiseResult::Successful(vec![])).set();
    assert!(c.on_paid(U64(1), id(ALICE), id(SHOP), U128(1_000_000)));
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    assert!(c.on_claim_checked(U64(1), id(BOB)));
    let s = view(&c);
    assert_eq!((s.owner.clone(), s.owners, s.done), (id(BOB), 2, 1));
    assert_eq!(s.profile, Some(profile()));
    // The new owner may rename it.
    Ctx::new(BOB).deposit(1).set();
    c.set_profile(U64(1), Some(Profile { name: "Bob's agent".into(), ..profile() }));
    assert_eq!(view(&c).profile.unwrap().name, "Bob's agent");
}

#[test]
#[should_panic(expected = "Profile links must start with https://")]
fn profile_links_must_be_https() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    c.set_profile(U64(1), Some(Profile { avatar: Some("javascript:alert(1)".into()), ..profile() }));
}

#[test]
#[should_panic(expected = "Profile name: 1 to 32 characters")]
fn profile_names_are_bounded() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    c.set_profile(U64(1), Some(Profile { name: "x".repeat(33), ..profile() }));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn the_agent_key_cannot_change_the_profile() {
    let mut c = payer_setup();
    Ctx::new(ALICE).pk(agent_pk()).set();
    c.set_profile(U64(1), Some(profile()));
}

/// Alice leaves the budget to the next owner, then sells: the sale is seen mid-flight.
fn sold_with_budget_following() -> Contract {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    assert!(matches!(c.set_budget_follows(U64(1), true), PromiseOrValue::Value(true)));
    assert!(view(&c).budget_follows);
    assert!(pay(&mut c, SHOP, 1_000_000));
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    assert!(matches!(
        c.on_pay_checked(U64(1), id(ALICE), id(SHOP), U128(1_000_000), None),
        PromiseOrValue::Value(false)
    ));
    c
}

#[test]
fn a_following_budget_is_held_then_handed_to_the_new_owner() {
    let mut c = sold_with_budget_following();
    let s = view(&c);
    assert!(s.held_for_next_owner && s.paused && s.policy.is_none());
    assert_eq!(s.balance, U128(10_000_000), "the in-flight payment came back into the held budget");
    assert_eq!(c.refund_of(id(ALICE)).usdc, U128(0), "nothing set aside for the seller");
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    assert!(c.on_claim_checked(U64(1), id(BOB)));
    let s = view(&c);
    assert_eq!((s.owner.clone(), s.balance), (id(BOB), U128(10_000_000)));
    assert!(!s.held_for_next_owner && !s.budget_follows, "the new owner starts with the default");
    // Bob can withdraw it, with no ownership proof (the option is off for him).
    Ctx::new(BOB).deposit(1).set();
    let _ = c.withdraw(U64(1), None);
    assert_eq!(view(&c).balance, U128(0));
}

#[test]
#[should_panic(expected = "This budget is held for the NFT's next owner")]
fn the_seller_cannot_pull_a_held_budget() {
    let mut c = sold_with_budget_following();
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.withdraw(U64(1), None);
}

#[test]
#[should_panic(expected = "This budget is held for the NFT's next owner")]
fn the_seller_cannot_take_back_the_promise_after_the_sale() {
    let mut c = sold_with_budget_following();
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.set_budget_follows(U64(1), false);
}

#[test]
fn while_promised_a_withdraw_first_proves_ownership() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.set_budget_follows(U64(1), true);
    let _ = c.withdraw(U64(1), Some(U128(4_000_000)));
    assert_eq!(view(&c).balance, U128(10_000_000), "nothing moves before the proof");
    // Still Alice's NFT: the withdraw goes through.
    Ctx::new(CONTRACT).result(nft_answer(Some(ALICE))).set();
    assert!(matches!(
        c.on_owner_checked(U64(1), id(ALICE), "withdraw".into(), Some(U128(4_000_000))),
        PromiseOrValue::Promise(_)
    ));
    assert_eq!(view(&c).balance, U128(6_000_000));
    // Sold in the meantime: the withdraw is refused and the rest is held for Bob.
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    assert!(matches!(
        c.on_owner_checked(U64(1), id(ALICE), "withdraw".into(), None),
        PromiseOrValue::Value(false)
    ));
    let s = view(&c);
    assert!(s.held_for_next_owner);
    assert_eq!(s.balance, U128(6_000_000));
}

#[test]
fn turning_the_promise_off_needs_the_nft() {
    let mut c = payer_setup();
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.set_budget_follows(U64(1), true);
    let _ = c.set_budget_follows(U64(1), false);
    assert!(view(&c).budget_follows, "not off before the proof");
    Ctx::new(CONTRACT).result(nft_answer(Some(ALICE))).set();
    assert!(matches!(c.on_owner_checked(U64(1), id(ALICE), "follows_off".into(), None), PromiseOrValue::Value(true)));
    assert!(!view(&c).budget_follows);
}

#[test]
fn the_seller_gets_a_held_budget_back_if_the_nft_returns() {
    let mut c = sold_with_budget_following();
    // Bob sends the NFT back to Alice before claiming.
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.claim_seat(U64(1));
    Ctx::new(CONTRACT).result(nft_answer(Some(ALICE))).set();
    assert!(c.on_claim_checked(U64(1), id(ALICE)));
    let s = view(&c);
    assert!(!s.held_for_next_owner && !s.budget_follows);
    assert_eq!((s.owner.clone(), s.owners), (id(ALICE), 1));
    Ctx::new(ALICE).deposit(1).set();
    let _ = c.withdraw(U64(1), None);
    assert_eq!(view(&c).balance, U128(0));
}

#[test]
fn by_default_the_budget_still_goes_back_to_the_seller() {
    let mut c = payer_setup();
    assert!(pay(&mut c, SHOP, 1_000_000));
    Ctx::new(CONTRACT).result(nft_answer(Some(BOB))).set();
    let _ = c.on_pay_checked(U64(1), id(ALICE), id(SHOP), U128(1_000_000), None);
    assert!(!view(&c).held_for_next_owner);
    assert_eq!(c.refund_of(id(ALICE)).usdc, U128(10_000_000));
}
