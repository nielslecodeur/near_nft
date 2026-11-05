use near_sdk::json_types::{Base64VecU8, U64, U128};
use near_sdk::{AccountId, near};

/// Fixed before opening. A transfer never replaces these terms.
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Series {
    pub id: String,
    pub name: String,
    pub opens_at: U64,
    pub closes_at: U64,
    pub matures_at: U64,
    pub asset: AccountId,
    pub strategy: AccountId,
    pub capacity: U128,
    pub minimum: U128,
    pub allocation_bps: u16,
    pub max_operation: U128,
    pub max_period: U128,
    pub version: U64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct SeriesRules {
    pub terms: Series,
    pub mandate_hash: Base64VecU8,
}
