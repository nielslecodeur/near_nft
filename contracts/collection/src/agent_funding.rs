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
impl Collection {
    pub fn authorize_agent_subscription(&mut self, permit: FundingPermit) -> bool {
        let position = env::predecessor_account_id();
        require!(
            self.cancelled_funding
                .get(&position)
                .is_none_or(|v| permit.policy_version.0 > v.0),
            "CANCELLED_POLICY"
        );
        let item = self
            .items
            .get(&position)
            .unwrap_or_else(|| env::panic_str("KNOWN_WALLET_ONLY"));
        require!(
            item.prepared
                && !item.minted
                && item.owner_id == permit.beneficiary
                && item.epoch == permit.ownership_epoch,
            "SUBSCRIPTION_OWNER"
        );
        require!(
            !self.subscriptions.contains_key(&position),
            "SUBSCRIPTION_EXISTS"
        );
        let terms = &self.series.as_ref().unwrap().terms;
        require!(
            permit.amount.0 >= terms.minimum.0
                && permit.amount.0 <= terms.capacity.0
                && permit.expires_at.0 > env::block_timestamp()
                && permit.expires_at.0 <= terms.closes_at.0,
            "SUBSCRIPTION_TERMS"
        );
        if let Some(old) = self.funding_permits.get(&position) {
            require!(
                permit.policy_version.0 > old.policy_version.0,
                "STALE_POLICY"
            );
        }
        self.funding_permits.insert(position, permit);
        true
    }
    pub fn funding_permit(&self, position: AccountId) -> Option<FundingPermit> {
        self.funding_permits.get(&position).cloned()
    }
    pub fn agent_subscribe(&mut self, position: AccountId, policy_version: U64) -> Promise {
        let permit = self
            .funding_permits
            .get(&position)
            .unwrap_or_else(|| env::panic_str("NO_FUNDING_MANDATE"));
        require!(env::predecessor_account_id() == permit.agent, "AGENT_ONLY");
        require!(
            permit.policy_version == policy_version && env::block_timestamp() < permit.expires_at.0,
            "EXPIRED_OR_STALE_MANDATE"
        );
        let sub = self
            .subscriptions
            .get_mut(&position)
            .unwrap_or_else(|| env::panic_str("NO_ESCROW"));
        require!(
            sub.state == "Authorized"
                && sub.owner == permit.beneficiary
                && sub.amount == permit.amount,
            "SUBSCRIPTION_NOT_AUTHORIZED"
        );
        sub.state = "Funding".into();
        self.forward_subscription(position, permit.amount)
    }
    /// Signed cancellation relayed by the keyless wallet. A transfer already in flight wins.
    pub fn cancel_agent_subscription(&mut self, policy_version: U64) -> bool {
        let position = env::predecessor_account_id();
        require!(self.items.contains_key(&position), "KNOWN_WALLET_ONLY");
        if let Some(old) = self.cancelled_funding.get(&position) {
            require!(policy_version.0 >= old.0, "STALE_POLICY");
        }
        if let Some(permit) = self.funding_permits.get(&position) {
            require!(permit.policy_version == policy_version, "STALE_POLICY");
        }
        if let Some(sub) = self.subscriptions.get_mut(&position) {
            require!(
                sub.state == "Authorized" || sub.state == "RefundClaimable",
                "SUBSCRIPTION_IN_FLIGHT"
            );
            if sub.state == "Authorized" {
                sub.state = "RefundClaimable".into();
                self.subscribed -= sub.amount.0;
                self.claims.insert(
                    format!("subscription:{}", position),
                    Claim {
                        beneficiary: sub.owner.clone(),
                        amount: sub.amount,
                        state: "Claimable".into(),
                        attempt: U64(0),
                    },
                );
            }
        }
        // Retain a generation tombstone so delayed deposits cannot fall back to normal funding.
        if let Some(permit) = self.funding_permits.get_mut(&position) {
            permit.expires_at = U64(0);
        }
        self.cancelled_funding.insert(position, policy_version);
        true
    }
}
