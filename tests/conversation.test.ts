import { test } from "node:test";
import assert from "node:assert/strict";
import { understand } from "../packages/agent/conversation.js";
test("phrase becomes exact request with reserve and expertise", () => {
  const r = understand(
    "J’ai 100 demoUSD, garder 30 disponibles, je peux attendre 30 jours et l’échéance.",
  );
  assert.equal(r.status, "ready");
  assert.equal(r.request!.amount, "100");
  assert.equal(r.request!.reserveMinimum, "30");
  assert.equal(r.request!.horizonDays, 30);
  assert.equal(r.request!.liquidity, "at-maturity");
});
test("follow-up only asks missing data and remembers earlier answers", () => {
  let r = understand("J’ai 50 demoUSD");
  assert.match(r.message, /combien de jours/);
  r = understand("30 jours", r.draft, r.expert);
  assert.match(r.message, /échéance/);
  assert.equal(r.draft.amount, "50");
  r = understand("J’accepte l’échéance", r.draft, r.expert);
  assert.equal(r.status, "ready");
  assert.equal(r.request!.horizonDays, 30);
  const reserved = understand("Garder 15 demoUSD, 30 jours à échéance", {
    amount: "50",
  });
  assert.equal(reserved.request!.amount, "50");
  assert.equal(reserved.request!.reserveMinimum, "15");
});
test("unsupported crypto, locked liquidity and guarantees abstain before charging", () => {
  for (const text of [
    "J’ai 100 demoUSD. Je veux une position crypto, garder 30 et éviter les stratégies verrouillées.",
    "50 demoUSD, disponibles immédiatement",
    "J’ai 40 demoUSD et je veux un capital garanti",
  ]) {
    assert.equal(understand(text).status, "incompatible");
  }
});
test("manual expertise stays selected; foreign assets and secrets are not requests", () => {
  assert.equal(
    understand(
      "J’ai 30 demoUSD, 30 jours à échéance, analyse crypto",
      {},
      "tradfi",
      true,
    ).expert,
    "tradfi",
  );
  assert.equal(understand("J’ai 10 NEAR").status, "incompatible");
  assert.throws(() => understand("ed25519:aaaaaaaaaa"));
});
