use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseResult, env, near,
    require,
};
const DAY: u64 = 86_400_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Policy {
    pub agent: AccountId,
    pub asset: AccountId,
    pub strategy: AccountId,
    pub max_operation: U128,
    pub max_period: U128,
    pub allocation_bps: u16,
    pub expires_at: U64,
    pub ownership_epoch: U64,
    pub policy_version: U64,
}
#[near(serializers = [json])]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    pub protocol: String,
    pub version: u32,
    pub network: String,
    pub verifier: AccountId,
    pub collection: AccountId,
    pub token_id: String,
    pub ownership_epoch: U64,
    pub key_version: U64,
    pub policy_version: U64,
    pub nonce: U64,
    pub expires_at: U64,
    pub action: Action,
}
#[near(serializers = [json])]
pub enum Action {
    Withdraw {
        asset: AccountId,
        amount: U128,
        beneficiary: AccountId,
    },
    Redeem {
        asset: AccountId,
        amount: U128,
    },
    SetPolicy {
        policy: Policy,
        horizon_years: u16,
        target_bps: u16,
    },
    Revoke,
    Rotate {
        public_key: Base64VecU8,
    },
    Transfer {
        owner_id: AccountId,
        public_key: Base64VecU8,
    },
    TransferCall {
        owner_id: AccountId,
        public_key: Base64VecU8,
        msg: String,
    },
}
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Pending {
    pub id: U64,
    pub amount: U128,
    pub kind: String,
    pub epoch: U64,
}
#[near(serializers = [borsh])]
pub struct Consent {
    key: Vec<u8>,
    epoch: u64,
    expires_at: u64,
}
#[near(serializers = [borsh])]
pub struct TransferCallState {
    old_owner: AccountId,
    old_key: Vec<u8>,
    sequence: u64,
    msg: String,
    hook_started: bool,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Wallet {
    collection: AccountId,
    network: String,
    asset: AccountId,
    strategy: AccountId,
    owner: AccountId,
    public_key: Vec<u8>,
    epoch: u64,
    key_version: u64,
    policy_version: u64,
    nonce: u64,
    sync_seq: u64,
    active: bool,
    policy: Option<Policy>,
    agent_paused: bool,
    available: u128,
    reserved: u128,
    principal: u128,
    deposits: u128,
    withdrawals: u128,
    gains: u128,
    pending: Option<Pending>,
    operation: u64,
    period: u64,
    spent: u128,
    started_at: u64,
    horizon_years: u16,
    target_bps: u16,
    recipients: LookupMap<AccountId, Consent>,
    transfer_call: Option<TransferCallState>,
}
fn call(
    account: AccountId,
    method: &str,
    args: serde_json::Value,
    deposit: u128,
    gas: u64,
) -> Promise {
    Promise::new(account).function_call(
        method,
        serde_json::to_vec(&args).unwrap(),
        NearToken::from_yoctonear(deposit),
        Gas::from_tgas(gas),
    )
}
fn verify(pk: &[u8], sig: &[u8], msg: &[u8]) {
    require!(pk.len() == 1952 && sig.len() == 3309, "ML_DSA_LENGTH");
    require!(
        env::ml_dsa_verify(sig.try_into().unwrap(), msg, pk.try_into().unwrap()),
        "ML_DSA_INVALID"
    );
}
fn event(name: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard":"everkeep","version":"1.0.0","event":name,"data":[data]})
    ));
}
#[near]
impl Wallet {
    #[init]
    pub fn new(
        collection: AccountId,
        network: String,
        asset: AccountId,
        strategy: AccountId,
        owner: AccountId,
        public_key: Base64VecU8,
        proof: Base64VecU8,
    ) -> Self {
        let id = env::current_account_id();
        require!(env::predecessor_account_id() == collection, "FACTORY_ONLY");
        require!(
            id.as_str().split_once('.').map(|(_, p)| p) == Some(collection.as_str()),
            "NAMESPACE"
        );
        require!(owner != id && collection != id, "SELF_OWNER");
        require!(network == "sandbox" || network == "testnet", "TEST_ONLY");
        let message = serde_json::to_vec(&json!([
            "EVERKEEP_INIT_V1",
            network,
            id,
            collection,
            owner,
            public_key
        ]))
        .unwrap();
        verify(&public_key.0, &proof.0, &message);
        Self {
            collection,
            network,
            asset,
            strategy,
            owner,
            public_key: public_key.0,
            epoch: 0,
            key_version: 0,
            policy_version: 0,
            nonce: 0,
            sync_seq: 0,
            active: false,
            policy: None,
            agent_paused: true,
            available: 0,
            reserved: 0,
            principal: 0,
            deposits: 0,
            withdrawals: 0,
            gains: 0,
            pending: None,
            operation: 0,
            period: 0,
            spent: 0,
            started_at: env::block_timestamp(),
            horizon_years: 10,
            target_bps: 400,
            recipients: LookupMap::new(b"r"),
            transfer_call: None,
        }
    }
    pub fn snapshot(&self) -> serde_json::Value {
        json!({"account_id":env::current_account_id(),"collection_id":self.collection,"owner_id":self.owner,
            "network":self.network,"asset":self.asset,"strategy":self.strategy,"algorithm":"ML-DSA-65",
            "ownership_epoch":U64(self.epoch),"key_version":U64(self.key_version),"policy_version":U64(self.policy_version),
            "nonce":U64(self.nonce),"public_key":Base64VecU8(self.public_key.clone()),"status":if self.transfer_call.is_some(){"TransferPending"}else if self.active {"Active"} else {"Syncing"},
            "proposed_owner":self.transfer_call.as_ref().map(|_|self.owner.clone()),
            "available":U128(self.available),"reserved":U128(self.reserved),"principal":U128(self.principal),
            "deposits":U128(self.deposits),"withdrawals":U128(self.withdrawals),"realized_gains":U128(self.gains),
            "policy":self.policy,"agent_paused":self.agent_paused,"pending":self.pending,
            "started_at":U64(self.started_at),"horizon_years":self.horizon_years,"target_bps":self.target_bps,"sync_seq":U64(self.sync_seq)})
    }
    /// Bind the recipient's NEAR identity to a key they prove they possess.
    /// A seller cannot select a key they retain and silently name an uninvolved buyer.
    #[payable]
    pub fn register_recipient(
        &mut self,
        public_key: Base64VecU8,
        proof: Base64VecU8,
        expires_at: U64,
    ) {
        self.ready();
        require!(
            env::attached_deposit() >= NearToken::from_millinear(100),
            "CONSENT_STORAGE_DEPOSIT"
        );
        require!(
            expires_at.0 > env::block_timestamp() && expires_at.0 <= env::block_timestamp() + DAY,
            "CONSENT_EXPIRY"
        );
        let receiver = env::predecessor_account_id();
        require!(
            receiver != self.owner && receiver != env::current_account_id(),
            "CONSENT_RECEIVER"
        );
        let message = serde_json::to_vec(&json!([
            "EVERKEEP_RECIPIENT_V1",
            self.network,
            env::current_account_id(),
            self.collection,
            receiver,
            U64(self.epoch),
            expires_at,
            public_key
        ]))
        .unwrap();
        verify(&public_key.0, &proof.0, &message);
        self.recipients.insert(
            receiver,
            Consent {
                key: public_key.0,
                epoch: self.epoch,
                expires_at: expires_at.0,
            },
        );
    }
    pub fn sync(&self) -> Promise {
        // Idempotent reconciliation is safe even after a prior callback succeeded.
        call(
            self.collection.clone(),
            "sync_item",
            json!({"owner_id":self.owner,"sequence":U64(self.sync_seq),"epoch":U64(self.epoch)}),
            0,
            15,
        )
        .then(call(
            env::current_account_id(),
            "on_sync",
            json!({"sequence":U64(self.sync_seq)}),
            0,
            if self.transfer_call.is_some() {
                230
            } else {
                10
            },
        ))
    }
    #[private]
    pub fn on_sync(&mut self, sequence: U64) -> PromiseOrValue<bool> {
        if sequence.0 != self.sync_seq {
            return PromiseOrValue::Value(false);
        }
        let ok = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok())
            .unwrap_or(false);
        if !ok {
            return PromiseOrValue::Value(false);
        }
        if let Some(transfer) = self.transfer_call.as_mut() {
            if transfer.hook_started {
                return PromiseOrValue::Value(false);
            }
            transfer.hook_started = true;
            return PromiseOrValue::Promise(call(
                self.collection.clone(),
                "call_receiver",
                json!({"receiver_id":self.owner,"previous_owner_id":transfer.old_owner,"sequence":sequence,"msg":transfer.msg}),
                0,
                200,
            ));
        }
        self.active = true;
        PromiseOrValue::Value(true)
    }
    pub fn resolve_nft_transfer(&mut self, sequence: U64, accepted: bool) -> PromiseOrValue<bool> {
        require!(
            env::predecessor_account_id() == self.collection,
            "COLLECTION_ONLY"
        );
        let Some(t) = self.transfer_call.as_ref() else {
            return PromiseOrValue::Value(false);
        };
        require!(
            t.sequence == sequence.0 && t.hook_started,
            "TRANSFER_RESOLUTION_GENERATION"
        );
        let transfer = self.transfer_call.take().unwrap();
        if accepted {
            // The recipient's index entry was acknowledged before invoking the hook.
            // No second asynchronous acknowledgement is needed for acceptance.
            self.active = true;
            return PromiseOrValue::Value(true);
        }
        if !accepted {
            self.owner = transfer.old_owner;
            self.public_key = transfer.old_key;
            self.epoch += 1;
            self.key_version += 1;
            self.revoke_inner();
            self.sync_seq += 1;
        }
        PromiseOrValue::Promise(self.sync().then(call(
            env::current_account_id(),
            "on_nft_resolution",
            json!({"accepted":accepted,"sequence":U64(self.sync_seq)}),
            0,
            5,
        )))
    }
    #[private]
    pub fn on_nft_resolution(&self, accepted: bool, sequence: U64) -> bool {
        let synced = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|b| serde_json::from_slice::<bool>(&b).ok())
            .unwrap_or(false);
        synced && self.active && self.sync_seq == sequence.0 && accepted
    }
    /// Relays convey no owner authority. Exact canonical bytes are verified by the host.
    pub fn execute(
        &mut self,
        message: Base64VecU8,
        signature: Base64VecU8,
        new_key_proof: Option<Base64VecU8>,
    ) -> PromiseOrValue<serde_json::Value> {
        self.ready();
        require!(message.0.len() <= 16_384, "MESSAGE_LIMIT");
        let e: Envelope =
            serde_json::from_slice(&message.0).unwrap_or_else(|_| env::panic_str("MESSAGE_FORMAT"));
        require!(
            serde_json::to_vec(&e).unwrap() == message.0,
            "NON_CANONICAL"
        );
        require!(
            e.protocol == "EVERKEEP" && e.version == 1 && e.network == self.network,
            "DOMAIN"
        );
        require!(
            e.verifier == env::current_account_id()
                && e.token_id == env::current_account_id().as_str()
                && e.collection == self.collection,
            "NFT_DOMAIN"
        );
        require!(
            e.ownership_epoch.0 == self.epoch
                && e.key_version.0 == self.key_version
                && e.policy_version.0 == self.policy_version,
            "STALE_GENERATION"
        );
        require!(e.nonce.0 == self.nonce, "NONCE");
        require!(
            e.expires_at.0 > env::block_timestamp()
                && e.expires_at.0 <= env::block_timestamp().checked_add(DAY).unwrap(),
            "EXPIRED_OR_TOO_LONG"
        );
        verify(&self.public_key, &signature.0, &message.0);
        self.nonce = self.nonce.checked_add(1).unwrap();
        match e.action {
            Action::Withdraw {
                asset,
                amount,
                beneficiary,
            } => {
                require!(
                    asset == self.asset
                        && beneficiary != env::current_account_id()
                        && beneficiary != self.strategy,
                    "WITHDRAW_ROUTE"
                );
                let id = self.reserve(amount.0, "withdraw");
                return PromiseOrValue::Promise(call(self.asset.clone(), "ft_transfer", json!({"receiver_id":beneficiary,"amount":amount,"memo":"Everkeep withdrawal"}), 1, 20)
                    .then(call(env::current_account_id(), "on_payment", json!({"id":U64(id)}), 0, 15)));
            }
            Action::Redeem { asset, amount } => {
                require!(
                    asset == self.asset && amount.0 > 0 && amount.0 <= self.principal,
                    "REDEEM_AMOUNT_OR_ASSET"
                );
                self.operation += 1;
                self.principal -= amount.0;
                self.reserved += amount.0;
                self.pending = Some(Pending {
                    id: U64(self.operation),
                    amount,
                    kind: "redeem".into(),
                    epoch: U64(self.epoch),
                });
                return PromiseOrValue::Promise(
                    call(
                        self.strategy.clone(),
                        "redeem",
                        json!({"amount":amount}),
                        0,
                        60,
                    )
                    .then(call(
                        env::current_account_id(),
                        "on_payment",
                        json!({"id":U64(self.operation)}),
                        0,
                        15,
                    )),
                );
            }
            Action::SetPolicy {
                policy,
                horizon_years,
                target_bps,
            } => {
                require!(
                    policy.asset == self.asset && policy.strategy == self.strategy,
                    "POLICY_ROUTE"
                );
                require!(
                    policy.agent != env::current_account_id() && policy.agent != self.owner,
                    "AGENT_ID"
                );
                require!(
                    policy.ownership_epoch.0 == self.epoch
                        && policy.policy_version.0 == self.policy_version + 1,
                    "POLICY_GENERATION"
                );
                require!(
                    policy.allocation_bps <= 10_000
                        && policy.max_operation.0 > 0
                        && policy.max_period.0 >= policy.max_operation.0,
                    "POLICY_LIMIT"
                );
                require!(
                    policy.expires_at.0 > env::block_timestamp()
                        && horizon_years <= 100
                        && target_bps <= 10_000,
                    "POLICY_EXPIRY"
                );
                self.policy_version += 1;
                self.policy = Some(policy);
                self.agent_paused = false;
                self.horizon_years = horizon_years;
                self.target_bps = target_bps;
            }
            Action::Revoke => {
                self.revoke_inner();
            }
            Action::Rotate { public_key } => {
                self.prove_new_key(&public_key.0, &message.0, new_key_proof);
                self.public_key = public_key.0;
                self.key_version += 1;
            }
            Action::Transfer {
                owner_id,
                public_key,
            } => {
                return PromiseOrValue::Promise(self.start_transfer(
                    owner_id,
                    public_key.0,
                    &message.0,
                    new_key_proof,
                    None,
                ));
            }
            Action::TransferCall {
                owner_id,
                public_key,
                msg,
            } => {
                require!(msg.len() <= 1024, "RECEIVER_MESSAGE_LIMIT");
                return PromiseOrValue::Promise(self.start_transfer(
                    owner_id,
                    public_key.0,
                    &message.0,
                    new_key_proof,
                    Some(msg),
                ));
            }
        }
        event(
            "authorized",
            json!({"nonce":e.nonce,"key_version":U64(self.key_version)}),
        );
        PromiseOrValue::Value(self.snapshot())
    }
    /// Only narrows authority. A classical owner key cannot withdraw or broaden a mandate.
    pub fn pause_agent(&mut self) {
        require!(env::predecessor_account_id() == self.owner, "OWNER_ONLY");
        self.revoke_inner();
    }
    pub fn agent_allocate(
        &mut self,
        amount: U128,
        ownership_epoch: U64,
        policy_version: U64,
    ) -> Promise {
        self.ready();
        require!(!self.agent_paused, "AGENT_REVOKED");
        let p = self.policy.as_ref().unwrap();
        require!(env::predecessor_account_id() == p.agent, "AGENT_ONLY");
        require!(
            ownership_epoch.0 == self.epoch
                && policy_version.0 == self.policy_version
                && p.ownership_epoch.0 == self.epoch,
            "STALE_AGENT"
        );
        require!(env::block_timestamp() < p.expires_at.0, "AGENT_EXPIRED");
        let period = env::block_timestamp() / DAY;
        if self.period != period {
            self.period = period;
            self.spent = 0;
        }
        require!(
            amount.0 > 0
                && amount.0 <= p.max_operation.0
                && self.spent.checked_add(amount.0).unwrap() <= p.max_period.0,
            "AGENT_BUDGET"
        );
        let total = self.available.checked_add(self.principal).unwrap();
        let cap = total / 10_000 * u128::from(p.allocation_bps)
            + (total % 10_000) * u128::from(p.allocation_bps) / 10_000;
        require!(
            self.principal.checked_add(amount.0).unwrap() <= cap,
            "ALLOCATION_LIMIT"
        );
        self.spent += amount.0;
        let id = self.reserve(amount.0, "allocate");
        call(
            self.asset.clone(),
            "ft_transfer_call",
            json!({"receiver_id":self.strategy,"amount":amount,"msg":"invest"}),
            1,
            65,
        )
        .then(call(
            env::current_account_id(),
            "on_payment",
            json!({"id":U64(id)}),
            0,
            15,
        ))
    }
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.asset, "FT_ONLY");
        require!(self.active && self.pending.is_none(), "ACCOUNT_BUSY");
        require!(amount.0 > 0, "ZERO");
        if msg == "yield" {
            require!(sender_id == self.strategy, "YIELD_SOURCE");
            self.gains = self.gains.checked_add(amount.0).unwrap();
        } else {
            require!(msg == env::current_account_id().as_str(), "PLAN_MESSAGE");
            self.deposits = self.deposits.checked_add(amount.0).unwrap();
        }
        self.available = self.available.checked_add(amount.0).unwrap();
        event(
            "deposit",
            json!({"sender_id":sender_id,"amount":amount,"kind":msg}),
        );
        U128(0)
    }
    #[private]
    pub fn on_payment(&mut self, id: U64) -> bool {
        let Some(p) = self.pending.clone() else {
            return false;
        };
        if p.id != id {
            return false;
        }
        let used = match env::promise_result_checked(0, 256)
            .map(PromiseResult::Successful)
            .unwrap_or(PromiseResult::Failed)
        {
            PromiseResult::Successful(bytes) if p.kind == "allocate" => {
                match serde_json::from_slice::<U128>(&bytes) {
                    Ok(n) if n.0 <= p.amount.0 => n.0,
                    _ => {
                        event("payment_unresolved", json!({"id":id}));
                        return false;
                    }
                }
            }
            PromiseResult::Successful(bytes) if p.kind == "redeem" => {
                match serde_json::from_slice::<bool>(&bytes) {
                    Ok(true) => p.amount.0,
                    Ok(false) => 0,
                    _ => {
                        event("payment_unresolved", json!({"id":id}));
                        return false;
                    }
                }
            }
            PromiseResult::Successful(_) => p.amount.0,
            PromiseResult::Failed if p.kind == "allocate" || p.kind == "redeem" => {
                // Failure may be the FT resolver after an effective transfer, not the transfer itself.
                event(
                    "payment_unresolved",
                    json!({"id":id,"reason":"FT resolver outcome unknown"}),
                );
                return false;
            }
            PromiseResult::Failed => 0,
        };
        self.reserved -= p.amount.0;
        if p.kind == "redeem" {
            self.available += used;
            self.principal += p.amount.0 - used;
        } else {
            self.available += p.amount.0 - used;
            if p.kind == "withdraw" {
                self.withdrawals += used;
            } else {
                self.principal += used;
            }
        }
        self.pending = None;
        event(
            "payment_resolved",
            json!({"id":id,"used":U128(used),"epoch":p.epoch}),
        );
        used == p.amount.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};
    fn context(caller: &str, result: Option<PromiseResult>) {
        let mut c = VMContextBuilder::new();
        c.current_account_id("plan.collection.testnet".parse().unwrap())
            .predecessor_account_id(caller.parse().unwrap())
            .block_timestamp(DAY);
        testing_env!(
            c.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::new(),
            result.into_iter().collect()
        );
    }
    fn wallet() -> Wallet {
        context("alice.testnet", None);
        Wallet {
            collection: "collection.testnet".parse().unwrap(),
            network: "testnet".into(),
            asset: "demo.testnet".parse().unwrap(),
            strategy: "strategy.testnet".parse().unwrap(),
            owner: "alice.testnet".parse().unwrap(),
            public_key: vec![0; 1952],
            epoch: 0,
            key_version: 0,
            policy_version: 1,
            nonce: 0,
            sync_seq: 0,
            active: true,
            policy: Some(Policy {
                agent: "agent.testnet".parse().unwrap(),
                asset: "demo.testnet".parse().unwrap(),
                strategy: "strategy.testnet".parse().unwrap(),
                max_operation: U128(100),
                max_period: U128(200),
                allocation_bps: 2000,
                expires_at: U64(DAY * 2),
                ownership_epoch: U64(0),
                policy_version: U64(1),
            }),
            agent_paused: false,
            available: 1000,
            reserved: 0,
            principal: 0,
            deposits: 1000,
            withdrawals: 0,
            gains: 0,
            pending: None,
            operation: 0,
            period: 0,
            spent: 0,
            started_at: 0,
            horizon_years: 10,
            target_bps: 400,
            recipients: LookupMap::new(b"r"),
            transfer_call: None,
        }
    }
    #[test]
    fn real_ml_dsa_host_verifies_independent_noble_fixture() {
        context("alice.testnet", None);
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../fixtures/ml-dsa65.json")).unwrap();
        let pk: Base64VecU8 = serde_json::from_value(fixture["public_key"].clone()).unwrap();
        let sig: Base64VecU8 = serde_json::from_value(fixture["signature"].clone()).unwrap();
        let msg: Base64VecU8 = serde_json::from_value(fixture["message"].clone()).unwrap();
        verify(&pk.0, &sig.0, &msg.0);
        assert!(!env::ml_dsa_verify(
            sig.0.as_slice().try_into().unwrap(),
            b"tampered",
            pk.0.as_slice().try_into().unwrap()
        ));
    }
    #[test]
    fn failed_withdrawal_and_duplicate_callback() {
        let mut w = wallet();
        let id = w.reserve(100, "withdraw");
        assert_eq!((w.available, w.reserved), (900, 100));
        context("plan.collection.testnet", Some(PromiseResult::Failed));
        assert!(!w.on_payment(U64(id)));
        assert_eq!((w.available, w.reserved, w.withdrawals), (1000, 0, 0));
        assert!(!w.on_payment(U64(id)));
        assert_eq!(w.available, 1000);
    }
    #[test]
    fn successful_withdrawal_and_wrong_callback_id() {
        let mut w = wallet();
        let id = w.reserve(100, "withdraw");
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"null".to_vec())),
        );
        assert!(!w.on_payment(U64(id + 1)));
        assert_eq!(w.reserved, 100);
        assert!(w.on_payment(U64(id)));
        assert_eq!((w.available, w.reserved, w.withdrawals), (900, 0, 100));
        assert!(!w.on_payment(U64(id)));
        assert_eq!(w.withdrawals, 100);
    }
    #[test]
    fn partial_allocation_refund() {
        let mut w = wallet();
        let id = w.reserve(100, "allocate");
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"\"60\"".to_vec())),
        );
        assert!(!w.on_payment(U64(id)));
        assert_eq!((w.available, w.reserved, w.principal), (940, 0, 60));
    }
    #[test]
    fn uncertain_ft_resolution_stays_reserved() {
        let mut w = wallet();
        let id = w.reserve(100, "allocate");
        context("plan.collection.testnet", Some(PromiseResult::Failed));
        assert!(!w.on_payment(U64(id)));
        assert_eq!((w.available, w.reserved), (900, 100));
        assert!(w.pending.is_some());
    }
    #[test]
    fn redemption_callback_and_duplicate_are_exact() {
        let mut w = wallet();
        w.available = 900;
        w.reserved = 100;
        w.pending = Some(Pending {
            id: U64(1),
            amount: U128(100),
            kind: "redeem".into(),
            epoch: U64(0),
        });
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"true".to_vec())),
        );
        assert!(w.on_payment(U64(1)));
        assert_eq!((w.available, w.reserved, w.principal), (1000, 0, 0));
        assert!(!w.on_payment(U64(1)));
    }
    #[test]
    fn known_failed_redemption_restores_principal() {
        let mut w = wallet();
        w.available = 900;
        w.reserved = 100;
        w.pending = Some(Pending {
            id: U64(1),
            amount: U128(100),
            kind: "redeem".into(),
            epoch: U64(0),
        });
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"false".to_vec())),
        );
        assert!(!w.on_payment(U64(1)));
        assert_eq!((w.available, w.reserved, w.principal), (900, 0, 100));
    }
    #[test]
    #[should_panic(expected = "PAYMENT_PENDING")]
    fn transfer_blocked_while_payment_in_flight() {
        let mut w = wallet();
        w.reserve(100, "withdraw");
        w.execute(Base64VecU8(vec![]), Base64VecU8(vec![]), None);
    }
    #[test]
    #[should_panic(expected = "PAYMENT_PENDING")]
    fn double_withdrawal_blocked_before_authorization() {
        let mut w = wallet();
        w.reserve(100, "withdraw");
        w.ready();
    }
    #[test]
    #[should_panic(expected = "AGENT_BUDGET")]
    fn agent_operation_limit() {
        let mut w = wallet();
        context("agent.testnet", None);
        w.agent_allocate(U128(101), U64(0), U64(1));
    }
    #[test]
    #[should_panic(expected = "AGENT_BUDGET")]
    fn agent_period_limit() {
        let mut w = wallet();
        w.period = 1;
        w.spent = 190;
        context("agent.testnet", None);
        w.agent_allocate(U128(20), U64(0), U64(1));
    }
    #[test]
    #[should_panic(expected = "ALLOCATION_LIMIT")]
    fn agent_allocation_limit() {
        let mut w = wallet();
        w.principal = 199;
        w.available = 801;
        context("agent.testnet", None);
        w.agent_allocate(U128(2), U64(0), U64(1));
    }
    #[test]
    #[should_panic(expected = "AGENT_EXPIRED")]
    fn expired_agent() {
        let mut w = wallet();
        w.policy.as_mut().unwrap().expires_at = U64(DAY);
        context("agent.testnet", None);
        w.agent_allocate(U128(1), U64(0), U64(1));
    }
    #[test]
    #[should_panic(expected = "STALE_AGENT")]
    fn stale_agent_epoch() {
        let mut w = wallet();
        context("agent.testnet", None);
        w.agent_allocate(U128(1), U64(1), U64(1));
    }
    #[test]
    #[should_panic(expected = "AGENT_REVOKED")]
    fn revoked_agent() {
        let mut w = wallet();
        w.pause_agent();
        context("agent.testnet", None);
        w.agent_allocate(U128(1), U64(0), U64(1));
    }
    #[test]
    #[should_panic(expected = "FT_ONLY")]
    fn fake_token() {
        let mut w = wallet();
        w.ft_on_transfer(
            "alice.testnet".parse().unwrap(),
            U128(100),
            "plan.collection.testnet".into(),
        );
    }
    #[test]
    fn pause_does_not_lock_owner_funds() {
        let mut w = wallet();
        w.pause_agent();
        w.ready();
        assert_eq!(w.available, 1000);
        assert!(w.agent_paused);
    }
    #[test]
    fn sync_failure_then_success_is_idempotent() {
        let mut w = wallet();
        w.active = false;
        w.sync_seq = 1;
        context("plan.collection.testnet", Some(PromiseResult::Failed));
        assert!(matches!(w.on_sync(U64(1)), PromiseOrValue::Value(false)));
        assert!(!w.active);
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"true".to_vec())),
        );
        assert!(matches!(w.on_sync(U64(0)), PromiseOrValue::Value(false)));
        assert!(matches!(w.on_sync(U64(1)), PromiseOrValue::Value(true)));
        assert!(w.active);
    }
    #[test]
    fn nft_hook_is_scheduled_once_and_never_activates_temporary_owner() {
        let mut w = wallet();
        w.active = false;
        w.transfer_call = Some(TransferCallState {
            old_owner: w.owner.clone(),
            old_key: w.public_key.clone(),
            sequence: 0,
            msg: String::new(),
            hook_started: false,
        });
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"true".to_vec())),
        );
        assert!(matches!(w.on_sync(U64(0)), PromiseOrValue::Promise(_)));
        assert!(!w.active);
        assert!(matches!(w.on_sync(U64(0)), PromiseOrValue::Value(false)));
        assert!(!w.active);
    }
    #[test]
    fn accepted_nft_activates_only_at_collection_resolution() {
        let mut w = wallet();
        w.active = false;
        w.transfer_call = Some(TransferCallState {
            old_owner: w.owner.clone(),
            old_key: w.public_key.clone(),
            sequence: 0,
            msg: String::new(),
            hook_started: true,
        });
        context("collection.testnet", None);
        assert!(matches!(
            w.resolve_nft_transfer(U64(0), true),
            PromiseOrValue::Value(true)
        ));
        assert!(w.active);
        assert!(w.transfer_call.is_none());
    }
    #[test]
    fn rejected_nft_remains_frozen_until_return_index_ack() {
        let mut w = wallet();
        let old = w.owner.clone();
        w.owner = "receiver.testnet".parse().unwrap();
        w.active = false;
        w.epoch = 1;
        w.key_version = 1;
        w.transfer_call = Some(TransferCallState {
            old_owner: old.clone(),
            old_key: vec![0; 1952],
            sequence: 0,
            msg: String::new(),
            hook_started: true,
        });
        context("collection.testnet", None);
        let _ = w.resolve_nft_transfer(U64(0), false);
        assert_eq!(w.owner, old);
        assert_eq!(w.epoch, 2);
        assert!(!w.active);
        context(
            "plan.collection.testnet",
            Some(PromiseResult::Successful(b"true".to_vec())),
        );
        assert!(matches!(w.on_sync(U64(1)), PromiseOrValue::Value(true)));
        assert!(w.active);
    }
}
impl Wallet {
    fn start_transfer(
        &mut self,
        owner_id: AccountId,
        key: Vec<u8>,
        message: &[u8],
        proof: Option<Base64VecU8>,
        msg: Option<String>,
    ) -> Promise {
        require!(
            owner_id != self.owner
                && owner_id != env::current_account_id()
                && owner_id != self.collection,
            "NEW_OWNER"
        );
        let consent = self
            .recipients
            .get(&owner_id)
            .unwrap_or_else(|| env::panic_str("RECIPIENT_CONSENT_REQUIRED"));
        require!(
            consent.key == key
                && consent.epoch == self.epoch
                && consent.expires_at > env::block_timestamp(),
            "RECIPIENT_CONSENT_MISMATCH"
        );
        self.prove_new_key(&key, message, proof);
        self.recipients.remove(&owner_id);
        let old_owner = self.owner.clone();
        let old_key = std::mem::replace(&mut self.public_key, key);
        self.owner = owner_id;
        self.epoch += 1;
        self.key_version += 1;
        self.revoke_inner();
        self.active = false;
        self.sync_seq += 1;
        if let Some(msg) = msg {
            self.transfer_call = Some(TransferCallState {
                old_owner: old_owner.clone(),
                old_key,
                sequence: self.sync_seq,
                msg,
                hook_started: false,
            });
        }
        event(
            "control_transfer",
            json!({"old_owner_id":old_owner,"owner_id":self.owner,"epoch":U64(self.epoch)}),
        );
        self.sync()
    }
    fn ready(&self) {
        require!(self.active, "SYNC_REQUIRED");
        require!(self.pending.is_none(), "PAYMENT_PENDING");
    }
    fn reserve(&mut self, amount: u128, kind: &str) -> u64 {
        require!(
            amount > 0 && amount <= self.available,
            "INSUFFICIENT_AVAILABLE"
        );
        self.operation += 1;
        self.available -= amount;
        self.reserved += amount;
        self.pending = Some(Pending {
            id: U64(self.operation),
            amount: U128(amount),
            kind: kind.into(),
            epoch: U64(self.epoch),
        });
        self.operation
    }
    fn revoke_inner(&mut self) {
        self.policy = None;
        self.agent_paused = true;
        self.policy_version += 1;
    }
    fn prove_new_key(&self, pk: &[u8], msg: &[u8], proof: Option<Base64VecU8>) {
        require!(pk != self.public_key, "SAME_KEY");
        let proof = proof.unwrap_or_else(|| env::panic_str("NEW_KEY_PROOF_REQUIRED"));
        let mut pop = b"EVERKEEP_POP_V1\0".to_vec();
        pop.extend_from_slice(msg);
        verify(pk, &proof.0, &pop);
    }
}
