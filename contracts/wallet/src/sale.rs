use super::*;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct SaleLock {
    pub id: U64,
    pub price: U128,
    pub expires_at: U64,
    pub valuation_hash: Base64VecU8,
    pub state: String,
    pub buyer: Option<AccountId>,
}

#[near]
impl Wallet {
    /// Timestamp of the frozen accounting snapshot, not a promise of recoverable value.
    /// A separate, bounded storage namespace preserves the existing root state layout.
    pub fn sale_valuation_at(&self, id: U64) -> Option<U64> {
        env::storage_read(&valuation_key(id))
            .and_then(|bytes| <[u8; 8]>::try_from(bytes).ok())
            .map(|bytes| U64(u64::from_le_bytes(bytes)))
    }
    /// Immutable accounting quote; callers sign the returned digest, never a floating valuation.
    pub fn sale_quote(&self, price: U128, expires_at: U64) -> serde_json::Value {
        let terms = json!([
            "EVERKEEP_SALE_V1",
            self.network,
            env::current_account_id(),
            self.collection,
            self.owner,
            U64(self.epoch),
            U64(self.key_version),
            self.asset,
            price,
            expires_at,
            U128(self.available),
            U128(self.principal),
            U128(self.reserved),
            U128(self.gains),
            self.series
        ]);
        json!({"id":U64(self.sale_sequence+1),"price":price,"expires_at":expires_at,"available":U128(self.available),"principal":U128(self.principal),"valuation_hash":Base64VecU8(env::sha256(&serde_json::to_vec(&terms).unwrap()))})
    }
    /// Durable outcome. A Frozen read alone NEVER permits the escrow to refund.
    pub fn sale_outcome(&self, id: U64) -> serde_json::Value {
        let sale = self
            .sale
            .as_ref()
            .or(self.last_sale.as_ref())
            .filter(|sale| sale.id == id);
        match sale {
            Some(sale) => {
                json!({"id":id,"state":sale.state,"owner_id":self.owner,"buyer":sale.buyer,"ownership_epoch":U64(self.epoch),"sync_seq":U64(self.sync_seq)})
            }
            None => json!({"id":id,"state":"Unknown"}),
        }
    }
    /// Collection-only settlement under a previously ML-DSA-authorized fixed-price lock.
    /// The return is immediate; NFT synchronization is scheduled separately.
    pub fn commit_sale(&mut self, id: U64, buyer: AccountId) -> serde_json::Value {
        require!(
            env::predecessor_account_id() == self.collection,
            "COLLECTION_ONLY"
        );
        if self.sale.as_ref().is_none_or(|sale| sale.id != id) {
            return self.sale_outcome(id);
        }
        let sale = self.sale.as_ref().unwrap();
        if sale.state != "Frozen" {
            return self.sale_outcome(id);
        }
        require!(
            env::block_timestamp() < sale.expires_at.0,
            "LISTING_EXPIRED"
        );
        require!(
            buyer != self.owner && buyer != env::current_account_id() && buyer != self.collection,
            "NEW_OWNER"
        );
        let consent = self
            .recipients
            .get(&buyer)
            .unwrap_or_else(|| env::panic_str("RECIPIENT_CONSENT_REQUIRED"));
        require!(
            consent.epoch == self.epoch
                && consent.expires_at > env::block_timestamp()
                && consent.key != self.public_key,
            "RECIPIENT_CONSENT_MISMATCH"
        );
        let key = consent.key.clone();
        self.recipients.remove(&buyer);
        self.owner = buyer.clone();
        self.public_key = key;
        self.epoch += 1;
        self.key_version += 1;
        self.revoke_inner();
        self.nonce = 0;
        self.sync_seq += 1;
        self.active = false;
        let sale = self.sale.as_mut().unwrap();
        sale.state = "Committed".into();
        sale.buyer = Some(buyer);
        event(
            "sale_control_committed",
            json!({"id":id,"owner_id":self.owner,"epoch":U64(self.epoch)}),
        );
        self.sync().detach();
        self.sale_outcome(id)
    }
    /// Linearizes abort against delayed commit. Timeouts alone never prove non-transmission.
    pub fn abort_sale(&mut self, id: U64) -> serde_json::Value {
        require!(
            env::predecessor_account_id() == self.collection,
            "COLLECTION_ONLY"
        );
        if let Some(sale) = self.sale.as_mut().filter(|sale| sale.id == id) {
            if sale.state == "Frozen" {
                sale.state = "Aborted".into();
            }
        }
        self.sale_outcome(id)
    }
    pub fn release_sale(&mut self, id: U64) -> bool {
        require!(
            env::predecessor_account_id() == self.collection,
            "COLLECTION_ONLY"
        );
        let Some(sale) = self.sale.as_ref().filter(|sale| sale.id == id) else {
            return self
                .last_sale
                .as_ref()
                .is_some_and(|sale| sale.id == id && sale.state == "Released");
        };
        require!(
            sale.state == "Committed" || sale.state == "Aborted",
            "SALE_NOT_TERMINAL"
        );
        require!(self.active && self.pending.is_none(), "SYNC_REQUIRED");
        let mut sale = self.sale.take().unwrap();
        sale.state = "Released".into();
        self.last_sale = Some(sale);
        true
    }
    #[private]
    pub fn on_listing_cancelled(&mut self, id: U64) -> bool {
        let cancelled = env::promise_result_checked(0, 256)
            .ok()
            .and_then(|b| serde_json::from_slice::<bool>(&b).ok())
            .unwrap_or(false);
        if cancelled
            && self
                .sale
                .as_ref()
                .is_some_and(|sale| sale.id == id && sale.state == "Frozen")
        {
            self.sale.as_mut().unwrap().state = "Aborted".into();
            return self.release_sale_local(id);
        }
        false
    }
}
impl Wallet {
    fn release_sale_local(&mut self, id: U64) -> bool {
        let mut sale = self.sale.take().unwrap();
        require!(sale.id == id, "SALE_ID");
        sale.state = "Released".into();
        self.last_sale = Some(sale);
        true
    }
    pub(crate) fn list_sale(
        &mut self,
        id: U64,
        price: U128,
        payment_token: AccountId,
        expires_at: U64,
        valuation_hash: Base64VecU8,
    ) -> Promise {
        if let Some(series) = &self.series {
            require!(
                self.deposits > 0 && expires_at.0 < series.terms.matures_at.0,
                "SALE_BEFORE_MATURITY_ONLY"
            );
        }
        require!(
            id.0 == self.sale_sequence + 1 && id.0 <= 16,
            "SALE_SEQUENCE_OR_STORAGE_BOUND"
        );
        require!(
            payment_token == self.asset && price.0 > 0,
            "SALE_PRICE_OR_TOKEN"
        );
        require!(
            expires_at.0 > env::block_timestamp() && expires_at.0 <= env::block_timestamp() + DAY,
            "SALE_EXPIRY"
        );
        let quote = self.sale_quote(price, expires_at);
        require!(
            serde_json::to_value(&valuation_hash).unwrap() == quote["valuation_hash"],
            "STALE_VALUATION"
        );
        self.sale_sequence = id.0;
        env::storage_write(&valuation_key(id), &env::block_timestamp().to_le_bytes());
        self.sale = Some(SaleLock {
            id,
            price,
            expires_at,
            valuation_hash: valuation_hash.clone(),
            state: "Frozen".into(),
            buyer: None,
        });
        event("sale_frozen", json!({"id":id,"price":price}));
        call(
            self.collection.clone(),
            "open_listing",
            json!({"id":id,"seller":self.owner,"price":price,"expires_at":expires_at,"valuation_hash":valuation_hash,"available":U128(self.available),"principal":U128(self.principal),"ownership_epoch":U64(self.epoch),"sync_seq":U64(self.sync_seq)}),
            0,
            35,
        )
    }
}

fn valuation_key(id: U64) -> Vec<u8> {
    let mut key = b"everkeep:sale-valuation:v1:".to_vec();
    key.extend_from_slice(&id.0.to_le_bytes());
    key
}
