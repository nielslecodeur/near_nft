use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, near, require,
};
const SECOND: u64 = 1_000_000_000;
const STORAGE: u128 = 50_000_000_000_000_000_000_000; // 0.05 NEAR, separately disclosed storage reserve.
const MAX_ALLOCATIONS: usize = 4;

#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Profile {
    pub id: String,
    pub version: U64,
    pub price: U128,
    pub processing_ns: U64,
    pub enabled: bool,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, PartialEq, Debug)]
pub enum State {
    Quote,
    Paid,
    Processing,
    Delivered,
    Failed,
    RefundClaimable,
    Refunded,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Claim {
    pub beneficiary: AccountId,
    pub amount: U128,
    pub state: String,
    pub attempt: U64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
#[serde(deny_unknown_fields)]
pub struct Allocation {
    pub collection: AccountId,
    pub strategy_id: String,
    pub strategy_version: U64,
    pub asset: AccountId,
    pub strategy: AccountId,
    pub amount: U128,
    pub mandate_hash: Base64VecU8,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Operation {
    pub position: AccountId,
    pub allocation: Allocation,
    pub state: String,
    pub attempt: U64,
    pub authorization_hash: Option<Base64VecU8>,
    pub authorization_expires_at: Option<U64>,
    pub policy_version: Option<U64>,
    pub error: Option<String>,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Mission {
    pub id: String,
    pub client: AccountId,
    pub profile: Profile,
    pub request_hash: Base64VecU8,
    pub quote_expires_at: U64,
    pub paid_at: Option<U64>,
    pub deadline: Option<U64>,
    pub state: State,
    pub result_hash: Option<Base64VecU8>,
    pub proposal_expires_at: Option<U64>,
    pub outcome: Option<String>,
    pub allocation_hashes: Vec<Base64VecU8>,
    pub operations: Vec<Option<Operation>>,
    pub refund: Option<Claim>,
    pub provider: Option<Claim>,
    pub failure: Option<String>,
}
#[near(serializers=[json])]
#[serde(deny_unknown_fields)]
pub struct InvestmentAuthorization {
    pub protocol: String,
    pub version: u32,
    pub network: String,
    pub verifier: AccountId,
    pub mission_id: String,
    pub proposal_hash: Base64VecU8,
    pub request_hash: Base64VecU8,
    pub owner: AccountId,
    pub allocation_index: U64,
    pub position: AccountId,
    pub allocation: Allocation,
    pub ownership_epoch: U64,
    pub key_version: U64,
    pub policy_version: U64,
    pub nonce: U64,
    pub expires_at: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Missions {
    network: String,
    operator: AccountId,
    collections: Vec<AccountId>,
    profiles: Vec<Profile>,
    missions: IterableMap<String, Mission>,
}
fn call(account: AccountId, method: &str, args: serde_json::Value, gas: u64) -> Promise {
    Promise::new(account).function_call(
        method.to_string(),
        serde_json::to_vec(&args).unwrap(),
        NearToken::from_yoctonear(0),
        Gas::from_tgas(gas),
    )
}
fn digest_ok(hash: &Base64VecU8) {
    require!(hash.0.len() == 32, "HASH_LENGTH");
}
fn known_profile(p: &Profile) {
    require!(
        ["tradfi", "crypto", "liquidity"].contains(&p.id.as_str())
            && p.version.0 > 0
            && p.price.0 > 0
            && p.price.0 <= 10u128.pow(24)
            && p.processing_ns.0 >= 5 * SECOND
            && p.processing_ns.0 <= 3600 * SECOND,
        "PROFILE_TERMS"
    );
}
fn result() -> Option<bool> {
    if env::promise_results_count() != 1 {
        return None;
    }
    match env::promise_result_checked(0, 256) {
        Ok(_) => Some(true),
        Err(near_sdk::PromiseError::Failed) => Some(false),
        Err(_) => None,
    }
}
fn callback_json() -> Option<serde_json::Value> {
    env::promise_result_checked(0, 32768)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}

#[near]
impl Missions {
    #[init]
    pub fn new(
        network: String,
        operator: AccountId,
        collections: Vec<AccountId>,
        profiles: Vec<Profile>,
    ) -> Self {
        require!(network == "sandbox" || network == "testnet", "NETWORK");
        require!(
            !collections.is_empty() && collections.len() <= 4,
            "COLLECTIONS"
        );
        require!(profiles.len() == 3, "THREE_PROFILES");
        for p in &profiles {
            known_profile(p);
        }
        for id in ["tradfi", "crypto", "liquidity"] {
            require!(
                profiles.iter().filter(|p| p.id == id).count() == 1,
                "UNIQUE_PROFILES"
            );
        }
        Self {
            network,
            operator,
            collections,
            profiles,
            missions: IterableMap::new(b"m"),
        }
    }
    pub fn configuration(&self) -> serde_json::Value {
        json!({"network":self.network,"operator":self.operator,"collections":self.collections,"profiles":self.profiles,"storage_reserve":U128(STORAGE),"max_allocations":MAX_ALLOCATIONS})
    }
    pub fn set_profile(&mut self, profile: Profile) {
        self.operator_only();
        known_profile(&profile);
        let old = self
            .profiles
            .iter_mut()
            .find(|p| p.id == profile.id)
            .unwrap();
        require!(profile.version.0 > old.version.0, "PROFILE_VERSION");
        *old = profile;
    }
    pub fn mission(&self, id: String) -> Option<Mission> {
        self.missions.get(&id).cloned()
    }
    pub fn missions_for(&self, client: AccountId) -> Vec<Mission> {
        self.missions
            .values()
            .filter(|m| m.client == client)
            .take(100)
            .cloned()
            .collect()
    }
    #[payable]
    pub fn quote(
        &mut self,
        id: String,
        agent: String,
        agent_version: U64,
        request_hash: Base64VecU8,
        expires_at: U64,
    ) -> Mission {
        require!(
            id.len() >= 16
                && id.len() <= 64
                && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
            "MISSION_ID"
        );
        require!(
            self.missions.len() < 1000 && !self.missions.contains_key(&id),
            "UNIQUE_MISSION"
        );
        digest_ok(&request_hash);
        require!(
            env::attached_deposit().as_yoctonear() == STORAGE,
            "SEPARATE_STORAGE_RESERVE"
        );
        let p = self
            .profiles
            .iter()
            .find(|p| p.id == agent && p.version == agent_version && p.enabled)
            .expect("AGENT_UNAVAILABLE");
        require!(
            expires_at.0 > env::block_timestamp()
                && expires_at.0 <= env::block_timestamp() + 600 * SECOND,
            "QUOTE_EXPIRY"
        );
        let m = Mission {
            id: id.clone(),
            client: env::predecessor_account_id(),
            profile: p.clone(),
            request_hash,
            quote_expires_at: expires_at,
            paid_at: None,
            deadline: None,
            state: State::Quote,
            result_hash: None,
            proposal_expires_at: None,
            outcome: None,
            allocation_hashes: vec![],
            operations: vec![],
            refund: None,
            provider: None,
            failure: None,
        };
        self.missions.insert(id, m.clone());
        m
    }
    #[payable]
    pub fn pay(&mut self, id: String) -> bool {
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(env::predecessor_account_id() == m.client, "CLIENT_ONLY");
        require!(
            m.state == State::Quote && env::block_timestamp() < m.quote_expires_at.0,
            "QUOTE_NOT_PAYABLE"
        );
        require!(
            env::attached_deposit().as_yoctonear() == m.profile.price.0,
            "EXACT_MISSION_PRICE"
        );
        m.state = State::Paid;
        m.paid_at = Some(U64(env::block_timestamp()));
        m.deadline = Some(U64(env::block_timestamp()
            .checked_add(m.profile.processing_ns.0)
            .unwrap()));
        true
    }
    pub fn begin(&mut self, id: String) -> bool {
        self.operator_only();
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(
            m.state == State::Paid && env::block_timestamp() < m.deadline.unwrap().0,
            "PAID_ONCE_BEFORE_DEADLINE"
        );
        m.state = State::Processing;
        true
    }
    pub fn deliver(
        &mut self,
        id: String,
        request_hash: Base64VecU8,
        result_hash: Base64VecU8,
        outcome: String,
        proposal_expires_at: U64,
        allocation_hashes: Vec<Base64VecU8>,
    ) -> bool {
        self.operator_only();
        digest_ok(&result_hash);
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(
            m.state == State::Processing && env::block_timestamp() < m.deadline.unwrap().0,
            "DELIVERY_WINDOW"
        );
        require!(m.request_hash.0 == request_hash.0, "REQUEST_COMMITMENT");
        require!(
            ["proposed", "abstain"].contains(&outcome.as_str())
                && allocation_hashes.len() <= MAX_ALLOCATIONS
                && (outcome == "proposed") == !allocation_hashes.is_empty(),
            "DELIVERY_PROTOCOL"
        );
        require!(
            proposal_expires_at.0 > env::block_timestamp()
                && proposal_expires_at.0 <= env::block_timestamp() + 86400 * SECOND,
            "PROPOSAL_EXPIRY"
        );
        for h in &allocation_hashes {
            digest_ok(h);
        }
        m.state = State::Delivered;
        m.result_hash = Some(result_hash);
        m.proposal_expires_at = Some(proposal_expires_at);
        m.outcome = Some(outcome);
        m.operations = vec![None; allocation_hashes.len()];
        m.allocation_hashes = allocation_hashes;
        m.provider = Some(Claim {
            beneficiary: self.operator.clone(),
            amount: m.profile.price,
            state: "Claimable".into(),
            attempt: U64(0),
        });
        true
    }
    pub fn fail(&mut self, id: String, code: String) -> bool {
        self.operator_only();
        require!(
            ["PROCESSING_ERROR", "INVALID_RESULT", "DATA_UNAVAILABLE"].contains(&code.as_str()),
            "PUBLIC_FAILURE_CODE"
        );
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(
            matches!(m.state, State::Paid | State::Processing),
            "FAILURE_STATE"
        );
        m.state = State::Failed;
        m.failure = Some(code);
        true
    }
    pub fn request_refund(&mut self, id: String) -> bool {
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(env::predecessor_account_id() == m.client, "CLIENT_ONLY");
        require!(
            m.state == State::Failed
                || (matches!(m.state, State::Paid | State::Processing)
                    && env::block_timestamp() >= m.deadline.unwrap().0),
            "REFUND_NOT_AVAILABLE"
        );
        require!(m.provider.is_none(), "EXCLUSIVE_CLAIM");
        m.state = State::RefundClaimable;
        m.refund = Some(Claim {
            beneficiary: m.client.clone(),
            amount: m.profile.price,
            state: "Claimable".into(),
            attempt: U64(0),
        });
        true
    }
    pub fn claim_refund(&mut self, id: String) -> Promise {
        self.schedule_payment(id, false)
    }
    pub fn claim_provider(&mut self, id: String) -> Promise {
        self.schedule_payment(id, true)
    }
    #[private]
    pub fn on_payment(&mut self, id: String, provider: bool, attempt: U64) -> bool {
        let Some(m) = self.missions.get_mut(&id) else {
            return false;
        };
        let claim = if provider {
            m.provider.as_mut()
        } else {
            m.refund.as_mut()
        };
        let Some(c) = claim else {
            return false;
        };
        if c.state != "Paying" || c.attempt != attempt {
            return false;
        }
        match result() {
            Some(true) => {
                c.state = "Paid".into();
                if !provider {
                    m.state = State::Refunded;
                }
                true
            }
            Some(false) => {
                c.state = "Claimable".into();
                false
            }
            None => false,
        }
    }
    pub fn reserve_allocation(
        &mut self,
        id: String,
        index: U64,
        position: AccountId,
        allocation: Allocation,
    ) -> bool {
        require!(
            self.collections.contains(&allocation.collection)
                && position
                    .as_str()
                    .strip_suffix(&format!(".{}", allocation.collection))
                    .is_some_and(|s| !s.is_empty() && !s.contains('.')),
            "ALLOWED_COLLECTION_CHILD"
        );
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(env::predecessor_account_id() == m.client, "CLIENT_ONLY");
        require!(
            m.state == State::Delivered
                && m.outcome.as_deref() == Some("proposed")
                && env::block_timestamp() < m.proposal_expires_at.unwrap().0,
            "CURRENT_PROPOSAL"
        );
        let i = index.0 as usize;
        require!(i < m.operations.len(), "ALLOCATION_INDEX");
        // Typed tuple/struct serialization fixes field order independently of JSON map features.
        let expected = env::sha256(
            &serde_json::to_vec(&(
                "EVERKEEP_ALLOCATION_V1",
                &self.network,
                env::current_account_id(),
                &m.id,
                &m.client,
                &m.result_hash,
                index,
                &allocation,
            ))
            .unwrap(),
        );
        require!(
            expected == m.allocation_hashes[i].0,
            "ALLOCATION_COMMITMENT"
        );
        if let Some(old) = &m.operations[i] {
            require!(old.position == position, "ALLOCATION_ALREADY_RESERVED");
            return true;
        }
        m.operations[i] = Some(Operation {
            position,
            allocation,
            state: "Reserved".into(),
            attempt: U64(0),
            authorization_hash: None,
            authorization_expires_at: None,
            policy_version: None,
            error: None,
        });
        true
    }
    pub fn authorize_allocation(
        &mut self,
        message: Base64VecU8,
        signature: Base64VecU8,
    ) -> Promise {
        require!(
            message.0.len() <= 16384 && signature.0.len() == 3309,
            "AUTHORIZATION_LENGTH"
        );
        let e: InvestmentAuthorization =
            serde_json::from_slice(&message.0).expect("AUTHORIZATION_FORMAT");
        require!(
            serde_json::to_vec(&e).unwrap() == message.0,
            "NON_CANONICAL"
        );
        require!(
            e.protocol == "EVERKEEP_MISSION_INVEST_V1"
                && e.version == 1
                && e.network == self.network
                && e.verifier == env::current_account_id(),
            "AUTHORIZATION_DOMAIN"
        );
        let m = self.missions.get_mut(&e.mission_id).expect("MISSION");
        require!(
            env::predecessor_account_id() == m.client && e.owner == m.client,
            "CLIENT_ONLY"
        );
        require!(
            m.state == State::Delivered
                && m.result_hash
                    .as_ref()
                    .is_some_and(|h| h.0 == e.proposal_hash.0)
                && m.request_hash.0 == e.request_hash.0
                && e.expires_at.0 > env::block_timestamp()
                && e.expires_at.0 <= m.proposal_expires_at.unwrap().0,
            "CURRENT_PROPOSAL"
        );
        let o = m
            .operations
            .get_mut(e.allocation_index.0 as usize)
            .and_then(Option::as_mut)
            .expect("RESERVE_FIRST");
        require!(
            o.position == e.position
                && serde_json::to_vec(&o.allocation).unwrap()
                    == serde_json::to_vec(&e.allocation).unwrap(),
            "EXACT_ALLOCATION"
        );
        require!(
            o.state == "Reserved" || o.state == "Rejected",
            "AUTHORIZATION_ALREADY_ENGAGED"
        );
        o.attempt.0 += 1;
        o.state = "Verifying".into();
        o.authorization_hash = Some(Base64VecU8(env::sha256(&message.0)));
        let attempt = o.attempt;
        call(e.position.clone(), "snapshot", json!({}), 10).then(call(
            env::current_account_id(),
            "on_authorization",
            json!({"message":message,"signature":signature,"attempt":attempt}),
            30,
        ))
    }
    #[private]
    pub fn on_authorization(
        &mut self,
        message: Base64VecU8,
        signature: Base64VecU8,
        attempt: U64,
    ) -> bool {
        let Ok(e) = serde_json::from_slice::<InvestmentAuthorization>(&message.0) else {
            return false;
        };
        let Some(m) = self.missions.get_mut(&e.mission_id) else {
            return false;
        };
        let Some(o) = m
            .operations
            .get_mut(e.allocation_index.0 as usize)
            .and_then(Option::as_mut)
        else {
            return false;
        };
        if o.state != "Verifying"
            || o.attempt != attempt
            || o.authorization_hash
                .as_ref()
                .is_none_or(|h| h.0 != env::sha256(&message.0))
        {
            return false;
        }
        let valid = callback_json().is_some_and(|s| {
            let p = &s["funding_permit"];
            let key = serde_json::from_value::<Base64VecU8>(s["public_key"].clone()).ok();
            let t = &s["series"]["terms"];
            s["account_id"] == e.position.as_str()
                && s["owner_id"] == e.owner.as_str()
                && s["network"] == e.network
                && s["collection_id"] == e.allocation.collection.as_str()
                && s["asset"] == e.allocation.asset.as_str()
                && s["strategy"] == e.allocation.strategy.as_str()
                && t["id"] == e.allocation.strategy_id
                && t["version"] == e.allocation.strategy_version.0.to_string()
                && s["series"]["mandate_hash"]
                    == serde_json::to_value(&e.allocation.mandate_hash).unwrap()
                && s["nonce"] == e.nonce.0.to_string()
                && s["ownership_epoch"] == e.ownership_epoch.0.to_string()
                && s["key_version"] == e.key_version.0.to_string()
                && s["policy_version"] == e.policy_version.0.to_string()
                && s["funded"] == false
                && s["status"] == "SubscriptionAuthorized"
                && p["agent"] == env::current_account_id().as_str()
                && p["beneficiary"] == e.owner.as_str()
                && p["amount"] == e.allocation.amount.0.to_string()
                && p["policy_version"] == e.policy_version.0.to_string()
                && p["ownership_epoch"] == e.ownership_epoch.0.to_string()
                && p["expires_at"]
                    .as_str()
                    .and_then(|v| v.parse::<u64>().ok())
                    .is_some_and(|v| v >= e.expires_at.0)
                && key.is_some_and(|k| {
                    k.0.len() == 1952
                        && signature.0.len() == 3309
                        && env::ml_dsa_verify(
                            signature.0.as_slice().try_into().unwrap(),
                            &message.0,
                            k.0.as_slice().try_into().unwrap(),
                        )
                })
        });
        if valid && env::block_timestamp() < e.expires_at.0 {
            o.state = "Authorized".into();
            o.policy_version = Some(e.policy_version);
            o.authorization_expires_at = Some(e.expires_at);
            o.error = None;
            true
        } else {
            o.state = "Rejected".into();
            o.error = Some("AUTHORIZATION_REJECTED".into());
            false
        }
    }
    pub fn execute_allocation(&mut self, id: String, index: U64) -> Promise {
        self.operator_only();
        let m = self.missions.get_mut(&id).expect("MISSION");
        require!(
            m.state == State::Delivered
                && env::block_timestamp() < m.proposal_expires_at.unwrap().0,
            "CURRENT_PROPOSAL"
        );
        let o = m
            .operations
            .get_mut(index.0 as usize)
            .and_then(Option::as_mut)
            .expect("OPERATION");
        require!(o.state == "Authorized", "OPERATION_NOT_READY");
        require!(
            o.authorization_expires_at
                .is_some_and(|e| env::block_timestamp() < e.0),
            "AUTHORIZATION_EXPIRED"
        );
        o.state = "Funding".into();
        o.attempt.0 += 1;
        let attempt = o.attempt;
        call(
            o.allocation.collection.clone(),
            "agent_subscribe",
            json!({"position":o.position,"policy_version":o.policy_version}),
            190,
        )
        .then(call(
            env::current_account_id(),
            "after_execution",
            json!({"id":id,"index":index,"attempt":attempt}),
            35,
        ))
    }
    #[private]
    pub fn after_execution(&self, id: String, index: U64, attempt: U64) -> Promise {
        self.inspect(id, index, attempt)
    }
    pub fn reconcile_allocation(&self, id: String, index: U64) -> Promise {
        let m = self.missions.get(&id).expect("MISSION");
        let o = m
            .operations
            .get(index.0 as usize)
            .and_then(Option::as_ref)
            .expect("OPERATION");
        self.inspect(id, index, o.attempt)
    }
    #[private]
    pub fn on_operation(&mut self, id: String, index: U64, attempt: U64) -> PromiseOrValue<bool> {
        let Some(m) = self.missions.get_mut(&id) else {
            return PromiseOrValue::Value(false);
        };
        let Some(o) = m
            .operations
            .get_mut(index.0 as usize)
            .and_then(Option::as_mut)
        else {
            return PromiseOrValue::Value(false);
        };
        if o.attempt != attempt || !["Funding", "Uncertain"].contains(&o.state.as_str()) {
            return PromiseOrValue::Value(o.state == "Confirmed");
        }
        let Some(s) = callback_json() else {
            o.state = "Uncertain".into();
            return PromiseOrValue::Value(false);
        };
        if s["account_id"] == o.position.as_str()
            && s["owner_id"] == m.client.as_str()
            && s["funded"] == true
            && s["status"] == "Active"
            && s["deposits"] == o.allocation.amount.0.to_string()
            && s["asset"] == o.allocation.asset.as_str()
            && s["strategy"] == o.allocation.strategy.as_str()
            && s["series"]["mandate_hash"]
                == serde_json::to_value(&o.allocation.mandate_hash).unwrap()
        {
            PromiseOrValue::Promise(
                call(
                    o.allocation.collection.clone(),
                    "nft_token",
                    json!({"token_id":o.position}),
                    5,
                )
                .then(call(
                    env::current_account_id(),
                    "on_index",
                    json!({"id":id,"index":index,"attempt":attempt}),
                    10,
                )),
            )
        } else {
            o.state = "Uncertain".into();
            o.error = Some("AWAITING_DURABLE_RESULT".into());
            PromiseOrValue::Value(false)
        }
    }
    #[private]
    pub fn on_index(&mut self, id: String, index: U64, attempt: U64) -> bool {
        let Some(m) = self.missions.get_mut(&id) else {
            return false;
        };
        let Some(o) = m
            .operations
            .get_mut(index.0 as usize)
            .and_then(Option::as_mut)
        else {
            return false;
        };
        if o.attempt != attempt || !["Funding", "Uncertain"].contains(&o.state.as_str()) {
            return o.state == "Confirmed";
        }
        if callback_json().is_some_and(|n| {
            n["token_id"] == o.position.as_str() && n["owner_id"] == m.client.as_str()
        }) {
            o.state = "Confirmed".into();
            o.error = None;
            true
        } else {
            o.state = "Uncertain".into();
            o.error = Some("AWAITING_NFT_INDEX".into());
            false
        }
    }
    /// A durable collection permit is the single-use execution fence, including on retries.
    pub fn retry_allocation(&self, id: String, index: U64) -> Promise {
        self.operator_only();
        let m = self.missions.get(&id).expect("MISSION");
        let o = m
            .operations
            .get(index.0 as usize)
            .and_then(Option::as_ref)
            .expect("OPERATION");
        require!(o.state == "Uncertain", "UNCERTAIN_ONLY");
        call(
            o.allocation.collection.clone(),
            "subscription",
            json!({"position":o.position}),
            5,
        )
        .then(call(
            env::current_account_id(),
            "on_retry",
            json!({"id":id,"index":index,"attempt":o.attempt}),
            10,
        ))
    }
    #[private]
    pub fn on_retry(&mut self, id: String, index: U64, attempt: U64) -> bool {
        let Some(m) = self.missions.get_mut(&id) else {
            return false;
        };
        let Some(o) = m
            .operations
            .get_mut(index.0 as usize)
            .and_then(Option::as_mut)
        else {
            return false;
        };
        if o.state != "Uncertain" || o.attempt != attempt {
            return false;
        }
        let allowed = callback_json().is_some_and(|s| {
            s["state"] == "Authorized"
                && s["owner"] == m.client.as_str()
                && s["amount"] == o.allocation.amount.0.to_string()
        });
        if allowed
            && o.authorization_expires_at
                .is_some_and(|e| env::block_timestamp() < e.0)
            && env::block_timestamp() < m.proposal_expires_at.unwrap().0
        {
            o.state = "Authorized".into();
            o.error = None;
            true
        } else {
            false
        }
    }
}
impl Missions {
    fn operator_only(&self) {
        require!(
            env::predecessor_account_id() == self.operator,
            "OPERATOR_ONLY"
        );
    }
    fn schedule_payment(&mut self, id: String, provider: bool) -> Promise {
        let m = self.missions.get_mut(&id).expect("MISSION");
        let claim = if provider {
            require!(
                m.state == State::Delivered && m.refund.is_none(),
                "DELIVERED_ONLY"
            );
            m.provider.as_mut()
        } else {
            require!(
                m.state == State::RefundClaimable && m.provider.is_none(),
                "REFUND_ONLY"
            );
            m.refund.as_mut()
        };
        let c = claim.expect("CLAIM");
        require!(c.state == "Claimable", "CLAIM_NOT_AVAILABLE");
        c.state = "Paying".into();
        c.attempt.0 += 1;
        Promise::new(c.beneficiary.clone())
            .transfer(NearToken::from_yoctonear(c.amount.0))
            .then(call(
                env::current_account_id(),
                "on_payment",
                json!({"id":id,"provider":provider,"attempt":c.attempt}),
                10,
            ))
    }
    fn inspect(&self, id: String, index: U64, attempt: U64) -> Promise {
        let m = self.missions.get(&id).expect("MISSION");
        let o = m
            .operations
            .get(index.0 as usize)
            .and_then(Option::as_ref)
            .expect("OPERATION");
        call(o.position.clone(), "snapshot", json!({}), 10).then(call(
            env::current_account_id(),
            "on_operation",
            json!({"id":id,"index":index,"attempt":attempt}),
            20,
        ))
    }
}

#[cfg(test)]
mod tests;
