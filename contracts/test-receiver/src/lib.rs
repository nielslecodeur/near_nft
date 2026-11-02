//! Test-only adversarial NEP-171 receiver, never part of a production deployment.
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, near, require,
};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestReceiver {
    collection: AccountId,
    reject: bool,
    attack: Vec<u8>,
    seen_status: String,
    attack_blocked: bool,
}
#[near]
impl TestReceiver {
    #[init]
    #[private]
    pub fn new(collection: AccountId, reject: bool) -> Self {
        Self {
            collection,
            reject,
            attack: vec![],
            seen_status: String::new(),
            attack_blocked: false,
        }
    }
    #[private]
    pub fn set_attack(&mut self, authorization: serde_json::Value) {
        self.attack = serde_json::to_vec(&authorization).unwrap();
        require!(self.attack.len() <= 16384, "ATTACK_BOUND");
    }
    #[payable]
    #[private]
    pub fn consent(
        &mut self,
        wallet: AccountId,
        public_key: Base64VecU8,
        proof: Base64VecU8,
        expires_at: U64,
    ) -> Promise {
        Promise::new(wallet).function_call(
            "register_recipient",
            serde_json::to_vec(
                &json!({"public_key":public_key,"proof":proof,"expires_at":expires_at}),
            )
            .unwrap(),
            env::attached_deposit(),
            Gas::from_tgas(30),
        )
    }
    pub fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> Promise {
        require!(
            env::predecessor_account_id() == self.collection,
            "COLLECTION_ONLY"
        );
        let _ = (sender_id, previous_owner_id, msg);
        let wallet: AccountId = token_id.parse().unwrap();
        Promise::new(wallet.clone())
            .function_call(
                "snapshot",
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(8),
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "after_snapshot",
                serde_json::to_vec(&json!({"wallet":wallet})).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(52),
            ))
    }
    #[private]
    pub fn after_snapshot(&mut self, wallet: AccountId) -> PromiseOrValue<bool> {
        let data = env::promise_result_checked(0, 16384).unwrap();
        let s: serde_json::Value = serde_json::from_slice(&data).unwrap();
        require!(
            s["owner_id"] == env::current_account_id().as_str(),
            "RECEIVER_IS_NOT_TEMPORARY_OWNER"
        );
        self.seen_status = s["status"].as_str().unwrap().into();
        if self.attack.is_empty() {
            return PromiseOrValue::Value(self.reject);
        }
        PromiseOrValue::Promise(
            Promise::new(wallet)
                .function_call(
                    "execute",
                    self.attack.clone(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(30),
                )
                .then(Promise::new(env::current_account_id()).function_call(
                    "after_attack",
                    b"{}".to_vec(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(10),
                )),
        )
    }
    #[private]
    pub fn after_attack(&mut self) -> bool {
        self.attack_blocked = env::promise_result_checked(0, 16384).is_err();
        self.reject
    }
    pub fn observations(&self) -> serde_json::Value {
        json!({"status":self.seen_status,"attack_blocked":self.attack_blocked})
    }
}
