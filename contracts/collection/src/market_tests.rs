use super::*;
use near_sdk::{PromiseResult, test_utils::VMContextBuilder, testing_env};
use std::collections::HashMap;
fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn context(predecessor: &str, result: Option<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(id("collection.testnet"))
        .signer_account_id(id(predecessor))
        .predecessor_account_id(id(predecessor))
        .block_timestamp(100)
        .account_balance(NearToken::from_near(100));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        HashMap::default(),
        result.into_iter().collect()
    );
}
fn collection() -> Collection {
    context("collection.testnet", None);
    let mut c = Collection::new(
        "testnet".into(),
        id("token.testnet"),
        id("strategy.testnet"),
        None,
    );
    c.items.insert(
        id("plan.collection.testnet"),
        Item {
            owner_id: id("alice.testnet"),
            sequence: U64(0),
            epoch: U64(0),
            minted: true,
            prepared: true,
        },
    );
    context("plan.collection.testnet", None);
    c.open_listing(
        U64(1),
        id("alice.testnet"),
        U128(97),
        U64(1000),
        Base64VecU8(vec![1; 32]),
        U128(100),
        U128(0),
        U64(0),
        U64(0),
    );
    c
}
fn buy(c: &mut Collection) {
    context("token.testnet", None);
    c.ft_on_transfer(id("bob.testnet"),U128(97),json!({"position":"plan.collection.testnet","id":"1","valuation_hash":Base64VecU8(vec![1;32])}).to_string());
}
fn outcome(c: &mut Collection, state: &str, owner: &str, epoch: u64) -> bool {
    context("collection.testnet",Some(PromiseResult::Successful(serde_json::to_vec(&json!({"id":"1","state":state,"owner_id":owner,"buyer":"bob.testnet","ownership_epoch":U64(epoch),"sync_seq":U64(epoch)})).unwrap())));
    c.on_sale_outcome(id("plan.collection.testnet"), U64(1))
}
#[test]
fn unknown_outcome_cannot_create_refund() {
    let mut c = collection();
    buy(&mut c);
    context("collection.testnet", Some(PromiseResult::Failed));
    assert!(!c.on_sale_outcome(id("plan.collection.testnet"), U64(1)));
    assert!(
        c.sale_claim(id("plan.collection.testnet"), U64(1))
            .is_none()
    );
    assert_eq!(
        c.listing(id("plan.collection.testnet"), U64(1))
            .unwrap()
            .state,
        "Resolving"
    );
}
#[test]
fn frozen_read_does_not_authorize_refund() {
    let mut c = collection();
    buy(&mut c);
    assert!(!outcome(&mut c, "Frozen", "alice.testnet", 0));
    assert!(
        c.sale_claim(id("plan.collection.testnet"), U64(1))
            .is_none()
    );
}
#[test]
fn committed_requires_matching_nft_index() {
    let mut c = collection();
    buy(&mut c);
    assert!(!outcome(&mut c, "Committed", "bob.testnet", 1));
    assert_eq!(
        c.listing(id("plan.collection.testnet"), U64(1))
            .unwrap()
            .state,
        "AwaitingIndex"
    );
    assert!(
        c.sale_claim(id("plan.collection.testnet"), U64(1))
            .is_none()
    );
}
#[test]
fn settlement_callback_and_payment_are_idempotent() {
    let mut c = collection();
    buy(&mut c);
    let item = c.items.get_mut(&id("plan.collection.testnet")).unwrap();
    item.owner_id = id("bob.testnet");
    item.epoch = U64(1);
    item.sequence = U64(1);
    assert!(outcome(&mut c, "Committed", "bob.testnet", 1));
    assert!(!outcome(&mut c, "Committed", "bob.testnet", 1));
    let claim = c.sale_claim(id("plan.collection.testnet"), U64(1)).unwrap();
    assert_eq!(claim.beneficiary, id("alice.testnet"));
    assert_eq!(claim.state, "Paying");
    context("collection.testnet", Some(PromiseResult::Failed));
    assert!(!c.on_sale_payment("plan.collection.testnet:1".into(), U64(1)));
    let _ = c.claim_sale(id("plan.collection.testnet"), U64(1));
    context(
        "collection.testnet",
        Some(PromiseResult::Successful(vec![])),
    );
    assert!(!c.on_sale_payment("plan.collection.testnet:1".into(), U64(1)));
    assert!(c.on_sale_payment("plan.collection.testnet:1".into(), U64(2)));
    assert!(!c.on_sale_payment("plan.collection.testnet:1".into(), U64(2)));
    assert_eq!(
        c.sale_claim(id("plan.collection.testnet"), U64(1))
            .unwrap()
            .state,
        "Paid"
    );
}
#[test]
fn durable_abort_creates_buyer_claim_once() {
    let mut c = collection();
    buy(&mut c);
    assert!(outcome(&mut c, "Aborted", "alice.testnet", 0));
    assert!(!outcome(&mut c, "Aborted", "alice.testnet", 0));
    let claim = c.sale_claim(id("plan.collection.testnet"), U64(1)).unwrap();
    assert_eq!(claim.beneficiary, id("bob.testnet"));
    assert_eq!(claim.amount, U128(97));
    assert_eq!(claim.state, "Claimable");
}
#[test]
#[should_panic(expected = "SETTLEMENT_ENGAGED")]
fn cancellation_cannot_race_accepted_payment() {
    let mut c = collection();
    buy(&mut c);
    context("plan.collection.testnet", None);
    c.cancel_listing(U64(1));
}
#[test]
#[should_panic(expected = "LISTING_UNAVAILABLE")]
fn second_buyer_cannot_enter_busy_listing() {
    let mut c = collection();
    buy(&mut c);
    buy(&mut c);
}
#[test]
#[should_panic(expected = "CLAIM_NOT_AVAILABLE")]
fn uncertain_payment_cannot_be_retried() {
    let mut c = collection();
    buy(&mut c);
    let item = c.items.get_mut(&id("plan.collection.testnet")).unwrap();
    item.owner_id = id("bob.testnet");
    item.epoch = U64(1);
    item.sequence = U64(1);
    outcome(&mut c, "Committed", "bob.testnet", 1);
    let _ = c.claim_sale(id("plan.collection.testnet"), U64(1));
}
#[test]
#[should_panic(expected = "LISTING_CANCELLED")]
fn cancellation_fences_delayed_open() {
    let mut c = collection();
    context("plan.collection.testnet", None);
    c.cancel_listing(U64(1));
    c.cancel_listing(U64(2));
    c.open_listing(
        U64(2),
        id("alice.testnet"),
        U128(97),
        U64(1000),
        Base64VecU8(vec![1; 32]),
        U128(100),
        U128(0),
        U64(0),
        U64(0),
    );
}

fn subscribable() -> Collection {
    let mut c = collection();
    let item = c.items.get_mut(&id("plan.collection.testnet")).unwrap();
    item.minted = false;
    c.series = Some(SeriesRules {
        terms: Series {
            id: "demo".into(),
            name: "Demo".into(),
            opens_at: U64(1),
            closes_at: U64(1000),
            matures_at: U64(2000),
            asset: c.asset.clone(),
            strategy: c.strategy.clone(),
            capacity: U128(100),
            minimum: U128(10),
            allocation_bps: 2000,
            max_operation: U128(10),
            max_period: U128(20),
            version: U64(1),
        },
        mandate_hash: Base64VecU8(vec![1; 32]),
    });
    c
}
fn funding_permit() -> FundingPermit {
    FundingPermit {
        agent: id("agent.testnet"),
        amount: U128(50),
        expires_at: U64(900),
        beneficiary: id("alice.testnet"),
        ownership_epoch: U64(0),
        policy_version: U64(1),
    }
}
#[test]
fn agent_subscription_is_escrowed_then_consumed_once() {
    let mut c = subscribable();
    context("plan.collection.testnet", None);
    assert!(c.authorize_agent_subscription(funding_permit()));
    c.subscribe_impl(
        id("alice.testnet"),
        U128(50),
        id("plan.collection.testnet"),
        true,
    );
    assert_eq!(
        c.subscription(id("plan.collection.testnet")).unwrap().state,
        "Authorized"
    );
    assert_eq!(c.subscribed, 50);
    context("agent.testnet", None);
    let _ = c.agent_subscribe(id("plan.collection.testnet"), U64(1));
    assert_eq!(
        c.subscription(id("plan.collection.testnet")).unwrap().state,
        "Funding"
    );
}
#[test]
#[should_panic(expected = "AGENT_ONLY")]
fn other_agent_cannot_consume_escrow() {
    let mut c = subscribable();
    context("plan.collection.testnet", None);
    c.authorize_agent_subscription(funding_permit());
    c.subscribe_impl(
        id("alice.testnet"),
        U128(50),
        id("plan.collection.testnet"),
        true,
    );
    context("mallory.testnet", None);
    let _ = c.agent_subscribe(id("plan.collection.testnet"), U64(1));
}
#[test]
fn funding_cancellation_releases_capacity_once() {
    let mut c = subscribable();
    context("plan.collection.testnet", None);
    c.authorize_agent_subscription(funding_permit());
    c.subscribe_impl(
        id("alice.testnet"),
        U128(50),
        id("plan.collection.testnet"),
        true,
    );
    assert!(c.cancel_agent_subscription(U64(1)));
    assert_eq!(c.subscribed, 0);
    assert!(c.cancel_agent_subscription(U64(1)));
    assert_eq!(c.subscribed, 0);
    assert_eq!(
        c.claims
            .get(&"subscription:plan.collection.testnet".to_string())
            .unwrap()
            .beneficiary,
        id("alice.testnet")
    );
}
#[test]
#[should_panic(expected = "CANCELLED_POLICY")]
fn cancelled_funding_fences_late_authorization() {
    let mut c = subscribable();
    context("plan.collection.testnet", None);
    c.cancel_agent_subscription(U64(1));
    c.authorize_agent_subscription(funding_permit());
}
#[test]
#[should_panic(expected = "SUBSCRIPTION_IN_FLIGHT")]
fn accepted_execution_cannot_be_refunded_by_cancellation() {
    let mut c = subscribable();
    context("plan.collection.testnet", None);
    c.authorize_agent_subscription(funding_permit());
    c.subscribe_impl(
        id("alice.testnet"),
        U128(50),
        id("plan.collection.testnet"),
        true,
    );
    context("agent.testnet", None);
    let _ = c.agent_subscribe(id("plan.collection.testnet"), U64(1));
    context("plan.collection.testnet", None);
    c.cancel_agent_subscription(U64(1));
}
#[test]
fn failed_subscription_releases_capacity_and_creates_one_fixed_claim() {
    let mut c = subscribable();
    c.subscribe(
        id("alice.testnet"),
        U128(100),
        id("plan.collection.testnet"),
    );
    assert_eq!(c.subscribed, 100);
    context(
        "collection.testnet",
        Some(PromiseResult::Successful(b"\"0\"".to_vec())),
    );
    assert!(!c.on_subscription(id("plan.collection.testnet")));
    assert_eq!(c.subscribed, 0);
    assert!(!c.on_subscription(id("plan.collection.testnet")));
    assert_eq!(c.subscribed, 0);
    let claim = c
        .claims
        .get(&"subscription:plan.collection.testnet".to_string())
        .unwrap();
    assert_eq!(claim.amount, U128(100));
    assert_eq!(claim.beneficiary, id("alice.testnet"));
}
#[test]
fn uncertain_subscription_never_releases_capacity_or_refunds() {
    let mut c = subscribable();
    c.subscribe(
        id("alice.testnet"),
        U128(100),
        id("plan.collection.testnet"),
    );
    context("collection.testnet", Some(PromiseResult::Failed));
    assert!(!c.on_subscription(id("plan.collection.testnet")));
    assert_eq!(c.subscribed, 100);
    assert!(
        !c.claims
            .contains_key(&"subscription:plan.collection.testnet".to_string())
    );
    assert_eq!(
        c.subscription(id("plan.collection.testnet")).unwrap().state,
        "Funding"
    );
}
#[test]
#[should_panic(expected = "POSITION_NOT_PREPARED")]
fn failed_account_creation_cannot_accept_a_subscription() {
    let mut c = subscribable();
    c.items
        .get_mut(&id("plan.collection.testnet"))
        .unwrap()
        .prepared = false;
    c.subscribe(
        id("alice.testnet"),
        U128(100),
        id("plan.collection.testnet"),
    );
}
#[test]
#[should_panic(expected = "SUBSCRIPTION_CAPACITY_OR_MINIMUM")]
fn series_capacity_is_reserved_before_funding() {
    let mut c = subscribable();
    c.subscribed = 1;
    c.subscribe(
        id("alice.testnet"),
        U128(100),
        id("plan.collection.testnet"),
    );
}
#[test]
#[should_panic(expected = "SUBSCRIPTION_CAPACITY_OR_MINIMUM")]
fn minimum_deposit_is_enforced() {
    let mut c = subscribable();
    c.subscribe(id("alice.testnet"), U128(9), id("plan.collection.testnet"));
}
#[test]
#[should_panic(expected = "SUBSCRIPTIONS_CLOSED")]
fn closing_subscriptions_does_not_change_existing_terms() {
    let mut c = subscribable();
    c.subscriptions_closed = true;
    c.subscribe(
        id("alice.testnet"),
        U128(100),
        id("plan.collection.testnet"),
    );
}
