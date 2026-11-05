type Sale = { state: string };
export type RecoveryMethod =
  "resume_sale" | "release_settled" | "release_cancelled";
/** Only reconciliation/release methods can be sent: this path cannot collect a purchase price. */
export async function recoverSale<T extends Sale>(
  read: () => Promise<T>,
  send: (method: RecoveryMethod) => Promise<unknown>,
  verify: (sale: T) => Promise<void>,
) {
  let sale = await read();
  if (["Settling", "Resolving", "AwaitingIndex"].includes(sale.state)) {
    await send("resume_sale");
    sale = await read();
  }
  if (sale.state === "Settled") {
    await send("release_settled");
    await verify(sale);
    return;
  }
  if (["Cancelled", "RefundClaimable"].includes(sale.state)) {
    await send("release_cancelled");
    return;
  }
  throw new Error(
    "Règlement " +
      sale.state +
      " : aucun nouveau paiement envoyé. Relisez les reçus avant toute reprise.",
  );
}
