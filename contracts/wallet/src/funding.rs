use super::*;
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct FundingPermit {
    pub agent: AccountId,
    pub amount: U128,
    pub expires_at: U64,
    pub beneficiary: AccountId,
    pub ownership_epoch: U64,
    pub policy_version: U64,
}
#[near]
impl Wallet {
    #[private]
    pub fn on_funding_cancelled(&mut self, version: U64) -> bool {
        let ok = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|b| serde_json::from_slice::<bool>(&b).ok())
            .unwrap_or(false);
        if ok
            && self
                .funding_permit
                .as_ref()
                .is_some_and(|p| p.policy_version == version)
        {
            self.funding_permit = None;
            self.policy_version += 1;
            return true;
        }
        false
    }
}
impl Wallet {
    pub(crate) fn authorize_funding(
        &mut self,
        agent: AccountId,
        asset: AccountId,
        strategy: AccountId,
        amount: U128,
        expires_at: U64,
        beneficiary: AccountId,
    ) -> Promise {
        let rules = self
            .series
            .as_ref()
            .unwrap_or_else(|| env::panic_str("SERIES_REQUIRED"));
        require!(
            self.deposits == 0 && self.funding_permit.is_none(),
            "INITIAL_SUBSCRIPTION_ONLY"
        );
        require!(
            asset == self.asset
                && strategy == self.strategy
                && beneficiary == self.owner
                && agent != self.owner
                && agent != env::current_account_id(),
            "SUBSCRIPTION_ROUTE"
        );
        require!(
            amount.0 >= rules.terms.minimum.0 && amount.0 <= rules.terms.capacity.0,
            "SUBSCRIPTION_AMOUNT"
        );
        require!(
            expires_at.0 > env::block_timestamp()
                && expires_at.0 <= rules.terms.closes_at.0
                && expires_at.0 <= env::block_timestamp() + DAY,
            "SUBSCRIPTION_EXPIRY"
        );
        self.policy_version += 1;
        let permit = FundingPermit {
            agent,
            amount,
            expires_at,
            beneficiary,
            ownership_epoch: U64(self.epoch),
            policy_version: U64(self.policy_version),
        };
        self.funding_permit = Some(permit.clone());
        call(
            self.collection.clone(),
            "authorize_agent_subscription",
            json!({"permit":permit}),
            0,
            25,
        )
    }
}
