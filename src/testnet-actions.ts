import { recoverSale } from "../packages/shared/sale-recovery";
import {
  authorize,
  envelope,
  recipientProof,
  b64,
  units,
  type Snapshot,
  type Action,
  verifyPair,
} from "../packages/shared/index";
import { view, rpc } from "./client";
import {
  walletCall,
  currentDeployment,
  connectedAccount,
} from "./testnet-network";
import {
  requestVault,
  positionKey,
  createPositionKey,
  requestKeyBackup,
} from "./key-vault";
type Command = {
  action: string;
  position?: string;
  id?: string;
  amount?: string;
  expected_amount?: string;
  expected_beneficiary?: string;
};
export async function testnetSnapshot(position: string) {
  const d = currentDeployment();
  if (!d) throw new Error("Modèle non configuré.");
  if (
    !position.endsWith("." + d.collection) ||
    position.slice(0, -d.collection.length - 1).includes(".")
  )
    throw new Error("Compte hors de la collection autorisée.");
  const b = await rpc("block", { finality: "final" }),
    [s, n] = await Promise.all([
      view(position, "snapshot", {}, b.header.hash),
      view(d.collection, "nft_token", { token_id: position }, b.header.hash),
    ]);
  return verifyPair(d.collection, position, s, n, true);
}
export async function signedPosition(
  s: Snapshot,
  action: Action,
  next?: Awaited<ReturnType<typeof createPositionKey>>,
) {
  const owner = await connectedAccount();
  if (owner !== s.owner_id)
    throw new Error("Le propriétaire connecté a changé.");
  await requestVault(owner);
  const keys = await positionKey(owner, s.account_id, s.public_key);
  try {
    const b = await rpc("block", { finality: "final" }),
      current = await view(s.account_id, "snapshot", {}, b.header.hash);
    if (
      current.owner_id !== s.owner_id ||
      current.public_key !== s.public_key ||
      current.nonce !== s.nonce ||
      current.ownership_epoch !== s.ownership_epoch ||
      current.key_version !== s.key_version
    )
      throw new Error("La position a changé. Relisez-la avant de signer.");
    return await walletCall(
      s.account_id,
      "execute",
      authorize(
        keys,
        envelope(
          current,
          action,
          (BigInt(b.header.timestamp_nanosec) + 600_000_000_000n).toString(),
        ),
        next,
      ),
    );
  } finally {
    keys.secretKey.fill(0);
  }
}
export async function executeTestnetCommand(c: Command) {
  const d = currentDeployment(),
    owner = await connectedAccount();
  if (!d || !owner || !c.position)
    throw new Error("Wallet ou position manquant.");
  if (c.action === "resume") {
    if (
      !c.id ||
      !c.position.endsWith("." + d.collection) ||
      c.position.slice(0, -d.collection.length - 1).includes(".")
    )
      throw new Error("Annonce de la collection officielle requise.");
    const read = async () =>
      view(
        d.collection,
        "listing",
        { position: c.position, id: c.id },
        (await rpc("block", { finality: "final" })).header.hash,
      );
    return recoverSale(
      read,
      (method) =>
        walletCall(d.collection, method, { position: c.position, id: c.id }),
      async (sale) => {
        const received = await testnetSnapshot(c.position!);
        if (received.owner_id !== sale.buyer)
          throw new Error(
            "Le NFT et son propriétaire ne sont pas encore synchronisés.",
          );
        const key = "everkeep.buy.v1:" + owner + ":" + c.position + ":" + c.id,
          prior = JSON.parse(localStorage.getItem(key) || "null");
        if (
          owner === sale.buyer &&
          prior?.publicKey &&
          received.public_key !== prior.publicKey
        )
          throw new Error("Clé destinataire différente de votre consentement.");
        if (prior && owner === sale.buyer)
          localStorage.setItem(
            key,
            JSON.stringify({ ...prior, phase: "settled" }),
          );
      },
    );
  }
  const s = await testnetSnapshot(c.position),
    block = await rpc("block", { finality: "final" }),
    now = BigInt(block.header.timestamp_nanosec);
  if (["resume", "expire", "claim_sale"].includes(c.action)) {
    if (!c.id) throw new Error("Annonce requise.");
    return walletCall(
      d.collection,
      c.action === "resume"
        ? "resume_sale"
        : c.action === "expire"
          ? "expire_listing"
          : "claim_sale",
      { position: c.position, id: c.id },
    );
  }
  if (c.action === "buy") {
    const sale = await view(
      d.collection,
      "listing",
      { position: c.position, id: c.id },
      block.header.hash,
    );
    if (
      sale.state !== "Active" ||
      !c.amount ||
      units(c.amount).toString() !== sale.price ||
      sale.seller !== s.owner_id ||
      sale.seller === owner ||
      s.sale?.id !== sale.id ||
      now >= BigInt(sale.expires_at) ||
      s.status !== "SaleLocked"
    )
      throw new Error("Annonce expirée, incohérente ou détenue par ce compte.");
    const storageId =
        "everkeep.buy.v1:" + owner + ":" + s.account_id + ":" + sale.id,
      prior = JSON.parse(localStorage.getItem(storageId) || "null");
    if (prior?.phase === "paying")
      throw new Error(
        "Un paiement est déjà engagé. Suivez le règlement ; aucun second achat n’est envoyé.",
      );
    await requestVault(owner);
    let publicKey = prior?.publicKey;
    if (!publicKey) {
      const fresh = await createPositionKey(owner, s.account_id);
      publicKey = b64(fresh.publicKey);
      fresh.secretKey.fill(0);

      await requestKeyBackup(owner);
      localStorage.setItem(
        storageId,
        JSON.stringify({ phase: "prepared", publicKey }),
      );
    }
    const keys = await positionKey(owner, s.account_id, publicKey);
    try {
      await walletCall(
        s.account_id,
        "register_recipient",
        recipientProof(keys, s, owner, (now + 900_000_000_000n).toString()),
        "100000000000000000000000",
      );
    } finally {
      keys.secretKey.fill(0);
    }
    const freshSale = await view(
      d.collection,
      "listing",
      { position: c.position, id: c.id },
      (await rpc("block", { finality: "final" })).header.hash,
    );
    if (
      freshSale.state !== "Active" ||
      freshSale.price !== sale.price ||
      freshSale.valuation_hash !== sale.valuation_hash
    )
      throw new Error(
        "L’annonce a changé après votre consentement. Achat interrompu.",
      );
    localStorage.setItem(
      storageId,
      JSON.stringify({ phase: "paying", publicKey, price: sale.price }),
    );
    await walletCall(
      d.asset,
      "ft_transfer_call",
      {
        receiver_id: d.collection,
        amount: sale.price,
        msg: JSON.stringify({
          position: c.position,
          id: sale.id,
          valuation_hash: sale.valuation_hash,
        }),
      },
      "1",
    );
    let settled = await view(
      d.collection,
      "listing",
      { position: c.position, id: c.id },
      (await rpc("block", { finality: "final" })).header.hash,
    );
    if (["Settling", "Resolving", "AwaitingIndex"].includes(settled.state)) {
      await walletCall(d.collection, "resume_sale", {
        position: c.position,
        id: c.id,
      });
      settled = await view(
        d.collection,
        "listing",
        { position: c.position, id: c.id },
        (await rpc("block", { finality: "final" })).header.hash,
      );
    }
    if (settled.state !== "Settled")
      throw new Error(
        "Règlement " +
          settled.state +
          " : consultez le suivi et la créance éventuelle, sans racheter.",
      );
    await walletCall(d.collection, "release_settled", {
      position: c.position,
      id: c.id,
    });
    const received = await testnetSnapshot(c.position);
    if (received.owner_id !== owner || received.public_key !== publicKey)
      throw new Error(
        "Le NFT et la nouvelle clé ne sont pas encore confirmés ensemble.",
      );
    localStorage.setItem(
      storageId,
      JSON.stringify({ phase: "settled", publicKey }),
    );
    return;
  }
  if (s.owner_id !== owner) throw new Error("Propriétaire courant requis.");
  switch (c.action) {
    case "revoke":
      return signedPosition(s, "Revoke");
    case "cancel_agent":
      return signedPosition(s, "CancelSubscription");
    case "withdraw":
      if (c.expected_amount !== s.available || c.expected_beneficiary !== owner)
        throw new Error("Montant ou bénéficiaire modifié.");
      return signedPosition(s, {
        Withdraw: { asset: s.asset, amount: s.available, beneficiary: owner },
      });
    case "redeem":
      if (c.expected_amount !== s.principal)
        throw new Error("Principal modifié.");
      return signedPosition(s, {
        Redeem: { asset: s.asset, amount: s.principal },
      });
    case "list": {
      const price = units(c.amount || "0").toString(),
        expires_at = [
          now + 3_600_000_000_000n,
          BigInt(s.series?.terms.matures_at || "0") - 1n,
        ]
          .reduce((a, b) => (a < b ? a : b))
          .toString();
      const q = await view(
        s.account_id,
        "sale_quote",
        { price, expires_at },
        block.header.hash,
      );
      return signedPosition(s, {
        List: {
          id: q.id,
          price,
          payment_token: s.asset,
          expires_at,
          valuation_hash: q.valuation_hash,
        },
      });
    }
    case "cancel":
      if (!s.sale) throw new Error("Aucune annonce active.");
      return signedPosition(s, { CancelListing: { id: s.sale.id } });
    case "rotate": {
      await requestVault(owner);
      const next = await createPositionKey(owner, s.account_id);
      try {

        await requestKeyBackup(owner);
        return await signedPosition(
          s,
          { Rotate: { public_key: b64(next.publicKey) } },
          next,
        );
      } finally {
        next.secretKey.fill(0);
      }
    }
    case "claim_subscription":
      return walletCall(d.collection, "claim_subscription", {
        position: s.account_id,
      });
    default:
      throw new Error(
        "Cette opération n’est pas activée sur testnet. Aucun mandat ni paiement supplémentaire n’a été envoyé.",
      );
  }
}
