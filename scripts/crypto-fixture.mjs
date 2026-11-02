import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { mkdir, writeFile } from "node:fs/promises";
const k = ml_dsa65.keygen();
const message = Buffer.from("EVERKEEP_REAL_ML_DSA65_FEASIBILITY_V1");
const sig = ml_dsa65.sign(message, k.secretKey);
k.secretKey.fill(0);
await mkdir("contracts/wallet/fixtures", { recursive: true });
await writeFile(
  "contracts/wallet/fixtures/ml-dsa65.json",
  JSON.stringify({
    public_key: Buffer.from(k.publicKey).toString("base64"),
    signature: Buffer.from(sig).toString("base64"),
    message: message.toString("base64"),
  }),
);
