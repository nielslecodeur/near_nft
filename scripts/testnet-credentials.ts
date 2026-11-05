import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, relative, isAbsolute, join } from "node:path";
export const credentialDirectory = join(
  homedir(),
  ".near-credentials",
  "testnet",
);
export async function testnetCredential(file?: string) {
  const path = resolve(
    file ||
      process.env.NEAR_CREDENTIAL_FILE ||
      join(credentialDirectory, "everkeep-deployer.json"),
  );
  const rel = relative(process.cwd(), path);
  if (!rel.startsWith("..") && !isAbsolute(rel))
    throw new Error("Les credentials testnet doivent rester hors du dépôt.");
  const c = JSON.parse(await readFile(path, "utf8"));
  if (
    typeof c.account_id !== "string" ||
    !c.account_id.endsWith(".testnet") ||
    typeof c.private_key !== "string"
  )
    throw new Error("Credential testnet invalide.");
  return {
    credential: c as {
      account_id: string;
      public_key: string;
      private_key: string;
    },
    path,
  };
}
