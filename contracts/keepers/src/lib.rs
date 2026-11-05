//! # Everkeep Keepers — NFTs that do something
//!
//! Each Keeper is a NEP-171 token that behaves like a small account:
//!
//! * **Holds funds** — every token has its own NEAR balance, held by this contract.
//!   Anyone can top it up ([`Contract::deposit`]); only the current owner can
//!   withdraw ([`Contract::withdraw`]).
//! * **Earns its own royalties** — every sale through the built-in market
//!   ([`Contract::buy`]) credits [`ROYALTY_BPS`] of the price to the *token's*
//!   balance. The creator only receives the primary mint payment.
//! * **Evolves** — the tier (matte → brushed → holographic → animated) is a pure
//!   function of the token's balance ([`tier_for`]). The on-chain SVG art changes with it.
//! * **Grants access** — [`Contract::is_holder`] is the credential checked by the
//!   holder-only `/vault` page.
//!
//! Design, storage costs and threat model: `docs/keepers-contract.md`.

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, near, require,
};
use std::collections::HashMap;

pub mod art;
#[cfg(test)]
mod tests;

// ---------------------------------------------------------------------------
// Economic constants. They are compile-time constants on purpose: nobody,
// including the deployer, can change the royalty or the tiers after deploy.
// ---------------------------------------------------------------------------

/// 1 NEAR in yoctoNEAR.
pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Primary sale price. Sent to the creator on mint — the creator's only income.
pub const MINT_PRICE: u128 = ONE_NEAR;
/// Kept by the contract at mint to pay for this token's storage (~3x headroom).
pub const STORAGE_RESERVE: u128 = ONE_NEAR / 50; // 0.02 NEAR
/// Royalty on every built-in market sale, in basis points: 1000 = 10%.
/// It is credited to the **token's own balance**, never to the creator.
pub const ROYALTY_BPS: u128 = 1_000;
pub const BPS_DENOMINATOR: u128 = 10_000;
/// Minimum listing price, so a sale always produces a non-zero royalty.
pub const MIN_LIST_PRICE: u128 = ONE_NEAR / 10; // 0.1 NEAR
pub const MAX_SUPPLY: u64 = 1_000;
/// Balance thresholds for tiers 1, 2 and 3 (tier 0 is below the first).
/// Low values so the demo works with testnet faucet amounts.
pub const TIER_THRESHOLDS: [u128; 3] = [ONE_NEAR / 2, 2 * ONE_NEAR, 10 * ONE_NEAR];
pub const TIER_NAMES: [&str; 4] = ["matte", "brushed", "holographic", "animated"];
/// Upper bound on token ids scanned by paginated card views.
const MAX_PAGE: u64 = 50;
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(10);

/// Tier of a card, computed only from its on-chain balance.
pub fn tier_for(balance: u128) -> u8 {
    TIER_THRESHOLDS.iter().filter(|t| balance >= **t).count() as u8
}

/// Balance needed to reach the next tier, or `None` at the top tier.
pub fn next_tier_at(balance: u128) -> Option<u128> {
    TIER_THRESHOLDS.iter().copied().find(|t| balance < *t)
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Tokens,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    Cards,
    PendingPayouts,
}

/// Per-token state that makes the NFT "do something".
#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Card {
    pub dna: u32,
    /// yoctoNEAR held for this token.
    pub balance: u128,
    pub minted_at: u64,
    /// Reset on every owner change.
    pub held_since: u64,
    /// Completed built-in market sales.
    pub trades: u32,
    pub royalties_earned: u128,
    pub deposited_total: u128,
    pub withdrawn_total: u128,
    /// `Some(price)` while listed on the built-in market.
    pub list_price: Option<u128>,
}

/// JSON view of a card, returned by every card view and in `metadata.extra`.
#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct CardView {
    pub token_id: TokenId,
    pub owner_id: AccountId,
    pub dna: u32,
    pub balance: U128,
    pub tier: u8,
    pub tier_name: String,
    pub next_tier_at: Option<U128>,
    pub trades: u32,
    pub minted_at: U64,
    pub held_since: U64,
    pub royalties_earned: U128,
    pub deposited_total: U128,
    pub withdrawn_total: U128,
    pub list_price: Option<U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    creator: AccountId,
    cards: LookupMap<TokenId, Card>,
    next_id: u64,
    /// Σ card.balance — the NEAR this contract owes to its tokens.
    total_card_balances: u128,
    /// Seller proceeds whose transfer failed, claimable with `claim_payout`.
    pending_payouts: LookupMap<AccountId, u128>,
    total_pending_payouts: u128,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "keepers", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn yocto(amount: u128) -> NearToken {
    NearToken::from_yoctonear(amount)
}

#[near]
impl Contract {
    #[init]
    pub fn new(creator: AccountId, base_uri: Option<String>) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Everkeep Keepers".to_string(),
            symbol: "KEEPER".to_string(),
            icon: Some(art::ICON.to_string()),
            base_uri,
            reference: None,
            reference_hash: None,
        };
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::Tokens,
                creator.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            creator,
            cards: LookupMap::new(StorageKey::Cards),
            next_id: 0,
            total_card_balances: 0,
            pending_payouts: LookupMap::new(StorageKey::PendingPayouts),
            total_pending_payouts: 0,
        }
    }

    // -----------------------------------------------------------------------
    // Mint (primary sale)
    // -----------------------------------------------------------------------

    /// Mints the next Keeper to the caller.
    /// Attach at least `MINT_PRICE + STORAGE_RESERVE` (1.02 NEAR); the excess is refunded.
    /// `MINT_PRICE` goes to the creator. The card starts with a zero balance (tier: matte).
    #[payable]
    pub fn mint(&mut self) -> Token {
        let deposit = env::attached_deposit().as_yoctonear();
        let cost = MINT_PRICE + STORAGE_RESERVE;
        require!(
            deposit >= cost,
            "Attach at least 1.02 NEAR (mint price + storage)"
        );
        require!(self.next_id < MAX_SUPPLY, "Sold out");

        self.next_id += 1;
        let token_id = self.next_id.to_string();
        let owner_id = env::predecessor_account_id();
        let now = env::block_timestamp();
        let mut seed = env::random_seed();
        seed.extend_from_slice(token_id.as_bytes());
        let hash = env::sha256(&seed);
        let dna = u32::from_le_bytes([hash[0], hash[1], hash[2], hash[3]]);

        let storage_before = env::storage_usage();
        let token_metadata = TokenMetadata {
            title: Some(format!("Keeper #{token_id}")),
            description: None,
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some((now / 1_000_000).to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };
        // No automatic refund: payment is split explicitly below.
        let token = self.tokens.internal_mint_with_refund(
            token_id.clone(),
            owner_id.clone(),
            Some(token_metadata),
            None,
        );
        self.cards.insert(
            token_id.clone(),
            Card {
                dna,
                balance: 0,
                minted_at: now,
                held_since: now,
                trades: 0,
                royalties_earned: 0,
                deposited_total: 0,
                withdrawn_total: 0,
                list_price: None,
            },
        );
        self.cards.flush();
        let storage_cost = (env::storage_usage() - storage_before) as u128
            * env::storage_byte_cost().as_yoctonear();
        require!(storage_cost <= STORAGE_RESERVE, "Storage reserve exceeded");

        NftMint {
            owner_id: &owner_id,
            token_ids: &[&token_id],
            memo: None,
        }
        .emit();
        Promise::new(self.creator.clone())
            .transfer(yocto(MINT_PRICE))
            .detach();
        if deposit > cost {
            Promise::new(owner_id)
                .transfer(yocto(deposit - cost))
                .detach();
        }
        self.with_card(token)
    }

    // -----------------------------------------------------------------------
    // A. The card holds funds
    // -----------------------------------------------------------------------

    /// Adds the attached NEAR to the token's balance. Anyone can top up any card.
    #[payable]
    pub fn deposit(&mut self, token_id: TokenId) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach the NEAR to deposit");
        let mut card = self.card_state(&token_id);
        let before = card.balance;
        card.balance += amount;
        card.deposited_total += amount;
        self.total_card_balances += amount;
        emit(
            "card_deposit",
            json!({"token_id": token_id, "from": env::predecessor_account_id(),
                   "amount": U128(amount), "balance": U128(card.balance)}),
        );
        Self::emit_tier_change(&token_id, before, card.balance);
        let balance = card.balance;
        self.cards.insert(token_id, card);
        U128(balance)
    }

    /// Sends `amount` (default: the whole balance) from the token to its current owner.
    /// Owner only, exactly 1 yoctoNEAR attached (forces a full-access-key confirmation).
    /// Refused while the card is listed, so a buyer always gets the balance they saw.
    /// Checks → effects → interaction: the balance is debited before the transfer;
    /// if the transfer fails, [`Contract::on_withdraw`] re-credits the **card**.
    #[payable]
    pub fn withdraw(&mut self, token_id: TokenId, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let owner_id = self.owner_of(&token_id);
        require!(
            env::predecessor_account_id() == owner_id,
            "Only the owner can withdraw"
        );
        let mut card = self.card_state(&token_id);
        require!(
            card.list_price.is_none(),
            "Delist the card before withdrawing"
        );
        let amount = amount.map(|a| a.0).unwrap_or(card.balance);
        require!(amount > 0 && amount <= card.balance, "Invalid amount");

        let before = card.balance;
        card.balance -= amount;
        card.withdrawn_total += amount;
        self.total_card_balances -= amount;
        emit(
            "card_withdraw",
            json!({"token_id": token_id, "owner_id": owner_id,
                   "amount": U128(amount), "balance": U128(card.balance)}),
        );
        Self::emit_tier_change(&token_id, before, card.balance);
        self.cards.insert(token_id.clone(), card);

        Promise::new(owner_id).transfer(yocto(amount)).then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_withdraw(token_id, U128(amount)),
        )
    }

    /// Withdraw callback. On a failed transfer the funds go back to the card —
    /// not to the caller — because ownership may have changed in the meantime.
    #[private]
    pub fn on_withdraw(&mut self, token_id: TokenId, amount: U128) -> bool {
        if env::promise_result_checked(0, 0).is_ok() {
            return true;
        }
        let mut card = self.card_state(&token_id);
        let before = card.balance;
        card.balance += amount.0;
        card.withdrawn_total -= amount.0;
        self.total_card_balances += amount.0;
        emit(
            "card_withdraw_refunded",
            json!({"token_id": token_id, "amount": amount, "balance": U128(card.balance)}),
        );
        Self::emit_tier_change(&token_id, before, card.balance);
        self.cards.insert(token_id, card);
        false
    }

    // -----------------------------------------------------------------------
    // B. Built-in market: the card earns its own royalties
    // -----------------------------------------------------------------------

    /// Lists the card for `price` yoctoNEAR. Owner only, exactly 1 yoctoNEAR attached.
    #[payable]
    pub fn list(&mut self, token_id: TokenId, price: U128) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_of(&token_id),
            "Only the owner can list"
        );
        require!(price.0 >= MIN_LIST_PRICE, "Minimum price is 0.1 NEAR");
        let mut card = self.card_state(&token_id);
        card.list_price = Some(price.0);
        self.cards.insert(token_id.clone(), card);
        emit("card_listed", json!({"token_id": token_id, "price": price}));
    }

    /// Removes the listing. Owner only, exactly 1 yoctoNEAR attached.
    #[payable]
    pub fn delist(&mut self, token_id: TokenId) {
        assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner_of(&token_id),
            "Only the owner can delist"
        );
        let mut card = self.card_state(&token_id);
        let price = card.list_price.take();
        require!(price.is_some(), "Not listed");
        self.cards.insert(token_id.clone(), card);
        emit(
            "card_delisted",
            json!({"token_id": token_id, "price": price.map(U128)}),
        );
    }

    /// Buys a listed card. Attach exactly the list price.
    /// `min_card_balance` is the balance the buyer saw: the purchase fails if the card holds less.
    /// The royalty (`ROYALTY_BPS`) is credited to the card, the rest is paid to the seller.
    #[payable]
    pub fn buy(&mut self, token_id: TokenId, min_card_balance: U128) -> Promise {
        let buyer = env::predecessor_account_id();
        let seller = self.owner_of(&token_id);
        require!(buyer != seller, "You already own this card");
        let mut card = self.card_state(&token_id);
        let price = card
            .list_price
            .unwrap_or_else(|| env::panic_str("Not listed"));
        require!(
            env::attached_deposit().as_yoctonear() == price,
            "Attach exactly the list price"
        );
        require!(
            card.balance >= min_card_balance.0,
            "Card balance is lower than expected"
        );

        let royalty = price * ROYALTY_BPS / BPS_DENOMINATOR;
        let proceeds = price - royalty;
        let before = card.balance;
        card.balance += royalty;
        card.royalties_earned += royalty;
        card.trades += 1;
        card.list_price = None;
        card.held_since = env::block_timestamp();
        self.total_card_balances += royalty;
        let balance = card.balance;
        self.cards.insert(token_id.clone(), card);

        // Moves the token, clears every approval and emits the standard nft_transfer event.
        self.tokens
            .internal_transfer(&seller, &buyer, &token_id, None, Some("keepers:buy".into()));
        emit(
            "card_sold",
            json!({"token_id": token_id, "seller": seller, "buyer": buyer, "price": U128(price),
                   "royalty": U128(royalty), "seller_proceeds": U128(proceeds)}),
        );
        emit(
            "card_royalty",
            json!({"token_id": token_id, "amount": U128(royalty), "balance": U128(balance)}),
        );
        Self::emit_tier_change(&token_id, before, balance);

        self.pay(seller, proceeds)
    }

    /// Retries a seller payout whose transfer failed.
    pub fn claim_payout(&mut self) -> Promise {
        let account_id = env::predecessor_account_id();
        let amount = self
            .pending_payouts
            .remove(&account_id)
            .unwrap_or_else(|| env::panic_str("Nothing to claim"));
        self.total_pending_payouts -= amount;
        emit(
            "payout_claimed",
            json!({"account_id": account_id, "amount": U128(amount)}),
        );
        self.pay(account_id, amount)
    }

    /// Payout callback: a failed transfer is kept as a claimable pending payout.
    #[private]
    pub fn on_payout(&mut self, account_id: AccountId, amount: U128) -> bool {
        if env::promise_result_checked(0, 0).is_ok() {
            return true;
        }
        let pending = self.pending_payouts.get(&account_id).copied().unwrap_or(0);
        self.pending_payouts
            .insert(account_id.clone(), pending + amount.0);
        self.total_pending_payouts += amount.0;
        emit(
            "payout_pending",
            json!({"account_id": account_id, "amount": amount}),
        );
        false
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn card(&self, token_id: TokenId) -> Option<CardView> {
        let owner_id = self.tokens.owner_by_id.get(&token_id)?;
        let card = self.cards.get(&token_id)?;
        Some(Self::view_of(token_id, owner_id, card))
    }

    /// Cards by token id, starting after `from_index` (0 = from the first).
    pub fn cards(&self, from_index: Option<U64>, limit: Option<u64>) -> Vec<CardView> {
        let start = from_index.map(|i| i.0).unwrap_or(0);
        let end = (start + limit.unwrap_or(MAX_PAGE).min(MAX_PAGE)).min(self.next_id);
        (start + 1..=end)
            .filter_map(|id| self.card(id.to_string()))
            .collect()
    }

    pub fn cards_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<CardView> {
        self.tokens
            .nft_tokens_for_owner(
                account_id,
                from_index,
                Some(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE)),
            )
            .into_iter()
            .filter_map(|t| self.card(t.token_id))
            .collect()
    }

    /// Listed cards among token ids `from_index + 1 ..= from_index + limit`.
    pub fn listings(&self, from_index: Option<U64>, limit: Option<u64>) -> Vec<CardView> {
        self.cards(from_index, limit)
            .into_iter()
            .filter(|c| c.list_price.is_some())
            .collect()
    }

    /// The access credential: true if `account_id` currently owns at least one Keeper.
    pub fn is_holder(&self, account_id: AccountId) -> bool {
        self.tokens
            .tokens_per_owner
            .as_ref()
            .and_then(|by_owner| by_owner.get(&account_id))
            .is_some_and(|set| !set.is_empty())
    }

    pub fn tier_of(&self, token_id: TokenId) -> u8 {
        tier_for(self.card_state(&token_id).balance)
    }

    pub fn pending_payout(&self, account_id: AccountId) -> U128 {
        U128(self.pending_payouts.get(&account_id).copied().unwrap_or(0))
    }

    pub fn config(&self) -> serde_json::Value {
        json!({
            "creator": self.creator,
            "mint_price": U128(MINT_PRICE),
            "storage_reserve": U128(STORAGE_RESERVE),
            "royalty_bps": ROYALTY_BPS as u64,
            "min_list_price": U128(MIN_LIST_PRICE),
            "max_supply": MAX_SUPPLY,
            "tier_names": TIER_NAMES,
            "tier_thresholds": TIER_THRESHOLDS.map(U128),
        })
    }

    /// Solvency check: `account_balance >= total_card_balances + total_pending_payouts + storage_cost`.
    pub fn stats(&self) -> serde_json::Value {
        let storage_cost = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
        json!({
            "minted": self.next_id,
            "total_card_balances": U128(self.total_card_balances),
            "total_pending_payouts": U128(self.total_pending_payouts),
            "storage_cost": U128(storage_cost),
            "account_balance": U128(env::account_balance().as_yoctonear()),
        })
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    fn owner_of(&self, token_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(token_id)
            .unwrap_or_else(|| env::panic_str("Unknown token"))
    }

    fn card_state(&self, token_id: &TokenId) -> Card {
        self.cards
            .get(token_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Unknown token"))
    }

    fn pay(&mut self, account_id: AccountId, amount: u128) -> Promise {
        Promise::new(account_id.clone())
            .transfer(yocto(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_payout(account_id, U128(amount)),
            )
    }

    /// Called after every ownership change outside `buy`: a transfer cancels the listing
    /// and restarts the holding clock.
    fn on_owner_change(&mut self, token_id: &TokenId) {
        let mut card = self.card_state(token_id);
        if let Some(price) = card.list_price.take() {
            emit(
                "card_delisted",
                json!({"token_id": token_id, "price": U128(price)}),
            );
        }
        card.held_since = env::block_timestamp();
        self.cards.insert(token_id.clone(), card);
    }

    fn emit_tier_change(token_id: &TokenId, before: u128, after: u128) {
        let (from, to) = (tier_for(before), tier_for(after));
        if from != to {
            emit(
                "card_tier",
                json!({"token_id": token_id, "from": TIER_NAMES[from as usize],
                       "to": TIER_NAMES[to as usize]}),
            );
        }
    }

    fn view_of(token_id: TokenId, owner_id: AccountId, card: &Card) -> CardView {
        let tier = tier_for(card.balance);
        CardView {
            token_id,
            owner_id,
            dna: card.dna,
            balance: U128(card.balance),
            tier,
            tier_name: TIER_NAMES[tier as usize].to_string(),
            next_tier_at: next_tier_at(card.balance).map(U128),
            trades: card.trades,
            minted_at: U64(card.minted_at),
            held_since: U64(card.held_since),
            royalties_earned: U128(card.royalties_earned),
            deposited_total: U128(card.deposited_total),
            withdrawn_total: U128(card.withdrawn_total),
            list_price: card.list_price.map(U128),
        }
    }

    /// Adds the dynamic part of NEP-177 metadata: tier in the title, on-chain SVG
    /// media, and the full card state as JSON in `extra`.
    fn with_card(&self, mut token: Token) -> Token {
        let Some(card) = self.cards.get(&token.token_id) else {
            return token;
        };
        let view = Self::view_of(token.token_id.clone(), token.owner_id.clone(), card);
        if let Some(m) = token.metadata.as_mut() {
            m.title = Some(format!(
                "Keeper #{} · {}",
                token.token_id,
                art::TIER_LABELS[view.tier as usize]
            ));
            m.description = Some(
                "A Keeper holds its own NEAR balance, earns 10% of every resale and evolves \
                 from matte to animated as its balance grows."
                    .into(),
            );
            m.media = Some(art::svg_data_uri(card.dna, view.tier));
            m.extra = Some(serde_json::to_string(&view).unwrap_or_default());
        }
        token
    }
}

// ---------------------------------------------------------------------------
// NEP-171 core, delegating to near-contract-standards. Transfers also clear the
// listing and restart the holding clock.
// ---------------------------------------------------------------------------

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens
            .nft_transfer(receiver_id, token_id.clone(), approval_id, memo);
        self.on_owner_change(&token_id);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        let result =
            self.tokens
                .nft_transfer_call(receiver_id, token_id.clone(), approval_id, memo, msg);
        self.on_owner_change(&token_id);
        result
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id).map(|t| self.with_card(t))
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let kept = self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id.clone(),
            approved_account_ids,
        );
        if !kept {
            // The receiver returned the token: the previous owner holds it again.
            self.on_owner_change(&token_id);
        }
        kept
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens
            .nft_tokens(from_index, Some(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE)))
            .into_iter()
            .map(|t| self.with_card(t))
            .collect()
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(
                account_id,
                from_index,
                Some(limit.unwrap_or(MAX_PAGE).min(MAX_PAGE)),
            )
            .into_iter()
            .map(|t| self.with_card(t))
            .collect()
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}
