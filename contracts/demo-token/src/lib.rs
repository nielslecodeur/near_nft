use near_contract_standards::fungible_token::{
    FungibleToken,
    core::FungibleTokenCore,
    metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider},
    resolver::FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, PanicOnDefault, PromiseOrValue, env, near, require};
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct DemoToken {
    token: FungibleToken,
}
#[near]
impl DemoToken {
    #[init]
    pub fn new(owner_id: AccountId, total_supply: U128) -> Self {
        let id = env::current_account_id();
        let caller = env::predecessor_account_id();
        require!(
            caller == id
                || id.as_str().split_once('.').map(|(_, parent)| parent) == Some(caller.as_str()),
            "DEPLOYER_ONLY"
        );
        let mut token = FungibleToken::new(b"t");
        token.internal_register_account(&owner_id);
        token.internal_deposit(&owner_id, total_supply.0);
        Self { token }
    }
}
#[near]
impl FungibleTokenCore for DemoToken {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }
    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }
    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenResolver for DemoToken {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token
            .ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}
#[near]
impl StorageManagement for DemoToken {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }
    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        require!(
            self.token.ft_balance_of(env::predecessor_account_id()).0 == 0,
            "NONZERO_BALANCE"
        );
        self.token.storage_unregister(force)
    }
    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}
#[near]
impl FungibleTokenMetadataProvider for DemoToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: "ft-1.0.0".into(),
            name: "demoUSD — test tokens, no dollar value".into(),
            symbol: "demoUSD".into(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}
