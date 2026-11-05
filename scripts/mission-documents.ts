import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  stableJSON,
  type MissionDocument,
} from "../packages/shared/missions.js";
export const hash = (data: string) =>
  createHash("sha256").update(data).digest("base64");
export const requestCommitment = (document: MissionDocument) =>
  hash(
    stableJSON([
      "EVERKEEP_PRIVATE_REQUEST_V1",
      document.salt,
      document.request,
    ]),
  );
/** Capability is a bearer secret, only retained in the caller's browser. Ciphertext survives local disk reads. */
export class MissionDocuments {
  private directory: Promise<string> = mkdtemp(
    join(tmpdir(), "everkeep-missions-"),
  );
  private entries = new Map<string, { owner: string; capHash: Buffer }>();
  private check(id: string, owner: string, cap: string) {
    const entry = this.entries.get(id);
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(cap) ||
      !entry ||
      entry.owner !== owner ||
      !timingSafeEqual(entry.capHash, createHash("sha256").update(cap).digest())
    )
      throw new Error(
        "Accès privé refusé. Retrouvez la capacité de cette mission dans ce navigateur.",
      );
  }
  async create(
    id: string,
    owner: string,
    cap: string,
    document: MissionDocument,
  ) {
    if (
      !/^[A-Za-z0-9-]{16,64}$/.test(id) ||
      this.entries.has(id) ||
      this.entries.size >= 1000 ||
      !/^[A-Za-z0-9_-]{43}$/.test(cap)
    )
      throw new Error("Identifiant ou capacité invalide.");
    this.entries.set(id, {
      owner,
      capHash: createHash("sha256").update(cap).digest(),
    });
    await this.write(id, owner, cap, document);
  }
  async read(id: string, owner: string, cap: string): Promise<MissionDocument> {
    this.check(id, owner, cap);
    const data = await readFile(join(await this.directory, id));
    const dec = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(`EVERKEEP_DOCUMENT_V1:${id}:${cap}`).digest(),
      data.subarray(0, 12),
    );
    dec.setAAD(Buffer.from(owner));
    dec.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([dec.update(data.subarray(28)), dec.final()]).toString(
        "utf8",
      ),
    );
  }
  async write(
    id: string,
    owner: string,
    cap: string,
    document: MissionDocument,
  ) {
    this.check(id, owner, cap);
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        createHash("sha256")
          .update(`EVERKEEP_DOCUMENT_V1:${id}:${cap}`)
          .digest(),
        iv,
      );
    cipher.setAAD(Buffer.from(owner));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(document)),
      cipher.final(),
    ]);
    await writeFile(
      join(await this.directory, id),
      Buffer.concat([iv, cipher.getAuthTag(), bytes]),
      { mode: 0o600 },
    );
  }
}
