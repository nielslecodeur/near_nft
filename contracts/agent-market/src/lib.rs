//! # Agent market: sell an AI agent with the NFT that carries it
//!
//! An agent on the agents contract (v2) lives on one NFT of any NEP-171
//! collection, with its profile, track record and, if its owner chose so, a
//! budget that follows the NFT (`budget_follows`). This market sells that NFT
//! for NEAR, and makes the promised budget part of the deal:
//!
//! * **List.** The seller calls `nft_approve` on the NFT contract with this
//!   market and `msg = {"price": "<yoctoNEAR>", "seat_id": "<v2 id>",
//!   "budget": "<base units>"}`. `budget` is what the buyer is promised: at
//!   least that much stays in the agent for them (USDC units for a Payer, yocto
//!   for a Buyer; `"0"` sells the agent without money).
//! * **Buy.** The buyer attaches exactly the price and repeats the price and
//!   budget they saw. The market then:
//!   1. reads the agent (`seat_for_nft`): it must be the listed seat, held by
//!      the seller, and, if a budget is promised, be paused and keep at least
//!      that much with `budget_follows` on. If not, the buyer is refunded and
//!      nothing moves;
//!   2. transfers the NFT to the buyer (with the seller's approval). If that
//!      fails, the buyer is refunded;
//!   3. reads the agent again. Once the NFT has left the seller, the agents
//!      contract no longer lets them withdraw a promised budget or take the
//!      promise back. If the budget is still there, **the seller is paid**.
//!      If the seller pulled it in between, **the buyer is refunded and keeps
//!      the NFT**.
//!
//!   The buyer then claims the agent on the agents contract (`claim_seat`) and
//!   receives the budget, its name and its record.
//! * No admin key, no fee. Refusals do not panic: they refund and emit an event.
//!
//! Events: NEP-297 `EVENT_JSON` with `standard: "agent_market"`: `listed`,
//! `delisted`, `sold`, `sale_refunded`.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, ext_contract, near, require,
};

#[cfg(test)]
mod tests;

/// Listings kept at once (storage is paid by the market).
pub const MAX_LISTINGS: u32 = 200;
/// Listings per seller at once.
pub const MAX_PER_SELLER: usize = 10;
/// Sales kept in the public history.
pub const HISTORY: usize = 30;
/// Largest `seat_for_nft` answer read.
const MAX_SEAT_RESULT: usize = 4_096;

const GAS_VIEW: Gas = Gas::from_tgas(10);
const GAS_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_POST: Gas = Gas::from_tgas(15);
const GAS_ON_TRANSFERRED: Gas = Gas::from_tgas(40);
const GAS_PRE: Gas = Gas::from_tgas(90);
/// What `buy` needs attached.
pub const GAS_BUY: Gas = Gas::from_tgas(150);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Listings,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub nft_contract: AccountId,
    pub token_id: String,
    pub seller: AccountId,
    pub approval_id: U64,
    /// yoctoNEAR.
    pub price: U128,
    /// The agent's seat on the agents contract.
    pub seat_id: U64,
    /// Budget promised to the buyer, in the seat's asset (base units).
    pub budget: U128,
    pub listed_at: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Sale {
    pub nft_contract: AccountId,
    pub token_id: String,
    pub seat_id: U64,
    pub seller: AccountId,
    pub buyer: AccountId,
    pub price: U128,
    pub budget: U128,
    pub at: U64,
}

/// What the seller writes in `nft_approve`'s `msg`.
#[near(serializers = [json])]
pub struct ListMsg {
    pub price: U128,
    pub seat_id: U64,
    #[serde(default)]
    pub budget: Option<U128>,
}

/// The fields of the agents contract's `SeatView` this market reads.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SeatLite {
    pub seat_id: U64,
    pub owner: AccountId,
    pub paused: bool,
    pub balance: U128,
    pub budget_follows: bool,
    pub held_for_next_owner: bool,
}

#[ext_contract(ext_agents)]
#[allow(dead_code)]
trait ExtAgents {
    fn seat_for_nft(&self, nft_contract: AccountId, token_id: String) -> Option<SeatLite>;
}

#[ext_contract(ext_nft)]
#[allow(dead_code)]
trait ExtNft {
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: String, approval_id: Option<u64>, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// The agents contract (v2), fixed at init.
    agents: AccountId,
    listings: IterableMap<String, Listing>,
    history: Vec<Sale>,
    sold: u64,
    refunded: u64,
    volume: u128,
}

fn key(nft_contract: &AccountId, token_id: &str) -> String {
    format!("{nft_contract}:{token_id}")
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "agent_market", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

/// The agent read by the previous promise (None if it failed or there is no seat).
fn seat_result() -> Option<SeatLite> {
    let bytes = env::promise_result_checked(0, MAX_SEAT_RESULT).ok()?;
    serde_json::from_slice::<Option<SeatLite>>(&bytes).ok().flatten()
}

/// Why the agent does not match the listing, if it does not. `buyer` is set
/// after the transfer (step 3), `None` before it (step 1).
pub fn mismatch(seat: Option<&SeatLite>, l: &Listing, buyer: Option<&AccountId>) -> Option<&'static str> {
    let Some(s) = seat else { return Some("the NFT carries no agent") };
    if s.seat_id != l.seat_id {
        return Some("the NFT carries another agent");
    }
    match buyer {
        // The buyer already claimed it: what is in it is theirs.
        Some(b) if &s.owner == b => return None,
        Some(_) => {}
        None => {
            if s.owner != l.seller || s.held_for_next_owner {
                return Some("the seller does not hold this agent");
            }
            // A running agent could spend the promised budget before the NFT moves.
            if l.budget.0 > 0 && !s.paused {
                return Some("the agent must be paused while its budget is for sale");
            }
        }
    }
    if l.budget.0 > 0 && !s.budget_follows {
        return Some("the budget no longer goes to the buyer");
    }
    if s.balance.0 < l.budget.0 {
        return Some("the agent holds less than the promised budget");
    }
    None
}

#[near]
impl Contract {
    #[init]
    pub fn new(agents: AccountId) -> Self {
        Self { agents, listings: IterableMap::new(StorageKey::Listings), history: Vec::new(), sold: 0, refunded: 0, volume: 0 }
    }

    /// NEP-178: called by the NFT contract when its owner approves this market.
    /// Lists (or re-prices) the NFT; `msg` is a [`ListMsg`].
    pub fn nft_on_approve(&mut self, token_id: String, owner_id: AccountId, approval_id: u64, msg: String) -> String {
        let nft_contract = env::predecessor_account_id();
        require!(env::signer_account_id() == owner_id, "Only the NFT's owner can list it");
        let m: ListMsg = serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("msg must be {\"price\", \"seat_id\", \"budget\"}"));
        require!(m.price.0 > 0, "The price must be positive");
        let k = key(&nft_contract, &token_id);
        if !self.listings.contains_key(&k) {
            require!(self.listings.len() < MAX_LISTINGS, "The market is full");
            let mine = self.listings.values().filter(|l| l.seller == owner_id).count();
            require!(mine < MAX_PER_SELLER, "At most 10 listings per seller");
        }
        let listing = Listing {
            nft_contract,
            token_id,
            seller: owner_id,
            approval_id: U64(approval_id),
            price: m.price,
            seat_id: m.seat_id,
            budget: m.budget.unwrap_or(U128(0)),
            listed_at: U64(env::block_timestamp()),
        };
        emit("listed", json!(listing));
        self.listings.insert(k, listing);
        "listed".into()
    }

    /// Takes a listing down. Seller only, 1 yoctoNEAR (also revoke the approval on the NFT contract).
    #[payable]
    pub fn delist(&mut self, nft_contract: AccountId, token_id: String) {
        assert_one_yocto();
        let k = key(&nft_contract, &token_id);
        let l = self.listings.get(&k).cloned().unwrap_or_else(|| env::panic_str("Not listed"));
        require!(l.seller == env::predecessor_account_id(), "Only the seller can take it down");
        self.listings.remove(&k);
        emit("delisted", json!({"nft_contract": nft_contract, "token_id": token_id, "seller": l.seller}));
    }

    /// Buys a listed agent. Attach exactly `price` and 150 TGas; `price` and `budget`
    /// must be what you saw, so a re-listing cannot change the deal under you.
    #[payable]
    pub fn buy(&mut self, nft_contract: AccountId, token_id: String, price: U128, budget: U128) -> Promise {
        let buyer = env::predecessor_account_id();
        let k = key(&nft_contract, &token_id);
        let l = self.listings.get(&k).cloned().unwrap_or_else(|| env::panic_str("Not listed"));
        require!(buyer != l.seller, "You are the seller");
        require!(l.price == price && l.budget == budget, "The listing changed: check its price and budget again");
        require!(env::attached_deposit().as_yoctonear() == l.price.0, "Attach exactly the price");
        require!(env::prepaid_gas() >= GAS_BUY, "Attach 150 TGas");
        // Taken off the market now, so two buyers cannot race for it.
        self.listings.remove(&k);
        ext_agents::ext(self.agents.clone())
            .with_static_gas(GAS_VIEW)
            .seat_for_nft(nft_contract, token_id)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_PRE).on_pre_checked(l, buyer))
    }

    /// Step 1 done: the agent is as listed, so the NFT moves.
    #[private]
    pub fn on_pre_checked(&mut self, listing: Listing, buyer: AccountId) -> PromiseOrValue<bool> {
        if let Some(why) = mismatch(seat_result().as_ref(), &listing, None) {
            return PromiseOrValue::Value(self.refund(&listing, &buyer, why, false));
        }
        PromiseOrValue::Promise(
            ext_nft::ext(listing.nft_contract.clone())
                .with_static_gas(GAS_TRANSFER)
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .nft_transfer(buyer.clone(), listing.token_id.clone(), Some(listing.approval_id.0), Some("agent sale".into()))
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_TRANSFERRED).on_transferred(listing, buyer)),
        )
    }

    /// Step 2 done: if the NFT moved, read the agent again.
    #[private]
    pub fn on_transferred(&mut self, listing: Listing, buyer: AccountId) -> PromiseOrValue<bool> {
        if env::promise_result_checked(0, 0).is_err() {
            return PromiseOrValue::Value(self.refund(&listing, &buyer, "the NFT could not be transferred", false));
        }
        PromiseOrValue::Promise(
            ext_agents::ext(self.agents.clone())
                .with_static_gas(GAS_VIEW)
                .seat_for_nft(listing.nft_contract.clone(), listing.token_id.clone())
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_POST).on_post_checked(listing, buyer)),
        )
    }

    /// Step 3: the budget stayed for the buyer, so the seller is paid; otherwise the buyer is refunded.
    #[private]
    pub fn on_post_checked(&mut self, listing: Listing, buyer: AccountId) -> bool {
        if let Some(why) = mismatch(seat_result().as_ref(), &listing, Some(&buyer)) {
            return self.refund(&listing, &buyer, why, true);
        }
        Promise::new(listing.seller.clone()).transfer(NearToken::from_yoctonear(listing.price.0)).detach();
        let sale = Sale {
            nft_contract: listing.nft_contract,
            token_id: listing.token_id,
            seat_id: listing.seat_id,
            seller: listing.seller,
            buyer,
            price: listing.price,
            budget: listing.budget,
            at: U64(env::block_timestamp()),
        };
        emit("sold", json!(sale));
        self.sold += 1;
        self.volume += sale.price.0;
        if self.history.len() >= HISTORY {
            self.history.remove(0);
        }
        self.history.push(sale);
        true
    }

    fn refund(&mut self, l: &Listing, buyer: &AccountId, why: &str, buyer_keeps_nft: bool) -> bool {
        Promise::new(buyer.clone()).transfer(NearToken::from_yoctonear(l.price.0)).detach();
        self.refunded += 1;
        emit(
            "sale_refunded",
            json!({"nft_contract": l.nft_contract, "token_id": l.token_id, "seat_id": l.seat_id, "seller": l.seller,
                   "buyer": buyer, "price": l.price, "reason": why, "buyer_keeps_nft": buyer_keeps_nft}),
        );
        false
    }

    // ---- views ----

    pub fn listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        self.listings
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    pub fn listing(&self, nft_contract: AccountId, token_id: String) -> Option<Listing> {
        self.listings.get(&key(&nft_contract, &token_id)).cloned()
    }

    /// Last sales, newest first.
    pub fn sales(&self) -> Vec<Sale> {
        self.history.iter().rev().cloned().collect()
    }

    pub fn stats(&self) -> serde_json::Value {
        json!({"listed": self.listings.len(), "sold": self.sold, "refunded": self.refunded, "volume": U128(self.volume)})
    }

    pub fn config(&self) -> serde_json::Value {
        json!({"version": "1.0.0", "agents": self.agents, "max_listings": MAX_LISTINGS, "max_per_seller": MAX_PER_SELLER,
               "buy_gas_tgas": GAS_BUY.as_tgas(), "fee": "0"})
    }
}
