import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SandboxAccount } from "./harness.js";
type Claim = { phase: "started" | "transferring" | "completed"; hash?: string };
/** Restricted distribution of the project's existing test-token reserve; never a wallet signer. */
export class TestnetFaucet {
  readonly directory = join(homedir(), ".local/share/everkeep/testnet-faucet");
  constructor(
    readonly operator: SandboxAccount,
    readonly deployment: { asset: string; code_hashes: Record<string, string> },
  ) {}
  async grant(account: string) {
    if (!/^([a-z0-9_-]+\.)+testnet$/.test(account) || account.length > 64)
      throw new Error("Compte testnet valide requis.");
    if ((await this.operator.rpc("status", [])).chain_id !== "testnet")
      throw new Error("TESTNET_ONLY");
    await this.operator.getAccount(account).accountView();
    const token = this.operator.getAccount(this.deployment.asset),
      state = await token.accountView();
    if (state.code_hash !== this.deployment.code_hashes[this.deployment.asset])
      throw new Error("Contrat demoUSD différent de la configuration.");
    const block = await this.operator.rpc("block", { finality: "final" }),
      day = (
        BigInt(block.header.timestamp_nanosec) /
        (86400n * 1_000_000_000n)
      ).toString(),
      file = join(this.directory, day + ".json");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let claims: Record<string, Claim> = {};
    try {
      claims = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Registre de distribution indisponible.");
    }
    const save = async () => {
        await writeFile(file + ".tmp", JSON.stringify(claims), { mode: 0o600 });
        await rename(file + ".tmp", file);
      },
      balance = BigInt(
        await token.view<string>("ft_balance_of", { account_id: account }),
      ),
      target = 100_000_000n;
    if (claims[account]?.phase === "completed")
      return {
        network: "testnet",
        account,
        balance: balance.toString(),
        alreadyClaimed: true,
        transaction: claims[account].hash || null,
      };
    if (balance >= target) {
      claims[account] = { phase: "completed" };
      await save();
      return {
        network: "testnet",
        account,
        balance: balance.toString(),
        alreadyFunded: true,
      };
    }
    if (claims[account]?.phase === "transferring")
      throw new Error(
        "Distribution déjà engagée : résultat à vérifier, aucun second transfert.",
      );
    if (!claims[account] && Object.keys(claims).length >= 10)
      throw new Error(
        "Quota de démonstration atteint : dix comptes par jour. Réessayez demain.",
      );
    claims[account] = { phase: "started" };
    await save();
    const bounds = await token.view<{ min: string }>("storage_balance_bounds");
    await this.operator.call(
      token,
      "storage_deposit",
      { account_id: account, registration_only: true },
      { attachedDeposit: BigInt(bounds.min), gas: 30_000_000_000_000n },
    );
    if ((await this.operator.rpc("status", [])).chain_id !== "testnet")
      throw new Error("TESTNET_ONLY");
    claims[account] = { phase: "transferring" };
    await save();
    const r = await this.operator.callRaw(
      token,
      "ft_transfer",
      {
        receiver_id: account,
        amount: (target - balance).toString(),
        memo: "Everkeep demonstration faucet; no investment authority",
      },
      { attachedDeposit: 1n, gas: 30_000_000_000_000n },
    );
    claims[account].hash = r.result.transaction.hash;
    await save();
    if (r.failed || r.receiptFailures.length)
      throw new Error(
        "Distribution refusée : consultez les reçus avant reprise.",
      );
    const after = await token.view<string>("ft_balance_of", {
      account_id: account,
    });
    if (BigInt(after) < target)
      throw new Error(
        "Solde non confirmé, aucun nouveau transfert automatique.",
      );
    claims[account].phase = "completed";
    await save();
    return {
      network: "testnet",
      account,
      balance: after,
      transaction: r.result.transaction.hash,
    };
  }
}
