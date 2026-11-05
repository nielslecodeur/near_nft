//! Informative simulation only. This namespace NEVER credits token gains.
//! Kept outside the root Borsh state so existing accounts retain their layout.
use super::*;
const KEY: &[u8] = b"everkeep:basket:v1";
const Q: u128 = 100_000_000;
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Component {
    pub symbol: String, pub exchange: String, pub name: String,
    pub weight_bps: u16, pub base_price: U128, pub reason: String,
}
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Model {
    pub id: String, pub version: String, pub name: String, pub description: String,
    pub limits: String, pub risks: Vec<String>, pub art: String, pub components: Vec<Component>,
}
#[near(serializers = [json])]
pub struct Configuration { pub models: Vec<Model> }
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Lot { pub symbol: String, pub name: String, pub weight_bps: u16, pub quantity: U128, pub entry_price: U128 }
#[near(serializers = [json])]
#[derive(Clone)]
pub struct BasketPosition {
    pub model: Model, pub capital: U128, pub entry_day: U64, pub created_at: U64,
    pub source: String, pub mode: String, pub lots: Vec<Lot>, pub remainder: U128, pub closed_day: Option<U64>,
}
pub fn read() -> Option<BasketPosition> {
    env::storage_read(KEY).map(|v| serde_json::from_slice(&v).expect("BASKET_STATE"))
}
pub fn write(p: &BasketPosition) { env::storage_write(KEY, &serde_json::to_vec(p).unwrap()); }
pub fn price_day(now: u64) -> u64 {
    let mut d = now / DAY;
    require!((20454..=30000).contains(&d), "BASKET_CALENDAR_RANGE");
    while (d + 3) % 7 >= 5 { d -= 1; }
    d
}
pub fn price(c: &Component, index: usize, day: u64) -> u128 {
    c.base_price.0.checked_mul(9200 + u128::from((day + index as u64 * 3) % 17) * 100).unwrap() / 10000
}
pub fn prepare(id: String, version: String, capital: u128, day: u64, now: u64) -> BasketPosition {
    require!((1_000_000..=100_000_000_000).contains(&capital), "BASKET_AMOUNT_LIMIT");
    require!(day == price_day(now), "BASKET_STALE_PRICE");
    let config: Configuration = serde_json::from_str(include_str!("../../../packages/shared/baskets.v1.json")).unwrap();
    let model = config.models.into_iter().find(|m| m.id == id && m.version == version).expect("BASKET_UNKNOWN_VERSION");
    require!(model.components.len() == 5 && model.components.iter().map(|c| u32::from(c.weight_bps)).sum::<u32>() == 10000, "BASKET_WEIGHTS");
    let mut spent = 0;
    let lots = model.components.iter().enumerate().map(|(i,c)| {
        let p = price(c, i, day);
        let budget = capital.checked_mul(u128::from(c.weight_bps)).unwrap() / 10000;
        let quantity = budget.checked_mul(Q).unwrap() / p;
        spent += quantity.checked_mul(p).unwrap() / Q;
        Lot { symbol: c.symbol.clone(), name: c.name.clone(), weight_bps: c.weight_bps, quantity: U128(quantity), entry_price: U128(p) }
    }).collect();
    BasketPosition { model, capital: U128(capital), entry_day: U64(day), created_at: U64(now), source: "everkeep-fictional-v1".into(), mode: "fictional".into(), lots, remainder: U128(capital - spent), closed_day: None }
}
pub fn value(p: &BasketPosition, day: u64) -> u128 {
    p.lots.iter().zip(p.model.components.iter()).enumerate().fold(p.remainder.0, |v,(i,(l,c))| v.checked_add(l.quantity.0.checked_mul(price(c, i, day)).unwrap()/Q).unwrap())
}
#[near]
impl Wallet {
    pub fn basket_protocol(&self) -> String { "everkeep-fictional-v1".into() }
    pub fn basket_value(&self) -> serde_json::Value {
        let p = read().expect("BASKET_REQUIRED");
        let day = p.closed_day.unwrap_or(U64(price_day(env::block_timestamp())));
        json!({"day":day,"value":U128(value(&p,day.0)),"source":p.source,"mode":p.mode,"payable_gain":"0"})
    }
    pub(crate) fn bind_basket(&mut self, id: String, version: String, amount: U128, snapshot_day: U64) {
        require!(self.series.is_none() && self.deposits == 0 && self.principal == 0 && self.funding_permit.is_none() && self.policy.is_none(), "BASKET_NEW_ACCOUNT_ONLY");
        require!(self.network == "sandbox" || self.network == "testnet", "TEST_ONLY");
        write(&prepare(id,version,amount.0,snapshot_day.0,env::block_timestamp()));
    }
    pub(crate) fn close_basket(&mut self) {
        require!(self.deposits > 0 && self.principal == 0 && self.reserved == 0, "BASKET_UNFUNDED_OR_BUSY");
        let mut p = read().expect("BASKET_REQUIRED");
        require!(p.closed_day.is_none(), "BASKET_ALREADY_CLOSED");
        p.closed_day = Some(U64(price_day(env::block_timestamp())));
        write(&p);
        event("basket_closed",json!({"day":p.closed_day,"value":U128(value(&p,p.closed_day.unwrap().0)),"payable_gain":"0"}));
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn exact_entry_and_fixed_quantities() {
        let now = 20762 * DAY;
        for id in ["ai-infrastructure","space-robotics","energy-transition"] {
            let p = prepare(id.into(),"1".into(),100_000_001,price_day(now),now);
            assert_eq!(value(&p,p.entry_day.0),p.capital.0);
            let q = p.lots.iter().map(|l| l.quantity).collect::<Vec<_>>();
            assert!((0..18).any(|d| value(&p,p.entry_day.0+d)>p.capital.0));
            assert!((0..18).any(|d| value(&p,p.entry_day.0+d)<p.capital.0));
            assert_eq!(p.lots.iter().map(|l| l.quantity).collect::<Vec<_>>(),q);
        }
    }
    #[test] fn weekend_uses_same_snapshot() {
        assert_eq!(price_day(20764 * DAY),price_day(20763 * DAY));
    }
}
