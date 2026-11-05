export type SeriesTerms = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  matures_at: string;
  asset: string;
  strategy: string;
  capacity: string;
  minimum: string;
  allocation_bps: number;
  max_operation: string;
  max_period: string;
  version: string;
};
export type SeriesRules = { terms: SeriesTerms; mandate_hash: string };
export type Listing = {
  valuation_at?: string | null;
  claim?: {
    beneficiary: string;
    amount: string;
    state: "Claimable" | "Paying" | "Paid";
    attempt: string;
  } | null;
  position: string;
  id: string;
  seller: string;
  buyer: string | null;
  price: string;
  expires_at: string;
  valuation_hash: string;
  available: string;
  principal: string;
  ownership_epoch: string;
  state: string;
};
