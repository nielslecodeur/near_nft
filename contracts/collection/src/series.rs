use super::*;
use crate::market::{Claim, call};

#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Subscription {
    pub owner: AccountId,
    pub amount: U128,
    pub state: String,
}
#[near(serializers=[json])]
#[serde(deny_unknown_fields)]
pub struct AdminEnvelope {
    pub protocol: String,
    pub network: String,
    pub verifier: AccountId,
    pub nonce: U64,
    pub expires_at: U64,
    pub action: AdminAction,
}
#[near(serializers=[json])]
pub enum AdminAction {
    Configure { series: Series },
    Close { mandate_hash: Base64VecU8 },
}

#[near]
impl Collection {
    /// A single immutable series. Closing subscriptions never changes existing rights.
    pub fn administer(&mut self, message: Base64VecU8, signature: Base64VecU8) -> bool {
        let e: AdminEnvelope =
            serde_json::from_slice(&message.0).unwrap_or_else(|_| env::panic_str("ADMIN_FORMAT"));
        require!(
            serde_json::to_vec(&e).unwrap() == message.0,
            "NON_CANONICAL"
        );
        require!(
            e.protocol == "EVERKEEP_ADMIN_V1"
                && e.network == self.network
                && e.verifier == env::current_account_id(),
            "ADMIN_DOMAIN"
        );
        require!(
            e.nonce.0 == self.admin_nonce
                && e.expires_at.0 > env::block_timestamp()
                && e.expires_at.0 <= env::block_timestamp() + 86_400_000_000_000,
            "ADMIN_NONCE_OR_EXPIRY"
        );
        let pk = self
            .admin_key
            .as_ref()
            .unwrap_or_else(|| env::panic_str("NO_SERIES_ADMIN"));
        require!(
            pk.len() == 1952 && signature.0.len() == 3309,
            "ML_DSA_LENGTH"
        );
        require!(
            env::ml_dsa_verify(
                signature.0.as_slice().try_into().unwrap(),
                &message.0,
                pk.as_slice().try_into().unwrap()
            ),
            "ML_DSA_INVALID"
        );
        match e.action {
            AdminAction::Configure { series } => {
                require!(
                    self.series.is_none() && self.items.is_empty(),
                    "SERIES_IMMUTABLE"
                );
                require!(
                    !series.id.is_empty()
                        && series.id.len() <= 64
                        && !series.name.is_empty()
                        && series.name.len() <= 100,
                    "SERIES_NAME"
                );
                require!(
                    series.opens_at.0 > env::block_timestamp()
                        && series.opens_at.0 < series.closes_at.0
                        && series.closes_at.0 < series.matures_at.0,
                    "SERIES_DATES"
                );
                require!(
                    series.asset == self.asset && series.strategy == self.strategy,
                    "SERIES_ROUTE"
                );
                require!(
                    series.minimum.0 > 0
                        && series.capacity.0 >= series.minimum.0
                        && series.capacity.0 / series.minimum.0 <= 1000,
                    "SERIES_CAPACITY"
                );
                require!(
                    series.allocation_bps <= 10_000
                        && series.max_operation.0 > 0
                        && series.max_period.0 >= series.max_operation.0
                        && series.version.0 == 1,
                    "SERIES_LIMITS"
                );
                let mandate_hash = Base64VecU8(env::sha256(&serde_json::to_vec(&series).unwrap()));
                self.series = Some(SeriesRules {
                    terms: series,
                    mandate_hash,
                });
            }
            AdminAction::Close { mandate_hash } => {
                require!(
                    self.series
                        .as_ref()
                        .is_some_and(|s| s.mandate_hash.0 == mandate_hash.0),
                    "SERIES_HASH"
                );
                self.subscriptions_closed = true;
            }
        }
        self.admin_nonce += 1;
        true
    }
    pub fn series(&self) -> serde_json::Value {
        json!({"series":self.series,"committed":U128(self.subscribed),"closed":self.subscriptions_closed,"admin_nonce":U64(self.admin_nonce)})
    }
    pub fn subscription(&self, position: AccountId) -> Option<Subscription> {
        self.subscriptions.get(&position).cloned()
    }
    /// Known failure is refundable. Uncertain FT resolution remains pending, never guessed.
    #[private]
    pub fn on_subscription(&mut self, position: AccountId) -> bool {
        let Some(mut sub) = self.subscriptions.get(&position).cloned() else {
            return false;
        };
        if sub.state != "Funding" {
            return false;
        }
        let used = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|b| serde_json::from_slice::<U128>(&b).ok());
        match used {
            Some(n) if n == sub.amount => {
                sub.state = "Funded".into();
                self.subscriptions.insert(position, sub);
                true
            }
            Some(n) if n.0 == 0 => {
                self.subscribed -= sub.amount.0;
                sub.state = "RefundClaimable".into();
                self.claims.insert(
                    format!("subscription:{}", position),
                    Claim {
                        beneficiary: sub.owner.clone(),
                        amount: sub.amount,
                        state: "Claimable".into(),
                        attempt: U64(0),
                    },
                );
                self.subscriptions.insert(position, sub);
                false
            }
            _ => false,
        }
    }
    pub fn claim_subscription(&mut self, position: AccountId) -> Promise {
        self.schedule_claim(format!("subscription:{}", position))
    }
    pub fn subscription_claim(&self, position: AccountId) -> Option<Claim> {
        self.claims
            .get(&format!("subscription:{}", position))
            .cloned()
    }
}
impl Collection {
    pub(crate) fn subscribe(
        &mut self,
        owner: AccountId,
        amount: U128,
        position: AccountId,
    ) -> U128 {
        self.subscribe_impl(owner, amount, position, false)
    }
    pub(crate) fn subscribe_impl(
        &mut self,
        owner: AccountId,
        amount: U128,
        position: AccountId,
        agent_mode: bool,
    ) -> U128 {
        if agent_mode {
            let p = self
                .funding_permits
                .get(&position)
                .unwrap_or_else(|| env::panic_str("NO_FUNDING_MANDATE"));
            require!(
                p.amount == amount
                    && p.beneficiary == owner
                    && env::block_timestamp() < p.expires_at.0,
                "FUNDING_MANDATE_LIMIT"
            );
        } else {
            require!(
                !self.funding_permits.contains_key(&position),
                "USE_AGENT_SUBSCRIPTION"
            );
        }
        let series = self
            .series
            .as_ref()
            .unwrap_or_else(|| env::panic_str("NO_SERIES"));
        require!(
            !self.subscriptions_closed
                && env::block_timestamp() >= series.terms.opens_at.0
                && env::block_timestamp() < series.terms.closes_at.0,
            "SUBSCRIPTIONS_CLOSED"
        );
        require!(
            amount.0 >= series.terms.minimum.0
                && self
                    .subscribed
                    .checked_add(amount.0)
                    .is_some_and(|n| n <= series.terms.capacity.0),
            "SUBSCRIPTION_CAPACITY_OR_MINIMUM"
        );
        let item = self
            .items
            .get(&position)
            .unwrap_or_else(|| env::panic_str("PREPARE_POSITION_FIRST"));
        require!(item.prepared, "POSITION_NOT_PREPARED");
        require!(
            item.owner_id == owner && !item.minted && !self.subscriptions.contains_key(&position),
            "SINGLE_INITIAL_SUBSCRIPTION_ONLY"
        );
        self.subscribed += amount.0;
        self.subscriptions.insert(
            position.clone(),
            Subscription {
                owner,
                amount,
                state: if agent_mode { "Authorized" } else { "Funding" }.into(),
            },
        );
        if !agent_mode {
            self.forward_subscription(position, amount).detach();
        }
        U128(0)
    }
    pub(crate) fn forward_subscription(&self, position: AccountId, amount: U128) -> Promise {
        call(
            self.asset.clone(),
            "ft_transfer_call",
            json!({"receiver_id":position,"amount":amount,"msg":position}),
            1,
            100,
        )
        .then(call(
            env::current_account_id(),
            "on_subscription",
            json!({"position":position}),
            0,
            20,
        ))
    }
}
