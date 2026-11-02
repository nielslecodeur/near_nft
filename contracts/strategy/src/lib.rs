use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult, env, near, require,
};
const PERIOD: u64 = 86_400_000_000_000;
#[near(serializers = [borsh])]
pub struct Position {
    principal: u128,
    paid_period: Option<u64>,
    pending: Option<(u64, u128)>,
    redemption: Option<(u64, u128)>,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Strategy {
    asset: AccountId,
    reserve: u128,
    positions: LookupMap<AccountId, Position>,
    operation: u64,
}
#[near]
impl Strategy {
    #[init]
    pub fn new(asset: AccountId) -> Self {
        let id = env::current_account_id();
        let caller = env::predecessor_account_id();
        require!(
            caller == id
                || id.as_str().split_once('.').map(|(_, parent)| parent) == Some(caller.as_str()),
            "DEPLOYER_ONLY"
        );
        Self {
            asset,
            reserve: 0,
            positions: LookupMap::new(b"p"),
            operation: 0,
        }
    }
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.asset, "FT_ONLY");
        if msg == "reserve" {
            self.reserve = self.reserve.checked_add(amount.0).unwrap();
        } else {
            require!(msg == "invest", "ROUTE");
            // A new position must pay storage separately before investing; fixed bound prevents spam.
            let p = self
                .positions
                .get_mut(&sender_id)
                .unwrap_or_else(|| env::panic_str("REGISTER_POSITION_FIRST"));
            p.principal = p.principal.checked_add(amount.0).unwrap();
        }
        U128(0)
    }
    #[payable]
    pub fn register_position(&mut self, wallet: AccountId) {
        require!(
            env::attached_deposit() >= NearToken::from_millinear(20),
            "STORAGE_DEPOSIT"
        );
        if !self.positions.contains_key(&wallet) {
            self.positions.insert(
                wallet,
                Position {
                    principal: 0,
                    paid_period: None,
                    pending: None,
                    redemption: None,
                },
            );
        }
    }
    /// Fixed demonstration distribution: 1% of principal per test period, NOT annualized APY.
    pub fn distribute(&mut self, wallet: AccountId) -> Promise {
        let period = env::block_timestamp() / PERIOD;
        let p = self.positions.get_mut(&wallet).unwrap();
        require!(
            p.pending.is_none() && p.redemption.is_none() && p.paid_period != Some(period),
            "ALREADY_DISTRIBUTED_OR_PENDING"
        );
        let amount = p.principal / 100;
        require!(amount > 0 && self.reserve >= amount, "RESERVE_EMPTY");
        self.reserve -= amount;
        p.pending = Some((period, amount));
        Promise::new(self.asset.clone())
            .function_call(
                "ft_transfer_call",
                serde_json::to_vec(
                    &json!({"receiver_id":wallet,"amount":U128(amount),"msg":"yield"}),
                )
                .unwrap(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(65),
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_distribution",
                serde_json::to_vec(&json!({"wallet":wallet,"period":U64(period)})).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(15),
            ))
    }
    #[private]
    pub fn on_distribution(&mut self, wallet: AccountId, period: U64) -> bool {
        let p = self.positions.get_mut(&wallet).unwrap();
        let Some((expected, amount)) = p.pending else {
            return false;
        };
        if expected != period.0 {
            return false;
        }
        let used = match env::promise_result_checked(0, 256)
            .map(PromiseResult::Successful)
            .unwrap_or(PromiseResult::Failed)
        {
            PromiseResult::Successful(bytes) => match serde_json::from_slice::<U128>(&bytes) {
                Ok(n) if n.0 <= amount => n.0,
                _ => return false,
            },
            PromiseResult::Failed => return false, // Resolver failure is not proof of a refund.
        };
        self.reserve += amount - used;
        p.pending = None;
        if used > 0 {
            p.paid_period = Some(expected);
        }
        used == amount
    }
    pub fn redeem(&mut self, amount: U128) -> Promise {
        let wallet = env::predecessor_account_id();
        let p = self
            .positions
            .get_mut(&wallet)
            .unwrap_or_else(|| env::panic_str("NO_POSITION"));
        require!(
            p.pending.is_none() && p.redemption.is_none(),
            "STRATEGY_BUSY"
        );
        require!(
            amount.0 > 0 && amount.0 <= p.principal,
            "INSUFFICIENT_PRINCIPAL"
        );
        self.operation += 1;
        let id = self.operation;
        p.principal -= amount.0;
        p.redemption = Some((id, amount.0));
        Promise::new(self.asset.clone())
            .function_call(
                "ft_transfer",
                serde_json::to_vec(
                    &json!({"receiver_id":wallet,"amount":amount,"memo":"Everkeep redemption"}),
                )
                .unwrap(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(20),
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_redemption",
                serde_json::to_vec(&json!({"wallet":wallet,"id":U64(id)})).unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(15),
            ))
    }
    #[private]
    pub fn on_redemption(&mut self, wallet: AccountId, id: U64) -> bool {
        let Some(p) = self.positions.get_mut(&wallet) else {
            return false;
        };
        let Some((expected, amount)) = p.redemption else {
            return false;
        };
        if expected != id.0 {
            return false;
        }
        let ok = env::promise_result_checked(0, 256).is_ok();
        if !ok {
            p.principal += amount;
        }
        p.redemption = None;
        ok
    }
    pub fn position(&self, wallet: AccountId) -> serde_json::Value {
        let p = self.positions.get(&wallet);
        json!({"principal":U128(p.map(|p|p.principal).unwrap_or(0)),"reserve":U128(self.reserve),"simulated":true})
    }
}
