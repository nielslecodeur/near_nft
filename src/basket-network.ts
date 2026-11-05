import { rpc, view } from "./client";
import { currentDeployment } from "./testnet-network";
import { parseOwnedPlans } from "../packages/shared/wallet";
import { verifyPair, type Snapshot } from "../packages/shared/index";
import { validateBasketPosition } from "../packages/shared/baskets";

export async function verifiedBasketCollection(block: string) {
  const d = currentDeployment(),
    b = d?.baskets;
  if (
    !d ||
    !b ||
    !b.collection.endsWith(".testnet") ||
    b.protocol !== "everkeep-fictional-v1"
  )
    throw Error("Catalogue thématique non déployé sur testnet.");
  const [a, k, p] = await Promise.all([
    rpc("query", {
      request_type: "view_account",
      account_id: b.collection,
      block_id: block,
    }),
    rpc("query", {
      request_type: "view_access_key_list",
      account_id: b.collection,
      block_id: block,
    }),
    view(b.collection, "basket_protocol", {}, block),
  ]);
  if (
    a.code_hash !== b.code_hash ||
    k.keys.length ||
    p.protocol !== b.protocol ||
    p.asset !== d.asset ||
    p.strategy !== d.strategy ||
    !p.no_series ||
    !p.admin_disabled
  )
    throw Error("Contrat thématique non conforme : dépôt bloqué.");
  return b;
}
export async function readBasketPosition(
  account: string,
  block: string,
): Promise<Snapshot> {
  const d = currentDeployment(),
    b = await verifiedBasketCollection(block);
  const [s, t, a, k] = await Promise.all([
    view(account, "snapshot", {}, block),
    view(b.collection, "nft_token", { token_id: account }, block),
    rpc("query", {
      request_type: "view_account",
      account_id: account,
      block_id: block,
    }),
    rpc("query", {
      request_type: "view_access_key_list",
      account_id: account,
      block_id: block,
    }),
  ]);
  verifyPair(b.collection, account, s, t, true);
  if (
    a.code_hash !== b.wallet_code_hash ||
    k.keys.length ||
    s.asset !== d!.asset ||
    s.series ||
    !s.basket_required
  )
    throw Error("Compte thématique non conforme.");
  if (s.basket) validateBasketPosition(s.basket);
  if (s.funded && !s.basket)
    throw Error("Position financée sans panier vérifiable.");
  return s;
}
export async function readBasketPositions(owner: string, block: string) {
  const b = await verifiedBasketCollection(block),
    result: Snapshot[] = [];
  if (!owner) return result;
  for (let offset = 0; offset < 1000; offset += 20) {
    const page = parseOwnedPlans(
      await view(
        b.collection,
        "nft_tokens_for_owner",
        { account_id: owner, from_index: String(offset), limit: 20 },
        block,
      ),
      owner,
      b.collection,
    );
    result.push(
      ...(await Promise.all(page.map((id) => readBasketPosition(id, block)))),
    );
    if (page.length < 20) return result;
  }
  throw Error(
    "Plus de 1000 positions thématiques : lecture complète indisponible.",
  );
}
