import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recoverSale,
  type RecoveryMethod,
} from "../packages/shared/sale-recovery.js";
test("lost release response resumes a settled purchase without replaying price or settlement", async () => {
  let state = "AwaitingIndex",
    fail = true,
    verified = 0;
  const sent: RecoveryMethod[] = [];
  const read = async () => ({ state }),
    send = async (method: RecoveryMethod) => {
      sent.push(method);
      if (method === "resume_sale") state = "Settled";
      if (method === "release_settled" && fail) {
        fail = false;
        throw new Error("response lost");
      }
    },
    verify = async () => {
      verified++;
    };
  await assert.rejects(recoverSale(read, send, verify), /response lost/);
  assert.equal(verified, 0);
  await recoverSale(read, send, verify);
  assert.deepEqual(sent, ["resume_sale", "release_settled", "release_settled"]);
  assert.equal(verified, 1);
});
test("active or uncertain purchases cannot become speculative refunds", async () => {
  for (const state of ["Active", "Resolving"]) {
    const sent: RecoveryMethod[] = [];
    await assert.rejects(
      recoverSale(
        async () => ({ state }),
        async (m) => {
          sent.push(m);
        },
        async () => assert.fail("must not confirm"),
      ),
    );
    assert.deepEqual(sent, state === "Active" ? [] : ["resume_sale"]);
  }
  let sent: RecoveryMethod[] = [];
  await recoverSale(
    async () => ({ state: "RefundClaimable" }),
    async (m) => {
      sent.push(m);
    },
    async () => assert.fail("not a purchase confirmation"),
  );
  assert.deepEqual(sent, ["release_cancelled"]);
});
