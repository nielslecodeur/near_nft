import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { KeyPair } from "near-api-js";
import { SandboxAccount } from "./harness.js";

const exec = promisify(execFile);
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Port unavailable");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
export async function startChain() {
  const home = homedir() + "/.cache/everkeep-sandbox-" + Date.now();
  const binary =
    process.env.NEAR_SANDBOX_BIN_PATH ||
    homedir() + "/.near/sandbox/near-sandbox";
  await mkdir(home, { recursive: true });
  await mkdir(".research", { recursive: true });
  await writeFile(".research/current-sandbox.txt", home);
  // Follow near-sandbox-rs: official fast init, ordinary funded genesis signer distinct from validator.
  await exec(binary, ["--home", home, "init", "--fast"]);
  const genesis = JSON.parse(await readFile(home + "/genesis.json", "utf8"));
  const key = KeyPair.fromRandom("ed25519"),
    balance = 10_000n * 10n ** 24n;
  genesis.records.push({
    Account: {
      account_id: "sandbox",
      account: {
        amount: balance.toString(),
        locked: "0",
        code_hash: "11111111111111111111111111111111",
        storage_usage: 182,
        version: "V1",
      },
    },
  });
  genesis.records.push({
    AccessKey: {
      account_id: "sandbox",
      public_key: key.getPublicKey().toString(),
      access_key: { nonce: 0, permission: "FullAccess" },
    },
  });
  genesis.total_supply = (BigInt(genesis.total_supply) + balance).toString();
  await writeFile(home + "/genesis.json", JSON.stringify(genesis));
  const rpcPort = await port(),
    netPort = await port(),
    rpcAddr = "http://127.0.0.1:" + rpcPort;
  const cfg = JSON.parse(await readFile(home + "/config.json", "utf8"));
  const node = JSON.parse(await readFile(home + "/node_key.json", "utf8"));
  cfg.network.public_addrs = [`${node.public_key}@127.0.0.1:${netPort}`];
  cfg.network.allow_private_ip_in_public_addrs = true;
  cfg.network.trusted_stun_servers = [];
  cfg.consensus.min_num_peers = 0;
  cfg.store.max_open_files = 3000;
  await writeFile(home + "/config.json", JSON.stringify(cfg));
  const output = createWriteStream(home + "/sandboxServer.log");
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    RUST_LOG: process.env.NEAR_SANDBOX_LOG || "info",
  };
  if (process.env.EVERKEEP_SANDBOX_CLOCK_LIBRARY)
    runtimeEnv.LD_PRELOAD = process.env.EVERKEEP_SANDBOX_CLOCK_LIBRARY;
  const child = spawn(
    binary,
    [
      "--home",
      home,
      "run",
      "--rpc-addr",
      `127.0.0.1:${rpcPort}`,
      "--network-addr",
      `127.0.0.1:${netPort}`,
    ],
    { env: runtimeEnv, stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.pipe(output);
  const close = async () => {
    if (child.exitCode === null) {
      child.kill("SIGINT");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
    output.end();
  };
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw new Error(
          "Sandbox stopped: " +
            (await readFile(home + "/sandboxServer.log", "utf8")),
        );
      try {
        const status = await (
          await fetch(rpcAddr + "/status", {
            signal: AbortSignal.timeout(1000),
          })
        ).json();
        if (status.protocol_version >= 87) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (!ready)
      throw new Error(
        "Sandbox start timeout; log: " + home + "/sandboxServer.log",
      );
    console.log("Sandbox réelle démarrée :", rpcAddr);
    return {
      rootAccount: new SandboxAccount("sandbox", rpcAddr, key),
      tearDown: close,
      rpcAddr,
      home,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
