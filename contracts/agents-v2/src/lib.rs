//! # Agent seats: give an AI a card, not your wallet
//!
//! A **seat** binds a task agent to one NFT of any NEP-171 collection,
//! `(nft_contract, token_id)`. The NFT never moves; it stays in its owner's
//! wallet. Each seat holds a budget, in NEAR for a **Buyer** or in USDC for a
//! **Payer**, and a policy that this contract enforces on every action.
//!
//! * **Access once.** The owner adds a function-call key to their own account,
//!   limited to this contract, and registers it on the seat with
//!   [`Contract::set_agent_key`]. The agent then signs `agent_pay` /
//!   `agent_buy` with that key, with no further wallet signature.
//! * **The agent key cannot take the money.** Every owner method (withdraw,
//!   policy, key, resume, close) requires 1 yoctoNEAR, and the protocol forbids
//!   function-call keys from attaching a deposit. The agent key can only act
//!   within the policy, or `pause` the seat.
//! * **The NFT is the access right.** Every action first asks the NFT contract
//!   who owns the token. If it changed hands, the action is refused, the seat
//!   is reset, and the remaining budget is set aside for the old owner (the
//!   funder keeps their money). The new owner takes the seat with
//!   [`Contract::claim_seat`].
//! * **Everything is logged.** Refusals do not panic: they are written to the
//!   seat's log (last [`LOG_SIZE`] entries) and emitted as events.
//!
//! ## v2
//!
//! * **The agent's identity follows the NFT.** A [`Profile`] (name, role, tool,
//!   avatar, manifest link) and the track record (actions done, blocked, spent,
//!   number of owners) stay on the seat when the NFT changes hands.
//! * **Refusal floods cannot erase the history.** Identical refusals in a row
//!   merge into one entry (`times`), and refusals never take more than
//!   [`MAX_REFUSED_KEPT`] of the [`LOG_SIZE`] entries.
//! * **Optional: the budget follows the NFT.** With
//!   [`Contract::set_budget_follows`], the seller leaves the budget to the next
//!   owner. While it is on, withdrawing (or turning it off) first proves on chain
//!   that the caller still owns the NFT, so a promised budget cannot be pulled
//!   after a sale.
//!
//! Design and threat model: `docs/agents-design.md`.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    PublicKey, assert_one_yocto, env, ext_contract, near, require,
};

#[cfg(test)]
mod tests;

/// 1 NEAR in yoctoNEAR.
pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Storage deposit per seat (seat, policy and a full log), refunded on close.
pub const SEAT_STORAGE: u128 = ONE_NEAR / 10;
/// Entries kept in each seat's log (a ring buffer).
pub const LOG_SIZE: usize = 50;
/// Refusals kept in a log at most, so a flood cannot push out the rest.
pub const MAX_REFUSED_KEPT: usize = 20;
/// Profile limits (characters; links in bytes). Sized so a full seat still fits
/// in [`SEAT_STORAGE`].
pub const PROFILE_NAME_LEN: usize = 32;
pub const PROFILE_ROLE_LEN: usize = 24;
pub const PROFILE_TOOL_LEN: usize = 24;
pub const PROFILE_LINK_LEN: usize = 160;
/// Payees a Payer policy may list.
pub const MAX_PAYEES: usize = 10;
/// Seats one account may hold (keeps `seats_for_owner` bounded).
pub const MAX_SEATS_PER_OWNER: usize = 20;
/// Length kept from memos and failure reasons in the log.
const DETAIL_LEN: usize = 48;
const NS_PER_DAY: u64 = 86_400_000_000_000;
/// Largest `nft_token` answer read back (metadata can be large).
const MAX_NFT_RESULT: u64 = 16_384;

const GAS_NFT_TOKEN: Gas = Gas::from_tgas(10);
const GAS_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_BUY: Gas = Gas::from_tgas(60);
const GAS_NFT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_SMALL_CALLBACK: Gas = Gas::from_tgas(10);
/// Gas reserved for the ownership callback of a payment (transfer + its callback).
const GAS_PAY_CHECKED: Gas = Gas::from_tgas(45);
/// Gas reserved for the ownership callback of a purchase (buy + delivery chain).
const GAS_BUY_CHECKED: Gas = Gas::from_tgas(150);
/// Gas reserved for `on_bought` (delivery + its callback).
const GAS_ON_BOUGHT: Gas = Gas::from_tgas(50);
/// Gas reserved for the ownership callback of create / claim.
const GAS_SEAT_CHECKED: Gas = Gas::from_tgas(20);
/// Gas reserved for an owner action that must prove NFT ownership first
/// (withdraw with the budget promised to the next owner: transfer + its callback).
const GAS_OWNER_CHECKED: Gas = Gas::from_tgas(40);

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Seats,
    SeatByNft,
    SeatsByOwner,
    Refunds,
}

/// What the agent of a seat does. Fixed at creation.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    /// Buys NFTs on a Keepers-style market (`buy(token_id, listing_id)`), pays in NEAR.
    Buyer,
    /// Pays allowlisted accounts in USDC.
    Payer,
}

/// The limits the contract enforces on every agent action.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    /// Largest single action, in the seat's asset (yoctoNEAR or USDC units).
    pub per_tx_max: U128,
    /// Largest total per UTC day, in the seat's asset.
    pub per_day_max: U128,
    /// Payer: who may be paid (at most [`MAX_PAYEES`]). Empty for a Buyer.
    pub payees: Vec<AccountId>,
    /// Buyer: the market it may buy from. `None` for a Payer.
    pub market: Option<AccountId>,
}

/// Who the agent is. Set by the seat's owner; it stays with the NFT.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Profile {
    /// 1 to [`PROFILE_NAME_LEN`] characters.
    pub name: String,
    /// What it does (collector, allowance, ...), at most [`PROFILE_ROLE_LEN`].
    pub role: String,
    /// What runs it (claude-code, codex, runner, ...), at most [`PROFILE_TOOL_LEN`].
    pub tool: Option<String>,
    /// Image link, `https://`, at most [`PROFILE_LINK_LEN`] bytes.
    pub avatar: Option<String>,
    /// Link to a description of its brain (prompt, model, MCP server), `https://`.
    pub manifest: Option<String>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct LogEntry {
    pub seq: u64,
    pub at: u64,
    pub action: String,
    /// "done", "refused", "failed" or "info".
    pub status: String,
    pub amount: u128,
    pub counterparty: Option<AccountId>,
    pub detail: String,
    /// Identical refusals in a row, merged (1 otherwise).
    pub times: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Seat {
    pub nft_contract: AccountId,
    pub token_id: String,
    pub kind: Kind,
    /// The funder: created or claimed the seat. Checked against the NFT owner.
    pub owner: AccountId,
    /// Who paid the storage deposit; refunded on close.
    pub storage_payer: AccountId,
    pub agent_key: Option<PublicKey>,
    pub paused: bool,
    pub policy: Option<Policy>,
    /// Budget in the seat's asset.
    pub balance: u128,
    /// Actions waiting for a callback. A seat cannot close while > 0.
    pub in_flight: u32,
    /// (UTC day, amount spent that day).
    pub spent_day: (u64, u128),
    pub spent_total: u128,
    pub done: u32,
    pub refused: u32,
    pub failed: u32,
    pub created_at: u64,
    pub log: Vec<LogEntry>,
    pub log_seq: u64,
    /// Who the agent is; survives changes of hands.
    pub profile: Option<Profile>,
    /// How many accounts have held this seat (1 at creation).
    pub owners: u32,
    /// The owner leaves the budget to the NFT's next owner.
    pub budget_follows: bool,
    /// The NFT changed hands with `budget_follows` on: the budget waits for
    /// whoever claims the seat (or for the seller, if the NFT comes back).
    pub held_for_next_owner: bool,
}

/// Money set aside for an account that no longer controls a seat.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default, Debug, PartialEq)]
pub struct Refund {
    pub near: U128,
    pub usdc: U128,
}

#[near(serializers = [json])]
#[derive(Debug)]
pub struct SeatView {
    pub seat_id: U64,
    pub nft_contract: AccountId,
    pub token_id: String,
    pub kind: Kind,
    pub asset: String,
    pub owner: AccountId,
    pub agent_key: Option<PublicKey>,
    pub paused: bool,
    pub policy: Option<Policy>,
    pub balance: U128,
    pub in_flight: u32,
    pub spent_today: U128,
    pub left_today: U128,
    pub spent_total: U128,
    pub done: u32,
    pub refused: u32,
    pub failed: u32,
    pub created_at: U64,
    pub profile: Option<Profile>,
    pub owners: u32,
    pub budget_follows: bool,
    pub held_for_next_owner: bool,
}

#[near(serializers = [json])]
#[derive(Debug)]
pub struct LogView {
    pub seq: U64,
    pub at: U64,
    pub action: String,
    pub status: String,
    pub amount: U128,
    pub counterparty: Option<AccountId>,
    pub detail: String,
    pub times: u32,
}

#[near(serializers = [json])]
struct DepositMsg {
    seat_id: U64,
}

/// The only field read from a NEP-171 `nft_token` answer.
#[near(serializers = [json])]
struct OwnerOnly {
    owner_id: AccountId,
}

#[ext_contract(ext_nft)]
#[allow(dead_code)]
trait ExtNft {
    fn nft_token(&self, token_id: String) -> Option<OwnerOnly>;
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    );
}

#[ext_contract(ext_market)]
#[allow(dead_code)]
trait ExtMarket {
    fn buy(&mut self, token_id: String, listing_id: U64);
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait ExtFt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    /// The USDC contract Payer seats use, fixed at init.
    usdc: AccountId,
    seats: LookupMap<u64, Seat>,
    seat_by_nft: LookupMap<String, u64>,
    seats_by_owner: LookupMap<AccountId, Vec<u64>>,
    refunds: LookupMap<AccountId, Refund>,
    next_id: u64,
    /// Σ budgets and refunds owed, per asset (solvency checks).
    owed_near: u128,
    owed_usdc: u128,
    /// Σ storage deposits held for open seats.
    storage_held: u128,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "agents", "version": "2.0.0", "event": event, "data": [data]})
    ));
}

fn yocto(amount: u128) -> NearToken {
    NearToken::from_yoctonear(amount)
}

fn nft_key(nft_contract: &AccountId, token_id: &str) -> String {
    format!("{nft_contract}:{token_id}")
}

fn today() -> u64 {
    env::block_timestamp() / NS_PER_DAY
}

fn short(text: &str) -> String {
    text.chars().take(DETAIL_LEN).collect()
}

fn check_profile(p: &Profile) {
    let name = p.name.trim().chars().count();
    require!(name > 0 && p.name.chars().count() <= PROFILE_NAME_LEN, "Profile name: 1 to 32 characters");
    require!(p.role.chars().count() <= PROFILE_ROLE_LEN, "Profile role: at most 24 characters");
    if let Some(t) = &p.tool {
        require!(t.chars().count() <= PROFILE_TOOL_LEN, "Profile tool: at most 24 characters");
    }
    for link in [&p.avatar, &p.manifest].into_iter().flatten() {
        require!(
            link.starts_with("https://") && link.len() <= PROFILE_LINK_LEN,
            "Profile links must start with https:// and be at most 160 bytes"
        );
    }
}

/// Reads the owner from a resolved `nft_token` promise. `None` when the call failed,
/// the token does not exist, or the answer is not NEP-171.
fn resolved_owner() -> Option<AccountId> {
    let bytes = env::promise_result_checked(0, MAX_NFT_RESULT as usize).ok()?;
    serde_json::from_slice::<Option<OwnerOnly>>(&bytes)
        .ok()
        .flatten()
        .map(|t| t.owner_id)
}

impl Seat {
    fn spent_today(&self) -> u128 {
        if self.spent_day.0 == today() {
            self.spent_day.1
        } else {
            0
        }
    }

    fn log(&mut self, seat_id: u64, action: &str, status: &str, amount: u128,
           counterparty: Option<AccountId>, detail: &str) {
        self.log_seq += 1;
        let entry = LogEntry {
            seq: self.log_seq,
            at: env::block_timestamp(),
            action: action.into(),
            status: status.into(),
            amount,
            counterparty,
            detail: short(detail),
            times: 1,
        };
        emit(
            "agent_log",
            json!({"seat_id": U64(seat_id), "seq": U64(entry.seq), "action": action,
                   "status": status, "amount": U128(amount),
                   "counterparty": entry.counterparty, "detail": entry.detail}),
        );
        match status {
            "done" if action == "pay" || action == "buy" => self.done += 1,
            "refused" => self.refused += 1,
            "failed" => self.failed += 1,
            _ => {}
        }
        if status == "refused" {
            // The same refusal again: count it on the last entry (new seq, so readers see it).
            if let Some(last) = self.log.last_mut() {
                if last.status == "refused"
                    && last.action == entry.action
                    && last.amount == entry.amount
                    && last.counterparty == entry.counterparty
                    && last.detail == entry.detail
                {
                    last.times += 1;
                    last.seq = entry.seq;
                    last.at = entry.at;
                    return;
                }
            }
            // Refusals never take more than MAX_REFUSED_KEPT entries: drop the oldest refusal.
            if self.log.iter().filter(|e| e.status == "refused").count() >= MAX_REFUSED_KEPT {
                if let Some(i) = self.log.iter().position(|e| e.status == "refused") {
                    self.log.remove(i);
                }
            }
        }
        if self.log.len() >= LOG_SIZE {
            self.log.remove(0);
        }
        self.log.push(entry);
    }
}

#[near]
impl Contract {
    #[init]
    pub fn new(usdc: AccountId) -> Self {
        Self {
            usdc,
            seats: LookupMap::new(StorageKey::Seats),
            seat_by_nft: LookupMap::new(StorageKey::SeatByNft),
            seats_by_owner: LookupMap::new(StorageKey::SeatsByOwner),
            refunds: LookupMap::new(StorageKey::Refunds),
            next_id: 0,
            owed_near: 0,
            owed_usdc: 0,
            storage_held: 0,
        }
    }

    // -----------------------------------------------------------------------
    // Seat lifecycle (owner)
    // -----------------------------------------------------------------------

    /// Creates a seat on an NFT the caller owns. Attach [`SEAT_STORAGE`]
    /// (0.1 NEAR, refunded on close). Ownership is checked with the NFT
    /// contract; on failure the deposit is returned and no seat is created.
    #[payable]
    pub fn create_seat(
        &mut self,
        nft_contract: AccountId,
        token_id: String,
        kind: Kind,
        policy: Option<Policy>,
        profile: Option<Profile>,
    ) -> Promise {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= SEAT_STORAGE, "Attach 0.1 NEAR for the seat's storage");
        require!(
            !self.seat_by_nft.contains_key(&nft_key(&nft_contract, &token_id)),
            "This NFT already has a seat: use claim_seat"
        );
        if let Some(p) = &policy {
            self.check_policy(kind, p);
        }
        if let Some(p) = &profile {
            check_profile(p);
        }
        let caller = env::predecessor_account_id();
        ext_nft::ext(nft_contract.clone())
            .with_static_gas(GAS_NFT_TOKEN)
            .nft_token(token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_SEAT_CHECKED)
                    .on_create_checked(caller, nft_contract, token_id, kind, policy, profile, U128(deposit)),
            )
    }

    #[private]
    pub fn on_create_checked(
        &mut self,
        caller: AccountId,
        nft_contract: AccountId,
        token_id: String,
        kind: Kind,
        policy: Option<Policy>,
        profile: Option<Profile>,
        deposit: U128,
    ) -> Option<U64> {
        let key = nft_key(&nft_contract, &token_id);
        let owns = resolved_owner().as_ref() == Some(&caller);
        let taken = self.seat_by_nft.contains_key(&key);
        let full = self.owner_seats(&caller).len() >= MAX_SEATS_PER_OWNER;
        if !owns || taken || full {
            Promise::new(caller.clone()).transfer(yocto(deposit.0)).detach();
            emit(
                "seat_refused",
                json!({"caller": caller, "nft_contract": nft_contract, "token_id": token_id,
                       "reason": if !owns { "not the NFT owner" } else if taken { "seat exists" } else { "too many seats" }}),
            );
            return None;
        }
        self.next_id += 1;
        let id = self.next_id;
        let mut seat = Seat {
            nft_contract,
            token_id,
            kind,
            owner: caller.clone(),
            storage_payer: caller.clone(),
            agent_key: None,
            paused: false,
            policy,
            balance: 0,
            in_flight: 0,
            spent_day: (0, 0),
            spent_total: 0,
            done: 0,
            refused: 0,
            failed: 0,
            created_at: env::block_timestamp(),
            log: Vec::with_capacity(LOG_SIZE),
            log_seq: 0,
            profile,
            owners: 1,
            budget_follows: false,
            held_for_next_owner: false,
        };
        seat.log(id, "create", "info", 0, None, if kind == Kind::Buyer { "buyer" } else { "payer" });
        self.storage_held += SEAT_STORAGE;
        if deposit.0 > SEAT_STORAGE {
            Promise::new(caller.clone())
                .transfer(yocto(deposit.0 - SEAT_STORAGE))
                .detach();
        }
        self.seat_by_nft.insert(key, id);
        self.add_owner_seat(&caller, id);
        emit(
            "seat_created",
            json!({"seat_id": U64(id), "owner": caller, "nft_contract": seat.nft_contract,
                   "token_id": seat.token_id, "kind": kind}),
        );
        self.seats.insert(id, seat);
        Some(U64(id))
    }

    /// Adds the attached NEAR to a Buyer seat's budget. Owner only.
    #[payable]
    pub fn fund(&mut self, seat_id: U64) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach the NEAR to add");
        let mut seat = self.owned_seat(seat_id.0);
        require!(seat.kind == Kind::Buyer, "Payer seats are funded in USDC (ft_transfer_call)");
        seat.balance += amount;
        self.owed_near += amount;
        seat.log(seat_id.0, "fund", "done", amount, None, "NEAR");
        let balance = seat.balance;
        self.seats.insert(seat_id.0, seat);
        U128(balance)
    }

    /// Replaces the policy. Owner only, 1 yoctoNEAR (so the agent key cannot).
    #[payable]
    pub fn set_policy(&mut self, seat_id: U64, policy: Policy) {
        assert_one_yocto();
        let mut seat = self.owned_seat(seat_id.0);
        self.check_policy(seat.kind, &policy);
        seat.policy = Some(policy);
        seat.log(seat_id.0, "policy", "info", 0, None, "policy updated");
        self.seats.insert(seat_id.0, seat);
    }

    /// Sets (or clears) the one key allowed to run this seat. Owner only, 1 yoctoNEAR.
    #[payable]
    pub fn set_agent_key(&mut self, seat_id: U64, public_key: Option<PublicKey>) {
        assert_one_yocto();
        let mut seat = self.owned_seat(seat_id.0);
        let detail = if public_key.is_some() { "agent key set" } else { "agent key cleared" };
        seat.agent_key = public_key;
        seat.log(seat_id.0, "key", "info", 0, None, detail);
        self.seats.insert(seat_id.0, seat);
    }

    /// Stops the agent. The owner may call it with any key, the agent key
    /// included, so a leaked agent key can at worst stop its own seat.
    pub fn pause(&mut self, seat_id: U64) {
        let mut seat = self.owned_seat(seat_id.0);
        if !seat.paused {
            seat.paused = true;
            seat.log(seat_id.0, "pause", "info", 0, None, "agent paused");
            self.seats.insert(seat_id.0, seat);
        }
    }

    /// Restarts the agent. Owner only, 1 yoctoNEAR (the agent key cannot).
    #[payable]
    pub fn resume(&mut self, seat_id: U64) {
        assert_one_yocto();
        let mut seat = self.owned_seat(seat_id.0);
        if seat.paused {
            seat.paused = false;
            seat.log(seat_id.0, "resume", "info", 0, None, "agent resumed");
            self.seats.insert(seat_id.0, seat);
        }
    }

    /// Sends `amount` (default: all) of the seat's budget to its owner.
    /// Owner only, 1 yoctoNEAR. The funder keeps this right after selling the NFT,
    /// until the new owner claims the seat (then the budget moves to `refunds`).
    #[payable]
    pub fn withdraw(&mut self, seat_id: U64, amount: Option<U128>) -> Promise {
        assert_one_yocto();
        let seat = self.owned_seat(seat_id.0);
        require!(!seat.held_for_next_owner, "This budget is held for the NFT's next owner");
        let value = amount.map(|a| a.0).unwrap_or(seat.balance);
        require!(value > 0 && value <= seat.balance, "Invalid amount");
        if seat.budget_follows {
            // The budget was promised to the NFT's next owner: prove you still own the NFT.
            return self.check_owner_then(seat_id, &seat, "withdraw", Some(U128(value)));
        }
        self.do_withdraw(seat_id.0, seat, value)
    }

    /// Leaves the budget to the NFT's next owner (`true`), or takes that back
    /// (`false`, only while you still own the NFT: checked on chain). Owner only, 1 yoctoNEAR.
    #[payable]
    pub fn set_budget_follows(&mut self, seat_id: U64, follows: bool) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let mut seat = self.owned_seat(seat_id.0);
        require!(!seat.held_for_next_owner, "This budget is held for the NFT's next owner");
        if follows == seat.budget_follows {
            return PromiseOrValue::Value(true);
        }
        if follows {
            seat.budget_follows = true;
            seat.log(seat_id.0, "budget", "info", 0, None, "budget follows the NFT");
            self.seats.insert(seat_id.0, seat);
            return PromiseOrValue::Value(true);
        }
        PromiseOrValue::Promise(self.check_owner_then(seat_id, &seat, "follows_off", None))
    }

    /// Sets (or clears) who the agent is. Owner only, 1 yoctoNEAR. The profile
    /// stays with the seat when the NFT changes hands.
    #[payable]
    pub fn set_profile(&mut self, seat_id: U64, profile: Option<Profile>) {
        assert_one_yocto();
        let mut seat = self.owned_seat(seat_id.0);
        if let Some(p) = &profile {
            check_profile(p);
        }
        seat.profile = profile;
        seat.log(seat_id.0, "profile", "info", 0, None, "profile updated");
        self.seats.insert(seat_id.0, seat);
    }

    /// After an owner action that needed proof of NFT ownership.
    #[private]
    pub fn on_owner_checked(
        &mut self,
        seat_id: U64,
        caller: AccountId,
        action: String,
        amount: Option<U128>,
    ) -> PromiseOrValue<bool> {
        let Some(mut seat) = self.seats.get(&seat_id.0).cloned() else {
            return PromiseOrValue::Value(false);
        };
        if seat.owner != caller || seat.held_for_next_owner {
            return PromiseOrValue::Value(false);
        }
        let owner = resolved_owner();
        if owner.as_ref() != Some(&caller) {
            if owner.is_some() {
                // Sold: keep the promise, the budget waits for the next owner.
                self.reset(seat_id.0, &mut seat, "NFT changed hands");
                self.seats.insert(seat_id.0, seat);
            }
            return PromiseOrValue::Value(false);
        }
        match action.as_str() {
            "withdraw" => {
                let value = amount.map(|a| a.0).unwrap_or(seat.balance);
                if value == 0 || value > seat.balance {
                    return PromiseOrValue::Value(false);
                }
                PromiseOrValue::Promise(self.do_withdraw(seat_id.0, seat, value))
            }
            "follows_off" => {
                seat.budget_follows = false;
                seat.log(seat_id.0, "budget", "info", 0, None, "budget returns to the seller on a sale");
                self.seats.insert(seat_id.0, seat);
                PromiseOrValue::Value(true)
            }
            _ => PromiseOrValue::Value(false),
        }
    }

    /// Takes over a seat after buying (or receiving) its NFT. 1 yoctoNEAR.
    /// The previous owner's budget is set aside in `refunds`; the seat starts
    /// paused, with no key and no policy.
    #[payable]
    pub fn claim_seat(&mut self, seat_id: U64) -> Promise {
        assert_one_yocto();
        let seat = self.seat_state(seat_id.0);
        let caller = env::predecessor_account_id();
        require!(
            caller != seat.owner || seat.held_for_next_owner,
            "You already hold this seat"
        );
        ext_nft::ext(seat.nft_contract.clone())
            .with_static_gas(GAS_NFT_TOKEN)
            .nft_token(seat.token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_SEAT_CHECKED)
                    .on_claim_checked(seat_id, caller),
            )
    }

    #[private]
    pub fn on_claim_checked(&mut self, seat_id: U64, caller: AccountId) -> bool {
        let Some(mut seat) = self.seats.get(&seat_id.0).cloned() else {
            return false;
        };
        if resolved_owner().as_ref() != Some(&caller) || (seat.owner == caller && !seat.held_for_next_owner) {
            emit("claim_refused", json!({"seat_id": seat_id, "caller": caller}));
            return false;
        }
        if seat.owner == caller {
            // The NFT came back to the seller before anyone claimed it: the held budget is theirs again.
            seat.held_for_next_owner = false;
            seat.budget_follows = false;
            seat.log(seat_id.0, "budget", "info", seat.balance, None, "budget back to its owner");
            self.seats.insert(seat_id.0, seat);
            emit("seat_claimed", json!({"seat_id": seat_id, "from": caller, "to": caller}));
            return true;
        }
        if self.owner_seats(&caller).len() >= MAX_SEATS_PER_OWNER {
            emit("claim_refused", json!({"seat_id": seat_id, "caller": caller, "reason": "too many seats"}));
            return false;
        }
        let old = seat.owner.clone();
        self.reset(seat_id.0, &mut seat, "claimed by new NFT owner");
        self.remove_owner_seat(&old, seat_id.0);
        self.add_owner_seat(&caller, seat_id.0);
        seat.owner = caller.clone();
        seat.owners += 1;
        seat.log(seat_id.0, "claim", "info", 0, Some(old.clone()), "new owner");
        if seat.held_for_next_owner {
            seat.held_for_next_owner = false;
            seat.budget_follows = false;
            seat.log(seat_id.0, "budget", "info", seat.balance, Some(old.clone()), "budget handed to the new owner");
        }
        self.seats.insert(seat_id.0, seat);
        emit("seat_claimed", json!({"seat_id": seat_id, "from": old, "to": caller}));
        true
    }

    /// Deletes an empty seat and refunds its storage deposit. Owner only, 1 yoctoNEAR.
    #[payable]
    pub fn close_seat(&mut self, seat_id: U64) {
        assert_one_yocto();
        let seat = self.owned_seat(seat_id.0);
        require!(seat.balance == 0, "Withdraw the budget first");
        require!(seat.in_flight == 0, "An action is still in flight");
        self.seats.remove(&seat_id.0);
        self.seat_by_nft.remove(&nft_key(&seat.nft_contract, &seat.token_id));
        self.remove_owner_seat(&seat.owner, seat_id.0);
        self.storage_held -= SEAT_STORAGE;
        Promise::new(seat.storage_payer.clone())
            .transfer(yocto(SEAT_STORAGE))
            .detach();
        emit("seat_closed", json!({"seat_id": seat_id, "owner": seat.owner}));
    }

    /// Sends the caller's set-aside money (from seats they no longer hold). 1 yoctoNEAR.
    #[payable]
    pub fn withdraw_refund(&mut self) -> Refund {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let refund = self.refunds.remove(&who).unwrap_or_default();
        require!(refund.near.0 > 0 || refund.usdc.0 > 0, "Nothing to withdraw");
        for (kind, amount) in [(Kind::Buyer, refund.near.0), (Kind::Payer, refund.usdc.0)] {
            if amount == 0 {
                continue;
            }
            self.debit_owed(kind, amount);
            self.send(kind, who.clone(), amount, Some("agent seat refund".into()))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_SMALL_CALLBACK)
                        .on_refund_sent(who.clone(), kind, U128(amount)),
                )
                .detach();
        }
        refund
    }

    #[private]
    pub fn on_refund_sent(&mut self, who: AccountId, kind: Kind, amount: U128) -> bool {
        if env::promise_result_checked(0, 0).is_ok() {
            return true;
        }
        self.credit_refund(&who, kind, amount.0);
        false
    }

    // -----------------------------------------------------------------------
    // Agent actions (signed by the seat's agent key, no deposit)
    // -----------------------------------------------------------------------

    /// Payer: sends `amount` USDC to an allowlisted `payee`. Returns `false`
    /// (logged, nothing moved) when the policy refuses it.
    pub fn agent_pay(
        &mut self,
        seat_id: U64,
        payee: AccountId,
        amount: U128,
        memo: Option<String>,
    ) -> PromiseOrValue<bool> {
        let mut seat = self.agent_seat(seat_id.0);
        let detail = memo.clone().unwrap_or_default();
        if seat.kind != Kind::Payer {
            return self.refuse(seat_id.0, seat, "pay", amount.0, Some(payee), "not a payer seat");
        }
        let allowed = seat.policy.as_ref().is_some_and(|p| p.payees.contains(&payee));
        if let Some(reason) = self.policy_refusal(&seat, amount.0).or(if allowed {
            None
        } else {
            Some("payee not on the list")
        }) {
            return self.refuse(seat_id.0, seat, "pay", amount.0, Some(payee), reason);
        }
        self.spend(&mut seat, amount.0);
        seat.log(seat_id.0, "pay", "pending", amount.0, Some(payee.clone()), &detail);
        let (nft, token, owner) = (seat.nft_contract.clone(), seat.token_id.clone(), seat.owner.clone());
        self.seats.insert(seat_id.0, seat);
        PromiseOrValue::Promise(
            ext_nft::ext(nft)
                .with_static_gas(GAS_NFT_TOKEN)
                .nft_token(token)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_PAY_CHECKED)
                        .on_pay_checked(seat_id, owner, payee, amount, memo),
                ),
        )
    }

    #[private]
    pub fn on_pay_checked(
        &mut self,
        seat_id: U64,
        funder: AccountId,
        payee: AccountId,
        amount: U128,
        memo: Option<String>,
    ) -> PromiseOrValue<bool> {
        if !self.still_owned(seat_id.0, &funder, Kind::Payer, amount.0, "pay", &payee) {
            return PromiseOrValue::Value(false);
        }
        PromiseOrValue::Promise(
            self.send(Kind::Payer, payee.clone(), amount.0, memo).then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_SMALL_CALLBACK)
                    .on_paid(seat_id, funder, payee, amount),
            ),
        )
    }

    #[private]
    pub fn on_paid(&mut self, seat_id: U64, funder: AccountId, payee: AccountId, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        self.settle(seat_id.0, &funder, Kind::Payer, amount.0, ok, "pay", Some(payee),
                    if ok { "paid" } else { "transfer failed" });
        ok
    }

    /// Buyer: buys `token_id` listed as `listing_id` at `price` on the policy's
    /// market, then delivers it to the seat owner. The listing id pins the exact
    /// offer the agent reviewed.
    pub fn agent_buy(
        &mut self,
        seat_id: U64,
        token_id: String,
        listing_id: U64,
        price: U128,
    ) -> PromiseOrValue<bool> {
        let mut seat = self.agent_seat(seat_id.0);
        if seat.kind != Kind::Buyer {
            return self.refuse(seat_id.0, seat, "buy", price.0, None, "not a buyer seat");
        }
        let market = seat.policy.as_ref().and_then(|p| p.market.clone());
        if let Some(reason) = self.policy_refusal(&seat, price.0) {
            return self.refuse(seat_id.0, seat, "buy", price.0, market, reason);
        }
        let Some(market) = market else {
            return self.refuse(seat_id.0, seat, "buy", price.0, None, "no market set");
        };
        self.spend(&mut seat, price.0);
        seat.log(seat_id.0, "buy", "pending", price.0, Some(market.clone()), &format!("#{token_id}"));
        let (nft, nft_token, owner) = (seat.nft_contract.clone(), seat.token_id.clone(), seat.owner.clone());
        self.seats.insert(seat_id.0, seat);
        PromiseOrValue::Promise(
            ext_nft::ext(nft)
                .with_static_gas(GAS_NFT_TOKEN)
                .nft_token(nft_token)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_BUY_CHECKED)
                        .on_buy_checked(seat_id, owner, market, token_id, listing_id, price),
                ),
        )
    }

    #[private]
    pub fn on_buy_checked(
        &mut self,
        seat_id: U64,
        funder: AccountId,
        market: AccountId,
        token_id: String,
        listing_id: U64,
        price: U128,
    ) -> PromiseOrValue<bool> {
        if !self.still_owned(seat_id.0, &funder, Kind::Buyer, price.0, "buy", &market) {
            return PromiseOrValue::Value(false);
        }
        PromiseOrValue::Promise(
            ext_market::ext(market.clone())
                .with_static_gas(GAS_BUY)
                .with_attached_deposit(yocto(price.0))
                .buy(token_id.clone(), listing_id)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_ON_BOUGHT)
                        .on_bought(seat_id, funder, market, token_id, price),
                ),
        )
    }

    #[private]
    pub fn on_bought(
        &mut self,
        seat_id: U64,
        funder: AccountId,
        market: AccountId,
        token_id: String,
        price: U128,
    ) -> PromiseOrValue<bool> {
        if env::promise_result_checked(0, MAX_NFT_RESULT as usize).is_err() {
            // The market refunded the attached NEAR to this contract.
            self.settle(seat_id.0, &funder, Kind::Buyer, price.0, false, "buy", Some(market),
                        "purchase failed");
            return PromiseOrValue::Value(false);
        }
        self.settle(seat_id.0, &funder, Kind::Buyer, price.0, true, "buy", Some(market.clone()),
                    &format!("bought #{token_id}"));
        PromiseOrValue::Promise(
            ext_nft::ext(market.clone())
                .with_static_gas(GAS_NFT_TRANSFER)
                .with_attached_deposit(yocto(1))
                .nft_transfer(funder.clone(), token_id.clone(), None, Some("agent seat purchase".into()))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_SMALL_CALLBACK)
                        .on_delivered(seat_id, funder, market, token_id),
                ),
        )
    }

    #[private]
    pub fn on_delivered(&mut self, seat_id: U64, funder: AccountId, market: AccountId, token_id: String) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        emit(
            if ok { "nft_delivered" } else { "nft_delivery_failed" },
            json!({"seat_id": seat_id, "to": funder, "nft_contract": market, "token_id": token_id}),
        );
        if let Some(mut seat) = self.seats.get(&seat_id.0).cloned() {
            seat.log(seat_id.0, "deliver", if ok { "done" } else { "failed" }, 0, Some(funder),
                     &format!("#{token_id}"));
            self.seats.insert(seat_id.0, seat);
        }
        ok
    }

    // -----------------------------------------------------------------------
    // NEP-141 receiver: USDC enters a Payer seat through ft_transfer_call.
    // -----------------------------------------------------------------------

    /// `msg` must be `{"seat_id": "<id>"}`, from the USDC contract, sent by the seat
    /// owner, to a Payer seat. Anything else is refunded in full.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.usdc || amount.0 == 0 {
            return PromiseOrValue::Value(amount);
        }
        let Ok(DepositMsg { seat_id }) = serde_json::from_str::<DepositMsg>(&msg) else {
            return PromiseOrValue::Value(amount);
        };
        let Some(mut seat) = self.seats.get(&seat_id.0).cloned() else {
            return PromiseOrValue::Value(amount);
        };
        if seat.kind != Kind::Payer || seat.owner != sender_id {
            return PromiseOrValue::Value(amount);
        }
        seat.balance += amount.0;
        self.owed_usdc += amount.0;
        seat.log(seat_id.0, "fund", "done", amount.0, None, "USDC");
        self.seats.insert(seat_id.0, seat);
        PromiseOrValue::Value(U128(0))
    }

    #[private]
    pub fn on_sent(&mut self, seat_id: U64, to: AccountId, amount: U128, action: String) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        if let Some(mut seat) = self.seats.get(&seat_id.0).cloned() {
            seat.in_flight -= 1;
            if !ok {
                if seat.owner == to {
                    seat.balance += amount.0;
                    self.credit_owed(seat.kind, amount.0);
                } else {
                    self.credit_refund(&to, seat.kind, amount.0);
                }
                seat.log(seat_id.0, &action, "failed", amount.0, Some(to), "credited back");
            }
            self.seats.insert(seat_id.0, seat);
        }
        ok
    }

    // -----------------------------------------------------------------------
    // Views (analytics)
    // -----------------------------------------------------------------------

    pub fn seat(&self, seat_id: U64) -> Option<SeatView> {
        self.seats.get(&seat_id.0).map(|s| self.view_of(seat_id.0, s))
    }

    pub fn seat_for_nft(&self, nft_contract: AccountId, token_id: String) -> Option<SeatView> {
        self.seat_by_nft
            .get(&nft_key(&nft_contract, &token_id))
            .and_then(|id| self.seat(U64(*id)))
    }

    pub fn seats_for_owner(&self, account_id: AccountId) -> Vec<SeatView> {
        self.owner_seats(&account_id)
            .iter()
            .filter_map(|id| self.seat(U64(*id)))
            .collect()
    }

    /// Newest first.
    pub fn seat_log(&self, seat_id: U64) -> Vec<LogView> {
        self.seats
            .get(&seat_id.0)
            .map(|s| {
                s.log
                    .iter()
                    .rev()
                    .map(|e| LogView {
                        seq: U64(e.seq),
                        at: U64(e.at),
                        action: e.action.clone(),
                        status: e.status.clone(),
                        amount: U128(e.amount),
                        counterparty: e.counterparty.clone(),
                        detail: e.detail.clone(),
                        times: e.times,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn refund_of(&self, account_id: AccountId) -> Refund {
        self.refunds.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn stats(&self) -> serde_json::Value {
        json!({
            "usdc": self.usdc,
            "seats_created": U64(self.next_id),
            "owed_near": U128(self.owed_near),
            "owed_usdc": U128(self.owed_usdc),
            "storage_held": U128(self.storage_held),
            "account_balance": U128(env::account_balance().as_yoctonear()),
            "storage_cost": U128(env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear()),
        })
    }

    pub fn config(&self) -> serde_json::Value {
        json!({
            "usdc": self.usdc,
            "seat_storage": U128(SEAT_STORAGE),
            "version": "2.0.0",
            "log_size": LOG_SIZE,
            "max_refused_kept": MAX_REFUSED_KEPT,
            "max_payees": MAX_PAYEES,
            "profile_limits": {"name": PROFILE_NAME_LEN, "role": PROFILE_ROLE_LEN,
                               "tool": PROFILE_TOOL_LEN, "link": PROFILE_LINK_LEN},
            "agent_methods": ["agent_pay", "agent_buy", "pause"],
        })
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

impl Contract {
    /// Sends `amount` of the seat's budget to its owner (checks done by the caller).
    fn do_withdraw(&mut self, id: u64, mut seat: Seat, amount: u128) -> Promise {
        seat.balance -= amount;
        seat.in_flight += 1;
        seat.log(id, "withdraw", "done", amount, Some(seat.owner.clone()), "to owner");
        let (owner, kind) = (seat.owner.clone(), seat.kind);
        self.seats.insert(id, seat);
        self.debit_owed(kind, amount);
        self.send(kind, owner.clone(), amount, Some("agent seat withdraw".into()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_SMALL_CALLBACK)
                    .on_sent(U64(id), owner, U128(amount), "withdraw".into()),
            )
    }

    /// Asks the NFT contract who owns the seat's NFT, then runs `action` in `on_owner_checked`.
    fn check_owner_then(&self, seat_id: U64, seat: &Seat, action: &str, amount: Option<U128>) -> Promise {
        ext_nft::ext(seat.nft_contract.clone())
            .with_static_gas(GAS_NFT_TOKEN)
            .nft_token(seat.token_id.clone())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_OWNER_CHECKED)
                    .on_owner_checked(seat_id, env::predecessor_account_id(), action.into(), amount),
            )
    }

    fn seat_state(&self, id: u64) -> Seat {
        self.seats
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("No such seat"))
    }

    /// The seat, when the caller is its owner (any key).
    fn owned_seat(&self, id: u64) -> Seat {
        let seat = self.seat_state(id);
        require!(env::predecessor_account_id() == seat.owner, "Only the seat owner can do this");
        seat
    }

    /// The seat, when the call is signed directly by its registered agent key.
    fn agent_seat(&self, id: u64) -> Seat {
        let seat = self.seat_state(id);
        let signer = env::signer_account_id();
        require!(env::predecessor_account_id() == signer, "Agent calls must be direct");
        require!(signer == seat.owner, "Only the seat owner's agent can act");
        require!(
            seat.agent_key.as_ref() == Some(&env::signer_account_pk()),
            "This key is not the seat's agent key"
        );
        require!(env::attached_deposit().is_zero(), "Agent actions take no deposit");
        seat
    }

    /// Why the policy refuses `amount`, if it does.
    fn policy_refusal(&self, seat: &Seat, amount: u128) -> Option<&'static str> {
        let Some(p) = &seat.policy else {
            return Some("no policy set");
        };
        if seat.paused {
            Some("agent paused")
        } else if amount == 0 {
            Some("zero amount")
        } else if amount > p.per_tx_max.0 {
            Some("over the per-action cap")
        } else if seat.spent_today() + amount > p.per_day_max.0 {
            Some("over the daily cap")
        } else if amount > seat.balance {
            Some("budget too low")
        } else {
            None
        }
    }

    fn refuse(
        &mut self,
        id: u64,
        mut seat: Seat,
        action: &str,
        amount: u128,
        counterparty: Option<AccountId>,
        reason: &str,
    ) -> PromiseOrValue<bool> {
        seat.log(id, action, "refused", amount, counterparty, reason);
        self.seats.insert(id, seat);
        PromiseOrValue::Value(false)
    }

    /// Debits the budget and the daily counter before any promise, so two
    /// actions in flight can never spend the same money.
    fn spend(&mut self, seat: &mut Seat, amount: u128) {
        let day = today();
        let spent = seat.spent_today();
        seat.spent_day = (day, spent + amount);
        seat.balance -= amount;
        seat.in_flight += 1;
        self.debit_owed(seat.kind, amount);
    }

    /// Ownership callback shared by pay and buy. On a change of hands: credit the
    /// money back to the funder (as a refund), reset the seat, log, return false.
    fn still_owned(&mut self, id: u64, funder: &AccountId, kind: Kind, amount: u128,
                   action: &str, counterparty: &AccountId) -> bool {
        let owner = resolved_owner();
        if owner.as_ref() == Some(funder) {
            return true;
        }
        let reason = if owner.is_none() { "NFT owner unreadable" } else { "NFT changed hands" };
        match self.seats.get(&id).cloned() {
            Some(mut seat) if seat.owner == *funder => {
                seat.in_flight -= 1;
                seat.spent_day.1 = seat.spent_day.1.saturating_sub(amount);
                seat.balance += amount;
                self.credit_owed(kind, amount);
                seat.log(id, action, "refused", amount, Some(counterparty.clone()), reason);
                if owner.is_some() {
                    self.reset(id, &mut seat, reason);
                }
                self.seats.insert(id, seat);
            }
            Some(mut seat) => {
                seat.in_flight -= 1;
                self.credit_refund(funder, kind, amount);
                self.seats.insert(id, seat);
            }
            None => self.credit_refund(funder, kind, amount),
        }
        false
    }

    /// Final callback of pay and buy. On failure the money goes back to the
    /// funder: to the seat if they still hold it, otherwise to their refunds.
    #[allow(clippy::too_many_arguments)]
    fn settle(&mut self, id: u64, funder: &AccountId, kind: Kind, amount: u128, ok: bool,
              action: &str, counterparty: Option<AccountId>, detail: &str) {
        let Some(mut seat) = self.seats.get(&id).cloned() else {
            if !ok {
                self.credit_refund(funder, kind, amount);
            }
            return;
        };
        seat.in_flight -= 1;
        if ok {
            seat.spent_total += amount;
            seat.log(id, action, "done", amount, counterparty, detail);
        } else {
            seat.spent_day.1 = seat.spent_day.1.saturating_sub(amount);
            if seat.owner == *funder {
                seat.balance += amount;
                self.credit_owed(kind, amount);
            } else {
                self.credit_refund(funder, kind, amount);
            }
            seat.log(id, action, "failed", amount, counterparty, detail);
        }
        self.seats.insert(id, seat);
    }

    /// Clears everything the old owner set up and sets their budget aside.
    fn reset(&mut self, id: u64, seat: &mut Seat, reason: &str) {
        if seat.balance > 0 && seat.budget_follows {
            // Promised to the next owner: it stays in the seat, owed, until a claim.
            if !seat.held_for_next_owner {
                seat.held_for_next_owner = true;
                seat.log(id, "budget", "info", seat.balance, None, "held for the next owner");
            }
        } else if seat.balance > 0 {
            let (old, kind, amount) = (seat.owner.clone(), seat.kind, seat.balance);
            seat.balance = 0;
            self.debit_owed(kind, amount);
            self.credit_refund(&old, kind, amount);
        }
        seat.agent_key = None;
        seat.policy = None;
        seat.paused = true;
        seat.spent_day = (0, 0);
        seat.log(id, "reset", "info", 0, None, reason);
        emit("seat_reset", json!({"seat_id": U64(id), "owner": seat.owner, "reason": reason}));
    }

    fn check_policy(&self, kind: Kind, p: &Policy) {
        require!(p.per_tx_max.0 > 0, "per_tx_max must be positive");
        require!(p.per_tx_max.0 <= p.per_day_max.0, "per_tx_max cannot exceed per_day_max");
        match kind {
            Kind::Payer => {
                require!(!p.payees.is_empty(), "A payer needs at least one payee");
                require!(p.payees.len() <= MAX_PAYEES, "At most 10 payees");
                require!(p.market.is_none(), "A payer has no market");
            }
            Kind::Buyer => {
                require!(p.market.is_some(), "A buyer needs a market");
                require!(p.payees.is_empty(), "A buyer has no payees");
            }
        }
    }

    fn send(&self, kind: Kind, to: AccountId, amount: u128, memo: Option<String>) -> Promise {
        match kind {
            Kind::Buyer => Promise::new(to).transfer(yocto(amount)),
            Kind::Payer => ext_ft::ext(self.usdc.clone())
                .with_static_gas(GAS_TRANSFER)
                .with_attached_deposit(yocto(1))
                .ft_transfer(to, U128(amount), memo.map(|m| short(&m))),
        }
    }

    fn debit_owed(&mut self, kind: Kind, amount: u128) {
        match kind {
            Kind::Buyer => self.owed_near -= amount,
            Kind::Payer => self.owed_usdc -= amount,
        }
    }

    fn credit_owed(&mut self, kind: Kind, amount: u128) {
        match kind {
            Kind::Buyer => self.owed_near += amount,
            Kind::Payer => self.owed_usdc += amount,
        }
    }

    fn credit_refund(&mut self, who: &AccountId, kind: Kind, amount: u128) {
        let mut r = self.refunds.get(who).cloned().unwrap_or_default();
        match kind {
            Kind::Buyer => r.near = U128(r.near.0 + amount),
            Kind::Payer => r.usdc = U128(r.usdc.0 + amount),
        }
        self.credit_owed(kind, amount);
        self.refunds.insert(who.clone(), r);
        emit("refund_credited", json!({"account_id": who, "kind": kind, "amount": U128(amount)}));
    }

    fn owner_seats(&self, who: &AccountId) -> Vec<u64> {
        self.seats_by_owner.get(who).cloned().unwrap_or_default()
    }

    fn add_owner_seat(&mut self, who: &AccountId, id: u64) {
        let mut ids = self.owner_seats(who);
        ids.push(id);
        self.seats_by_owner.insert(who.clone(), ids);
    }

    fn remove_owner_seat(&mut self, who: &AccountId, id: u64) {
        let mut ids = self.owner_seats(who);
        ids.retain(|x| *x != id);
        if ids.is_empty() {
            self.seats_by_owner.remove(who);
        } else {
            self.seats_by_owner.insert(who.clone(), ids);
        }
    }

    fn view_of(&self, id: u64, s: &Seat) -> SeatView {
        let spent = s.spent_today();
        let cap = s.policy.as_ref().map(|p| p.per_day_max.0).unwrap_or(0);
        SeatView {
            seat_id: U64(id),
            nft_contract: s.nft_contract.clone(),
            token_id: s.token_id.clone(),
            kind: s.kind,
            asset: if s.kind == Kind::Buyer { "NEAR".into() } else { "USDC".into() },
            owner: s.owner.clone(),
            agent_key: s.agent_key.clone(),
            paused: s.paused,
            policy: s.policy.clone(),
            balance: U128(s.balance),
            in_flight: s.in_flight,
            spent_today: U128(spent),
            left_today: U128(cap.saturating_sub(spent).min(s.balance)),
            spent_total: U128(s.spent_total),
            done: s.done,
            refused: s.refused,
            failed: s.failed,
            created_at: U64(s.created_at),
            profile: s.profile.clone(),
            owners: s.owners,
            budget_follows: s.budget_follows,
            held_for_next_owner: s.held_for_next_owner,
        }
    }
}
