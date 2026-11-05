import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MissionDocument } from "../packages/shared/missions.js";
type Record = {
  owner: string;
  capHash: string;
  iv: string;
  tag: string;
  ciphertext: string;
};
export class PersistentMissionDocuments {
  constructor(
    readonly directory = join(
      homedir(),
      ".local/share/everkeep/testnet-missions",
    ),
  ) {}
  private path(id: string) {
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(id)) throw new Error("MISSION_ID");
    return join(this.directory, id + ".json");
  }
  private cap(cap: string) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(cap))
      throw new Error("PRIVATE_CAPABILITY_REQUIRED");
    return createHash("sha256").update(cap).digest();
  }
  async exists(id: string) {
    try {
      await readFile(this.path(id));
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
  }
  async read(id: string, owner: string, cap: string): Promise<MissionDocument> {
    const hash = this.cap(cap),
      r: Record = JSON.parse(await readFile(this.path(id), "utf8"));
    if (
      r.owner !== owner ||
      !timingSafeEqual(hash, Buffer.from(r.capHash, "base64"))
    )
      throw new Error("PRIVATE_ACCESS_DENIED");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256")
        .update("EVERKEEP_TESTNET_DOCUMENT_V1:" + id + ":" + cap)
        .digest(),
      Buffer.from(r.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(owner));
    decipher.setAuthTag(Buffer.from(r.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(r.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
  async write(id: string, owner: string, cap: string, doc: MissionDocument) {
    const capHash = this.cap(cap);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (await this.exists(id)) await this.read(id, owner, cap);
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        createHash("sha256")
          .update("EVERKEEP_TESTNET_DOCUMENT_V1:" + id + ":" + cap)
          .digest(),
        iv,
      );
    cipher.setAAD(Buffer.from(owner));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(doc)),
      cipher.final(),
    ]);
    const r: Record = {
      owner,
      capHash: capHash.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    const target = this.path(id),
      temp = target + ".tmp";
    await writeFile(temp, JSON.stringify(r), { mode: 0o600 });
    await rename(temp, target);
  }
}
