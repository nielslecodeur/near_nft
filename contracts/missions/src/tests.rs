use super::*;
use near_sdk::PromiseResult;
use near_sdk::{test_utils::VMContextBuilder, testing_env};
fn context(who: &str, time: u64, deposit: u128, result: Option<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id("missions.testnet".parse().unwrap())
        .predecessor_account_id(who.parse().unwrap())
        .block_timestamp(time)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::new(),
        result.into_iter().collect()
    );
}
fn setup() -> Missions {
    context("alice.testnet", SECOND, 0, None);
    Missions::new(
        "testnet".into(),
        "operator.testnet".parse().unwrap(),
        vec!["collection.testnet".parse().unwrap()],
        ["tradfi", "crypto", "liquidity"]
            .iter()
            .map(|s| Profile {
                id: s.to_string(),
                version: U64(1),
                price: U128(100),
                processing_ns: U64(10 * SECOND),
                enabled: true,
            })
            .collect(),
    )
}
fn quote(m: &mut Missions) {
    context("alice.testnet", SECOND, STORAGE, None);
    m.quote(
        "unique-mission-01".into(),
        "liquidity".into(),
        U64(1),
        Base64VecU8(vec![1; 32]),
        U64(5 * SECOND),
    );
}
fn paid() -> Missions {
    let mut m = setup();
    quote(&mut m);
    context("alice.testnet", SECOND, 100, None);
    m.pay("unique-mission-01".into());
    m
}
#[test]
#[should_panic(expected = "EXACT_MISSION_PRICE")]
fn wrong_amount() {
    let mut m = setup();
    quote(&mut m);
    context("alice.testnet", SECOND, 99, None);
    m.pay("unique-mission-01".into());
}
#[test]
#[should_panic(expected = "QUOTE_NOT_PAYABLE")]
fn expired_quote() {
    let mut m = setup();
    quote(&mut m);
    context("alice.testnet", 6 * SECOND, 100, None);
    m.pay("unique-mission-01".into());
}
#[test]
#[should_panic(expected = "QUOTE_NOT_PAYABLE")]
fn repeated_payment() {
    let mut m = paid();
    m.pay("unique-mission-01".into());
}
#[test]
#[should_panic(expected = "PAID_ONCE_BEFORE_DEADLINE")]
fn double_processing() {
    let mut m = paid();
    context("operator.testnet", SECOND, 0, None);
    m.begin("unique-mission-01".into());
    m.begin("unique-mission-01".into());
}
#[test]
#[should_panic(expected = "OPERATOR_ONLY")]
fn unauthorized_delivery() {
    let mut m = paid();
    context("bob.testnet", SECOND, 0, None);
    m.deliver(
        "unique-mission-01".into(),
        Base64VecU8(vec![1; 32]),
        Base64VecU8(vec![2; 32]),
        "abstain".into(),
        U64(20 * SECOND),
        vec![],
    );
}
#[test]
fn timeout_is_terminal_and_refund_callback_is_once() {
    let mut m = paid();
    context("alice.testnet", 12 * SECOND, 0, None);
    m.request_refund("unique-mission-01".into());
    m.claim_refund("unique-mission-01".into()).detach();
    context(
        "missions.testnet",
        12 * SECOND,
        0,
        Some(PromiseResult::Successful(vec![])),
    );
    assert!(m.on_payment("unique-mission-01".into(), false, U64(1)));
    assert!(!m.on_payment("unique-mission-01".into(), false, U64(1)));
    assert_eq!(
        m.mission("unique-mission-01".into()).unwrap().state,
        State::Refunded
    );
}
#[test]
#[should_panic(expected = "DELIVERY_WINDOW")]
fn refund_fences_late_delivery() {
    let mut m = paid();
    context("alice.testnet", 12 * SECOND, 0, None);
    m.request_refund("unique-mission-01".into());
    context("operator.testnet", 12 * SECOND, 0, None);
    m.deliver(
        "unique-mission-01".into(),
        Base64VecU8(vec![1; 32]),
        Base64VecU8(vec![2; 32]),
        "abstain".into(),
        U64(20 * SECOND),
        vec![],
    );
}
#[test]
fn failed_provider_transfer_remains_claimable() {
    let mut m = paid();
    context("operator.testnet", SECOND, 0, None);
    m.begin("unique-mission-01".into());
    m.deliver(
        "unique-mission-01".into(),
        Base64VecU8(vec![1; 32]),
        Base64VecU8(vec![2; 32]),
        "abstain".into(),
        U64(20 * SECOND),
        vec![],
    );
    m.claim_provider("unique-mission-01".into()).detach();
    context("missions.testnet", SECOND, 0, Some(PromiseResult::Failed));
    assert!(!m.on_payment("unique-mission-01".into(), true, U64(1)));
    assert_eq!(
        m.mission("unique-mission-01".into())
            .unwrap()
            .provider
            .unwrap()
            .state,
        "Claimable"
    );
}
#[test]
#[should_panic(expected = "REFUND_NOT_AVAILABLE")]
fn delivery_excludes_refund() {
    let mut m = paid();
    context("operator.testnet", SECOND, 0, None);
    m.begin("unique-mission-01".into());
    m.deliver(
        "unique-mission-01".into(),
        Base64VecU8(vec![1; 32]),
        Base64VecU8(vec![2; 32]),
        "abstain".into(),
        U64(20 * SECOND),
        vec![],
    );
    context("alice.testnet", 30 * SECOND, 0, None);
    m.request_refund("unique-mission-01".into());
}
#[test]
#[should_panic(expected = "CURRENT_PROPOSAL")]
fn payment_is_not_investment_authority() {
    let mut m = paid();
    context("alice.testnet", SECOND, 0, None);
    m.reserve_allocation(
        "unique-mission-01".into(),
        U64(0),
        "p.collection.testnet".parse().unwrap(),
        Allocation {
            collection: "collection.testnet".parse().unwrap(),
            strategy_id: "demo".into(),
            strategy_version: U64(1),
            asset: "token.testnet".parse().unwrap(),
            strategy: "strategy.testnet".parse().unwrap(),
            amount: U128(10),
            mandate_hash: Base64VecU8(vec![3; 32]),
        },
    );
}
#[test]
fn profile_change_cannot_reprice_existing_quote() {
    let mut m = paid();
    context("operator.testnet", SECOND, 0, None);
    m.set_profile(Profile {
        id: "liquidity".into(),
        version: U64(2),
        price: U128(200),
        processing_ns: U64(15 * SECOND),
        enabled: true,
    });
    let old = m.mission("unique-mission-01".into()).unwrap();
    assert_eq!(old.profile.price.0, 100);
    assert_eq!(old.profile.version.0, 1);
}
#[test]
fn missing_payment_callback_never_opens_another_payment() {
    let mut m = paid();
    context("alice.testnet", 30 * SECOND, 0, None);
    m.request_refund("unique-mission-01".into());
    m.claim_refund("unique-mission-01".into()).detach();
    context("missions.testnet", 30 * SECOND, 0, None);
    assert!(!m.on_payment("unique-mission-01".into(), false, U64(1)));
    assert_eq!(
        m.mission("unique-mission-01".into())
            .unwrap()
            .refund
            .unwrap()
            .state,
        "Paying"
    );
}
