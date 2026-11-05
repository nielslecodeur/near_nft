mod agent_funding;
use agent_funding::FundingPermit;
mod series;
#[path = "../../wallet/src/series_types.rs"]
mod series_types;
use series::Subscription;
use series_types::{Series, SeriesRules};
mod market;
#[cfg(test)]
mod market_tests;
use market::{Claim, Listing};
use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise, env, near, require};
#[near(serializers = [borsh, json])]
pub struct Item {
    owner_id: AccountId,
    sequence: U64,
    epoch: U64,
    minted: bool,
    prepared: bool,
}
#[near(serializers = [json])]
#[serde(deny_unknown_fields)]
pub struct Authorization {
    message: Base64VecU8,
    signature: Base64VecU8,
    new_key_proof: Option<Base64VecU8>,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Collection {
    network: String,
    asset: AccountId,
    strategy: AccountId,
    items: IterableMap<AccountId, Item>,
    sales: IterableMap<String, Listing>,
    active_sales: LookupMap<AccountId, U64>,
    claims: LookupMap<String, Claim>,
    series: Option<SeriesRules>,
    admin_key: Option<Vec<u8>>,
    admin_nonce: u64,
    subscribed: u128,
    subscriptions_closed: bool,
    subscriptions: LookupMap<AccountId, Subscription>,
    cancelled_sales: LookupMap<String, bool>,
    funding_permits: LookupMap<AccountId, FundingPermit>,
    cancelled_funding: LookupMap<AccountId, U64>,
}
#[near]
impl Collection {
    #[init]
    pub fn new(
        network: String,
        asset: AccountId,
        strategy: AccountId,
        admin_key: Option<Base64VecU8>,
    ) -> Self {
        let id = env::current_account_id();
        let caller = env::predecessor_account_id();
        require!(
            caller == id
                || id.as_str().split_once('.').map(|(_, parent)| parent) == Some(caller.as_str()),
            "DEPLOYER_ONLY"
        );
        require!(network == "sandbox" || network == "testnet", "TEST_ONLY");
        Self {
            network,
            asset,
            strategy,
            items: IterableMap::new(b"i"),
            sales: IterableMap::new(b"m"),
            active_sales: LookupMap::new(b"a"),
            claims: LookupMap::new(b"c"),
            series: None,
            admin_key: admin_key.map(|k| {
                require!(k.0.len() == 1952, "ADMIN_KEY_LENGTH");
                k.0
            }),
            admin_nonce: 0,
            subscribed: 0,
            subscriptions_closed: false,
            subscriptions: LookupMap::new(b"s"),
            cancelled_sales: LookupMap::new(b"x"),
            funding_permits: LookupMap::new(b"f"),
            cancelled_funding: LookupMap::new(b"q"),
        }
    }
    #[payable]
    pub fn create_plan(
        &mut self,
        name: String,
        public_key: Base64VecU8,
        proof: Base64VecU8,
    ) -> Promise {
        require!(
            (2..=24).contains(&name.len())
                && name
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-'),
            "NAME"
        );
        require!(
            public_key.0.len() == 1952 && proof.0.len() == 3309,
            "CRYPTO_LENGTH"
        );
        require!(
            env::attached_deposit() >= NearToken::from_near(6),
            "FUND_6_NEAR_FOR_CODE_STORAGE_GAS"
        );
        let account: AccountId = format!("{}.{}", name, env::current_account_id())
            .parse()
            .unwrap();
        require!(!self.items.contains_key(&account), "NAME_RESERVED");
        if self.admin_key.is_some() {
            require!(self.series.is_some(), "CONFIGURE_SERIES_FIRST");
        }
        if let Some(series) = &self.series {
            require!(
                !self.subscriptions_closed && env::block_timestamp() < series.terms.closes_at.0,
                "SUBSCRIPTIONS_CLOSED"
            );
        }
        let owner = env::predecessor_account_id();
        self.items.insert(
            account.clone(),
            Item {
                owner_id: owner.clone(),
                sequence: U64(0),
                epoch: U64(0),
                minted: false,
                prepared: false,
            },
        );
        // No AddKey: neither creator nor owner can replace code or bypass the contract.
        Promise::new(account.clone()).create_account().transfer(env::attached_deposit().saturating_sub(NearToken::from_millinear(50)))
            .deploy_contract(include_bytes!("../../../artifacts/wallet.wasm").to_vec())
            .function_call("new", serde_json::to_vec(&json!({"collection":env::current_account_id(),"network":self.network,"asset":self.asset,"strategy":self.strategy,"owner":owner,"public_key":public_key,"proof":proof,"series":self.series})).unwrap(), NearToken::from_yoctonear(0), Gas::from_tgas(30))
            .then(Promise::new(env::current_account_id()).function_call("on_created",serde_json::to_vec(&json!({"account":account})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(80)))
    }
    #[private]
    pub fn on_created(&self, account: AccountId) -> near_sdk::PromiseOrValue<bool> {
        if env::promise_result_checked(0, 256).is_err() {
            return near_sdk::PromiseOrValue::Value(false);
        }
        if self.series.is_some() {
            return near_sdk::PromiseOrValue::Promise(
                Promise::new(self.asset.clone())
                    .function_call(
                        "storage_deposit",
                        serde_json::to_vec(&json!({"account_id":account,"registration_only":true}))
                            .unwrap(),
                        NearToken::from_millinear(10),
                        Gas::from_tgas(10),
                    )
                    .then(Promise::new(account.clone()).function_call(
                        "sync",
                        b"{}".to_vec(),
                        NearToken::from_yoctonear(0),
                        Gas::from_tgas(45),
                    ))
                    .then(Promise::new(env::current_account_id()).function_call(
                        "on_prepared",
                        serde_json::to_vec(&json!({"account":account})).unwrap(),
                        NearToken::from_yoctonear(0),
                        Gas::from_tgas(5),
                    )),
            );
        }
        near_sdk::PromiseOrValue::Promise(Promise::new(account).function_call(
            "sync",
            b"{}".to_vec(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(45),
        ))
    }
    #[private]
    pub fn on_prepared(&mut self, account: AccountId) -> bool {
        let success = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|b| serde_json::from_slice::<bool>(&b).ok())
            .unwrap_or(false);
        if success {
            if let Some(item) = self.items.get_mut(&account) {
                item.prepared = true;
            }
        }
        success
    }
    pub fn sync_item(
        &mut self,
        owner_id: AccountId,
        sequence: U64,
        epoch: U64,
        funded: Option<bool>,
    ) -> bool {
        let account = env::predecessor_account_id();
        let item = self
            .items
            .get_mut(&account)
            .unwrap_or_else(|| env::panic_str("UNKNOWN_ITEM"));
        require!(
            sequence.0 >= item.sequence.0 && epoch.0 >= item.epoch.0,
            "STALE_SYNC"
        );
        if item.minted && sequence == item.sequence {
            require!(
                item.owner_id == owner_id && item.epoch == epoch,
                "SYNC_CONFLICT"
            );
            return true;
        }
        if self.series.is_some() && !funded.unwrap_or(false) {
            require!(!item.minted, "FUNDED_STATE_REGRESSION");
            return true;
        }
        let old = item.owner_id.clone();
        let minted = item.minted;
        item.owner_id = owner_id.clone();
        item.sequence = sequence;
        item.epoch = epoch;
        item.minted = true;
        let (event, data) = if minted {
            (
                "nft_transfer",
                json!({"old_owner_id":old,"new_owner_id":owner_id,"token_ids":[account]}),
            )
        } else {
            (
                "nft_mint",
                json!({"owner_id":owner_id,"token_ids":[account]}),
            )
        };
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({"standard":"nep171","version":"1.2.0","event":event,"data":[data]})
        ));
        true
    }
    pub fn nft_token(&self, token_id: String) -> Option<serde_json::Value> {
        let account: AccountId = token_id.parse().ok()?;
        let item = self.items.get(&account)?;
        if !item.minted {
            return None;
        }
        Some(
            json!({"token_id":account,"owner_id":item.owner_id,"ownership_epoch":item.epoch,"sync_seq":item.sequence,
            "metadata":{"title":"Everkeep — position NFT","description":"Compte de position de démonstration, contraintes contractuelles conservées, sans garantie","copies":1,"extra":account}}),
        )
    }
    pub fn nft_metadata(&self) -> serde_json::Value {
        json!({"spec":"nft-1.0.0","name":"Everkeep Positions","symbol":"KEEP","base_uri":null,"icon":null,"reference":null,"reference_hash":null})
    }
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.items.values().filter(|i| i.minted).count() as u128)
    }
    pub fn nft_tokens(
        &self,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<serde_json::Value> {
        self.items
            .iter()
            .filter(|(_, i)| i.minted)
            .skip(
                from_index
                    .unwrap_or(U128(0))
                    .0
                    .try_into()
                    .unwrap_or(usize::MAX),
            )
            .take(limit.unwrap_or(20).min(100) as usize)
            .filter_map(|(id, _)| self.nft_token(id.to_string()))
            .collect()
    }
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<serde_json::Value> {
        self.items
            .iter()
            .filter(|(_, i)| i.minted && i.owner_id == account_id)
            .skip(
                from_index
                    .unwrap_or(U128(0))
                    .0
                    .try_into()
                    .unwrap_or(usize::MAX),
            )
            .take(limit.unwrap_or(20).min(100) as usize)
            .filter_map(|(id, _)| self.nft_token(id.to_string()))
            .collect()
    }
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        U128(
            self.items
                .values()
                .filter(|i| i.minted && i.owner_id == account_id)
                .count() as u128,
        )
    }
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Promise {
        self.forward_authorized(receiver_id, token_id, approval_id, memo, None)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_standard_transfer",
                b"{}".to_vec(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(5),
            ))
    }
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        self.forward_authorized(receiver_id, token_id, approval_id, memo, Some(msg))
    }
    #[private]
    pub fn on_standard_transfer(&self) {
        let ok = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok())
            .unwrap_or(false);
        require!(ok, "WALLET_TRANSFER_NOT_FINALIZED");
    }
    pub fn call_receiver(
        &self,
        receiver_id: AccountId,
        previous_owner_id: AccountId,
        sequence: U64,
        msg: String,
    ) -> Promise {
        let wallet = env::predecessor_account_id();
        let item = self
            .items
            .get(&wallet)
            .unwrap_or_else(|| env::panic_str("UNKNOWN_ITEM"));
        require!(
            item.minted && item.owner_id == receiver_id && item.sequence == sequence,
            "RECEIVER_INDEX_MISMATCH"
        );
        require!(msg.len() <= 1024, "RECEIVER_MESSAGE_LIMIT");
        Promise::new(receiver_id).function_call("nft_on_transfer",serde_json::to_vec(&json!({"sender_id":previous_owner_id,"previous_owner_id":previous_owner_id,"token_id":wallet,"msg":msg})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(70))
            .then(Promise::new(env::current_account_id()).function_call("nft_resolve_transfer",serde_json::to_vec(&json!({"wallet":wallet,"sequence":sequence})).unwrap(),NearToken::from_yoctonear(0),Gas::from_tgas(95)))
    }
    #[private]
    pub fn nft_resolve_transfer(&self, wallet: AccountId, sequence: U64) -> Promise {
        let return_nft = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok())
            .unwrap_or(true);
        Promise::new(wallet).function_call(
            "resolve_nft_transfer",
            serde_json::to_vec(&json!({"sequence":sequence,"accepted":!return_nft})).unwrap(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(75),
        )
    }
}
impl Collection {
    fn forward_authorized(
        &self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: Option<String>,
    ) -> Promise {
        near_sdk::assert_one_yocto();
        require!(approval_id.is_none(), "APPROVAL_EXTENSION_NOT_SUPPORTED");
        let wallet: AccountId = token_id
            .parse()
            .unwrap_or_else(|_| env::panic_str("TOKEN_ID"));
        let item = self
            .items
            .get(&wallet)
            .unwrap_or_else(|| env::panic_str("UNKNOWN_ITEM"));
        require!(
            item.minted && item.owner_id == env::predecessor_account_id(),
            "NFT_OWNER_ONLY"
        );
        let memo = memo.unwrap_or_else(|| env::panic_str("SIGNED_AUTHORIZATION_REQUIRED_IN_MEMO"));
        require!(memo.len() <= 32768, "AUTHORIZATION_LIMIT");
        let auth: Authorization =
            serde_json::from_str(&memo).unwrap_or_else(|_| env::panic_str("AUTHORIZATION_FORMAT"));
        require!(auth.message.0.len() <= 16384, "MESSAGE_LIMIT");
        let envelope: serde_json::Value = serde_json::from_slice(&auth.message.0)
            .unwrap_or_else(|_| env::panic_str("MESSAGE_FORMAT"));
        let gas = if msg.is_some() { 280 } else { 230 };
        let name = if msg.is_some() {
            "TransferCall"
        } else {
            "Transfer"
        };
        let action = &envelope["action"][name];
        require!(
            action["owner_id"] == receiver_id.as_str(),
            "SIGNED_RECEIVER_MISMATCH"
        );
        if let Some(msg) = msg {
            require!(action["msg"] == msg, "SIGNED_MESSAGE_MISMATCH");
        }
        Promise::new(wallet).function_call(
            "execute",
            serde_json::to_vec(&auth).unwrap(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(gas),
        )
    }
}
