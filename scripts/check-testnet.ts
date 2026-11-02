import { mkdir, writeFile } from "node:fs/promises";
const endpoint = process.env.NEAR_TESTNET_RPC ?? "https://rpc.testnet.near.org";
const status = await (await fetch(endpoint + "/status")).json();
if (status.chain_id !== "testnet" || status.protocol_version < 87)
  throw new Error("Testnet protocol >=87 required");
await mkdir("docs/results", { recursive: true });
await writeFile(
  "docs/results/testnet-capability.json",
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      endpoint,
      chain_id: status.chain_id,
      version: status.version,
      protocol_version: status.protocol_version,
      verification: "RPC capability only; no contract deployed or executed",
    },
    null,
    2,
  ),
);
console.log(
  `Testnet protocole ${status.protocol_version}. Primitive ML-DSA attendue ; ce contrôle ne remplace pas une exécution du contrat.`,
);
