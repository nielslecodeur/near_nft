/** Future adapter boundary. This interface grants no on-chain authority.
 * A production integration requires a separately reviewed wallet route.
 */
export interface StrategyAdapter {
  readonly assetId: string;
  readonly strategyId: string;
  readPosition(walletId: string): Promise<{
    principal: string;
    redeemable: string;
    observedAtBlock: string;
  }>;
  proposeAllocation(amount: string): {
    asset: string;
    strategy: string;
    amount: string;
  };
  proposeRedemption(amount: string): {
    Redeem: { asset: string; amount: string };
  };
}
