use super::*;
use near_sdk::json_types::Base64VecU8;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Listing {
    pub position: AccountId,
    pub id: U64,
    pub seller: AccountId,
    pub buyer: Option<AccountId>,
    pub price: U128,
    pub expires_at: U64,
    pub valuation_hash: Base64VecU8,
    pub available: U128,
    pub principal: U128,
    pub ownership_epoch: U64,
    pub state: String,
}
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Claim {
    pub beneficiary: AccountId,
    pub amount: U128,
    pub state: String,
    pub attempt: U64,
}
pub(crate) fn call(
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
fn key(position: &AccountId, id: U64) -> String {
    format!("{}:{}", position, id.0)
}

#[near]
impl Collection {
    /// Only the already-frozen keyless position wallet can publish an offer.
    pub fn open_listing(
        &mut self,
        id: U64,
        seller: AccountId,
        price: U128,
        expires_at: U64,
        valuation_hash: Base64VecU8,
        available: U128,
        principal: U128,
        ownership_epoch: U64,
        sync_seq: U64,
    ) -> bool {
        let position = env::predecessor_account_id();
        let item = self
            .items
            .get(&position)
            .unwrap_or_else(|| env::panic_str("UNKNOWN_ITEM"));
        require!(
            item.minted
                && item.owner_id == seller
                && item.epoch == ownership_epoch
                && item.sequence == sync_seq,
            "STALE_INDEX"
        );
        require!(
            price.0 > 0 && expires_at.0 > env::block_timestamp() && valuation_hash.0.len() == 32,
            "LISTING_TERMS"
        );
        if let Some(previous) = self.active_sales.get(&position) {
            let old = self.sales.get(&key(&position, *previous)).unwrap();
            require!(
                old.state == "Cancelled"
                    || old.state == "Settled"
                    || old.state == "RefundClaimable",
                "POSITION_ALREADY_LISTED"
            );
        }
        let k = key(&position, id);
        require!(!self.cancelled_sales.contains_key(&k), "LISTING_CANCELLED");
        require!(!self.sales.contains_key(&k), "LISTING_EXISTS");
        self.active_sales.insert(position.clone(), id);
        self.sales.insert(
            k,
            Listing {
                position,
                id,
                seller,
                buyer: None,
                price,
                expires_at,
                valuation_hash,
                available,
                principal,
                ownership_epoch,
                state: "Active".into(),
            },
        );
        true
    }
    pub fn listing(&self, position: AccountId, id: U64) -> Option<Listing> {
        self.sales.get(&key(&position, id)).cloned()
    }
    pub fn listings(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Listing> {
        self.sales
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(20).min(100) as usize)
            .cloned()
            .collect()
    }
    pub fn sale_claim(&self, position: AccountId, id: U64) -> Option<Claim> {
        self.claims.get(&key(&position, id)).cloned()
    }
    pub fn cancel_listing(&mut self, id: U64) -> bool {
        let position = env::predecessor_account_id();
        let k = key(&position, id);
        require!(
            self.items.contains_key(&position) && id.0 > 0 && id.0 <= 16,
            "KNOWN_POSITION_AND_SEQUENCE"
        );
        let Some(sale) = self.sales.get_mut(&k) else {
            // Fence an open_listing receipt delayed behind this signed cancellation.
            self.cancelled_sales.insert(k, true);
            return true;
        };
        require!(sale.state == "Active", "SETTLEMENT_ENGAGED");
        sale.state = "Cancelled".into();
        true
    }
    /// Expiration was part of the owner's signed terms; no administrative unlock.
    pub fn expire_listing(&mut self, position: AccountId, id: U64) -> Promise {
        let sale = self
            .sales
            .get_mut(&key(&position, id))
            .unwrap_or_else(|| env::panic_str("UNKNOWN_LISTING"));
        require!(
            sale.state == "Active" && env::block_timestamp() >= sale.expires_at.0,
            "LISTING_NOT_EXPIRED"
        );
        sale.state = "Cancelled".into();
        call(position.clone(), "abort_sale", json!({"id":id}), 0, 15).then(call(
            position,
            "release_sale",
            json!({"id":id}),
            0,
            15,
        ))
    }
    /// NEP-141 hook: escrow acceptance MUST NOT depend on a transfer promise's outcome.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.asset, "FT_ONLY");
        if let Ok(sub) = serde_json::from_str::<serde_json::Value>(&msg) {
            if let Some(request) = sub.get("AgentSubscribe") {
                require!(
                    sub.as_object().is_some_and(|m| m.len() == 1),
                    "SUBSCRIBE_MESSAGE"
                );
                let position: AccountId = serde_json::from_value(request["position"].clone())
                    .unwrap_or_else(|_| env::panic_str("POSITION_ID"));
                let version: U64 = serde_json::from_value(request["policy_version"].clone())
                    .unwrap_or_else(|_| env::panic_str("POLICY_VERSION"));
                require!(
                    self.funding_permits
                        .get(&position)
                        .is_some_and(|p| p.policy_version == version),
                    "STALE_POLICY"
                );
                return self.subscribe_impl(sender_id, amount, position, true);
            }
            if let Some(position) = sub.get("Subscribe").and_then(|v| v.as_str()) {
                require!(
                    sub.as_object().is_some_and(|m| m.len() == 1),
                    "SUBSCRIBE_MESSAGE"
                );
                return self.subscribe(
                    sender_id,
                    amount,
                    position
                        .parse()
                        .unwrap_or_else(|_| env::panic_str("POSITION_ID")),
                );
            }
        }
        #[near(serializers=[json])]
        #[serde(deny_unknown_fields)]
        struct Buy {
            position: AccountId,
            id: U64,
            valuation_hash: Base64VecU8,
        }
        let buy: Buy = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("BUY_MESSAGE"));
        let k = key(&buy.position, buy.id);
        let sale = self
            .sales
            .get_mut(&k)
            .unwrap_or_else(|| env::panic_str("UNKNOWN_LISTING"));
        require!(
            sale.state == "Active" && env::block_timestamp() < sale.expires_at.0,
            "LISTING_UNAVAILABLE"
        );
        require!(sale.price == amount && amount.0 > 0, "EXACT_PRICE_REQUIRED");
        require!(
            sale.seller != sender_id && sender_id != buy.position,
            "SELF_PURCHASE"
        );
        require!(
            sale.valuation_hash.0 == buy.valuation_hash.0,
            "STALE_VALUATION"
        );
        sale.state = "Settling".into();
        sale.buyer = Some(sender_id.clone());
        call(
            buy.position.clone(),
            "commit_sale",
            json!({"id":buy.id,"buyer":sender_id}),
            0,
            90,
        )
        .then(call(
            env::current_account_id(),
            "on_sale_outcome",
            json!({"position":buy.position,"id":buy.id}),
            0,
            60,
        ))
        .detach();
        U128(0)
    }
    /// Anyone can reconcile; it reads a durable result, never guesses from a timeout.
    pub fn resume_sale(&self, position: AccountId, id: U64) -> Promise {
        let sale = self
            .sales
            .get(&key(&position, id))
            .unwrap_or_else(|| env::panic_str("UNKNOWN_LISTING"));
        require!(
            sale.state == "Settling" || sale.state == "Resolving" || sale.state == "AwaitingIndex",
            "SALE_NOT_PENDING"
        );
        call(position.clone(), "sale_outcome", json!({"id":id}), 0, 15).then(call(
            env::current_account_id(),
            "on_sale_outcome",
            json!({"position":position,"id":id}),
            0,
            65,
        ))
    }
    /// The timeout permits fencing, not a refund. A committed wallet wins over abort.
    pub fn abort_settlement(&self, position: AccountId, id: U64) -> Promise {
        let sale = self
            .sales
            .get(&key(&position, id))
            .unwrap_or_else(|| env::panic_str("UNKNOWN_LISTING"));
        require!(
            (sale.state == "Settling"
                || sale.state == "Resolving"
                || sale.state == "AwaitingIndex")
                && env::block_timestamp() >= sale.expires_at.0,
            "ABORT_NOT_AVAILABLE"
        );
        call(position.clone(), "abort_sale", json!({"id":id}), 0, 15).then(call(
            env::current_account_id(),
            "on_sale_outcome",
            json!({"position":position,"id":id}),
            0,
            65,
        ))
    }
    pub fn release_cancelled(&self, position: AccountId, id: U64) -> Promise {
        let sale = self
            .sales
            .get(&key(&position, id))
            .unwrap_or_else(|| env::panic_str("UNKNOWN_LISTING"));
        require!(
            sale.state == "Cancelled" || sale.state == "RefundClaimable",
            "SALE_NOT_CANCELLED"
        );
        // Fence a delayed commit before releasing an expired/cancelled lock.
        call(position.clone(), "abort_sale", json!({"id":id}), 0, 15).then(call(
            position,
            "release_sale",
            json!({"id":id}),
            0,
            15,
        ))
    }
    pub fn release_settled(&self, position: AccountId, id: U64) -> Promise {
        require!(
            self.sales
                .get(&key(&position, id))
                .is_some_and(|sale| sale.state == "Settled"),
            "SALE_NOT_SETTLED"
        );
        call(position, "release_sale", json!({"id":id}), 0, 15)
    }
    #[private]
    pub fn on_sale_outcome(&mut self, position: AccountId, id: U64) -> bool {
        let k = key(&position, id);
        let Some(mut sale) = self.sales.get(&k).cloned() else {
            return false;
        };
        if sale.state != "Settling" && sale.state != "Resolving" && sale.state != "AwaitingIndex" {
            return false;
        }
        let report = env::promise_result_checked(0, 2048)
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok());
        let Some(report) = report else {
            sale.state = "Resolving".into();
            self.sales.insert(k, sale);
            return false;
        };
        if report["id"] != json!(id) {
            return false;
        }
        let committed = report["state"] == "Committed"
            && report["buyer"] == json!(sale.buyer)
            && report["owner_id"] == json!(sale.buyer);
        if committed {
            let item = self.items.get(&position).unwrap();
            if Some(&item.owner_id) != sale.buyer.as_ref()
                || json!(item.epoch) != report["ownership_epoch"]
                || json!(item.sequence) != report["sync_seq"]
            {
                sale.state = "AwaitingIndex".into();
                self.sales.insert(k, sale);
                return false;
            }
            sale.state = "Settled".into();
            self.claims.insert(
                k.clone(),
                Claim {
                    beneficiary: sale.seller.clone(),
                    amount: sale.price,
                    state: "Claimable".into(),
                    attempt: U64(0),
                },
            );
            self.sales.insert(k.clone(), sale);
            // Economic commit is durable before release; a release failure never creates buyer refund rights.
            call(position, "release_sale", json!({"id":id}), 0, 15).detach();
            self.schedule_claim(k).detach();
            return true;
        }
        if report["state"] == "Aborted" && report["owner_id"] == json!(sale.seller) {
            let buyer = sale.buyer.clone().unwrap();
            sale.state = "RefundClaimable".into();
            self.claims.insert(
                k.clone(),
                Claim {
                    beneficiary: buyer,
                    amount: sale.price,
                    state: "Claimable".into(),
                    attempt: U64(0),
                },
            );
            self.sales.insert(k, sale);
            call(position, "release_sale", json!({"id":id}), 0, 15).detach();
            return true;
        }
        false
    }
    pub fn claim_sale(&mut self, position: AccountId, id: U64) -> Promise {
        self.schedule_claim(key(&position, id))
    }
    #[private]
    pub fn on_sale_payment(&mut self, key: String, attempt: U64) -> bool {
        let Some(claim) = self.claims.get_mut(&key) else {
            return false;
        };
        if claim.state != "Paying" || claim.attempt != attempt {
            return false;
        }
        let succeeded = env::promise_result_checked(0, 256).is_ok();
        claim.state = if succeeded { "Paid" } else { "Claimable" }.into();
        succeeded
    }
}
impl Collection {
    pub(crate) fn schedule_claim(&mut self, key: String) -> Promise {
        let claim = self
            .claims
            .get_mut(&key)
            .unwrap_or_else(|| env::panic_str("NO_CLAIM"));
        require!(claim.state == "Claimable", "CLAIM_NOT_AVAILABLE");
        claim.state = "Paying".into();
        claim.attempt.0 += 1;
        let receiver = claim.beneficiary.clone();
        let amount = claim.amount;
        let attempt = claim.attempt;
        call(
            self.asset.clone(),
            "ft_transfer",
            json!({"receiver_id":receiver,"amount":amount,"memo":"Everkeep settlement"}),
            1,
            20,
        )
        .then(call(
            env::current_account_id(),
            "on_sale_payment",
            json!({"key":key,"attempt":attempt}),
            0,
            10,
        ))
    }
}
