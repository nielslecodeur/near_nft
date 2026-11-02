import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  ml_dsa65,
  initProof,
  recipientProof,
  authorize,
  b64,
  type Keys,
} from "../packages/shared/index.js";

const [command, label, input] = process.argv.slice(2);
if (
  !label ||
  !/^[a-z0-9-]{1,40}$/.test(label) ||
  !["generate", "init", "recipient", "sign", "pop"].includes(command)
)
  throw new Error(
    "Usage: npm run sign -- generate|init|recipient|sign|pop label [request.json]",
  );
const passphrase = process.env.EVERKEEP_PASSPHRASE;
if (!passphrase || passphrase.length < 16)
  throw new Error(
    "Définissez EVERKEEP_PASSPHRASE (16 caractères minimum) dans votre session locale. Ne la mettez jamais dans Git.",
  );
await mkdir(".local/keys", { recursive: true });
const path = `.local/keys/${label}.json`;
if (command === "generate") {
  const keys = ml_dsa65.keygen(),
    salt = randomBytes(32),
    iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, salt, 32),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({
        secret: b64(keys.secretKey),
        public: b64(keys.publicKey),
      }),
    ),
    cipher.final(),
  ]);
  await writeFile(
    path,
    JSON.stringify({
      version: 1,
      kdf: "scrypt",
      salt: b64(salt),
      iv: b64(iv),
      tag: b64(cipher.getAuthTag()),
      ciphertext: b64(encrypted),
    }),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({ public_key: b64(keys.publicKey), encrypted_file: path }),
  );
} else {
  const vault = JSON.parse(await readFile(path, "utf8"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(passphrase, Buffer.from(vault.salt, "base64"), 32),
    Buffer.from(vault.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(vault.tag, "base64"));
  const material = JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(vault.ciphertext, "base64")),
      decipher.final(),
    ]).toString(),
  );
  const keys: Keys = {
    secretKey: Buffer.from(material.secret, "base64"),
    publicKey: Buffer.from(material.public, "base64"),
  };
  const request = JSON.parse(await readFile(input, "utf8"));
  if (command === "init") {
    if (request.network !== "testnet" && request.network !== "sandbox")
      throw new Error("Réseau interdit");
    console.log(
      JSON.stringify(
        initProof(
          keys,
          request.network,
          request.account,
          request.collection,
          request.owner,
        ),
      ),
    );
  } else if (command === "recipient") {
    if (!["testnet", "sandbox"].includes(request.snapshot.network))
      throw new Error("Réseau interdit");
    console.log(
      JSON.stringify(
        recipientProof(
          keys,
          request.snapshot,
          request.receiver,
          request.expires_at,
        ),
      ),
    );
  } else {
    if (
      request.protocol !== "EVERKEEP" ||
      request.version !== 1 ||
      !["sandbox", "testnet"].includes(request.network)
    )
      throw new Error("Domaine interdit");
    console.error(
      "Vérifiez les paramètres de cette autorisation avant de la transmettre :",
      JSON.stringify(request, null, 2),
    );
    if (command === "sign")
      console.log(JSON.stringify(authorize(keys, request)));
    else {
      const message = Buffer.concat([
        Buffer.from("EVERKEEP_POP_V1\0"),
        Buffer.from(JSON.stringify(request)),
      ]);
      console.log(
        JSON.stringify({
          public_key: b64(keys.publicKey),
          new_key_proof: b64(ml_dsa65.sign(message, keys.secretKey)),
        }),
      );
    }
  }
  keys.secretKey.fill(0);
}
