/** Enumeration is discovery only. The wallet/NFT pair must still be verified on open. */
export function parseOwnedPlans(
  value: unknown,
  owner: string,
  collection: string,
): string[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error("Réponse NFT invalide.");
  const ids = value.map((token) => {
    if (
      !token ||
      typeof token.token_id !== "string" ||
      token.owner_id !== owner ||
      !token.token_id.endsWith("." + collection) ||
      token.token_id.split(".").length !== collection.split(".").length + 1 ||
      !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(
        token.token_id.slice(0, -collection.length - 1),
      ) ||
      token.token_id.length > 64
    )
      throw new Error(
        "La réponse contient un NFT étranger au compte ou à la collection.",
      );
    return token.token_id;
  });
  if (new Set(ids).size !== ids.length)
    throw new Error("Réponse NFT dupliquée.");
  return ids;
}
