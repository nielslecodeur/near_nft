import { ml_dsa65, b64, type Keys } from "../packages/shared/index";
type Cipher = { iv: string; ciphertext: string };
type Meta = { owner: string; salt: string; check: Cipher; version: 1 };
type StoredKey = {
  owner: string;
  position: string;
  keys: { publicKey: string; encrypted: Cipher }[];
};
const unlocked = new Map<string, CryptoKey>();
// Only encrypted records persist. Unlocked CryptoKeys and decrypted material remain in memory.
const sessionRecords = new Map<string, unknown>();
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("everkeep-private-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("records");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(new Error("Le stockage privé local est indisponible."));
  });
}
export async function privateRecord<T>(key: string): Promise<T | undefined> {
  if (sessionRecords.has(key)) return sessionRecords.get(key) as T;
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction("records", "readonly"),
      r = t.objectStore("records").get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("Lecture privée impossible."));
    t.oncomplete = () => d.close();
  });
}
export async function savePrivateRecord(key: string, value: unknown) {
  const v = value as any;
  const cipher = (c: any) =>
    typeof c?.iv === "string" && typeof c?.ciphertext === "string";
  if (
    !v?.owner ||
    !(
      (key === "meta:" + v.owner && cipher(v.check)) ||
      (key.startsWith("key:" + v.owner + ":") &&
        Array.isArray(v.keys) &&
        v.keys.every((k: any) => cipher(k.encrypted))) ||
      (key.startsWith("data:" + v.owner + ":") && cipher(v.encrypted)) ||
      (key.startsWith("mission:") && cipher(v))
    )
  )
    throw new Error(
      "Seuls des enregistrements chiffrés peuvent être conservés dans le coffre.",
    );
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction("records", "readwrite");
    t.objectStore("records").put(value, key);
    t.oncomplete = () => {
      d.close();
      resolve();
    };
    t.onerror = () => {
      d.close();
      reject(
        new Error(
          "Coffre non sauvegardé. Aucun financement avant réparation du stockage.",
        ),
      );
    };
    t.onabort = () => {
      d.close();
      reject(new Error("Sauvegarde du coffre interrompue."));
    };
  });
  sessionRecords.set(key, value);
}
export async function saveVaultData(owner: string, id: string, value: unknown) {
  const key = unlocked.get(owner);
  if (!key) throw new Error("Déverrouillez votre suivi privé.");
  await savePrivateRecord("data:" + owner + ":" + id, {
    owner,
    encrypted: await encrypt(key, value, owner + ":" + id),
  });
}
export async function vaultData<T>(
  owner: string,
  id: string,
): Promise<T | undefined> {
  const key = unlocked.get(owner);
  if (!key) throw new Error("Restaurez ou déverrouillez votre suivi privé.");
  const record = await privateRecord<{ owner: string; encrypted: Cipher }>(
    "data:" + owner + ":" + id,
  );
  return record
    ? decrypt<T>(key, record.encrypted, owner + ":" + id)
    : undefined;
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(password: string, salt: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 310000, salt: unb64(salt) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(
  key: CryptoKey,
  value: unknown,
  aad: string,
): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv: b64(iv), ciphertext: b64(new Uint8Array(result)) };
}
async function decrypt<T>(
  key: CryptoKey,
  value: Cipher,
  aad: string,
): Promise<T> {
  try {
    const text = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unb64(value.iv),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      unb64(value.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(text));
  } catch {
    throw new Error("Mot de passe incorrect ou sauvegarde endommagée.");
  }
}
export async function hasVault(owner: string) {
  return !!(await privateRecord<Meta>("meta:" + owner));
}
export async function unlockVault(owner: string, password: string) {
  const meta = await privateRecord<Meta>("meta:" + owner);
  if (!meta) throw new Error("Aucun signataire local pour ce compte.");
  const key = await derive(password, meta.salt);
  const check = await decrypt<{ owner: string }>(key, meta.check, owner);
  if (check.owner !== owner) throw new Error("Signataire incompatible.");
  unlocked.set(owner, key);
}
export async function createVault(owner: string, password: string) {
  if (password.length < 12)
    throw new Error(
      "Utilisez au moins 12 caractères pour protéger le signataire.",
    );
  if (await hasVault(owner))
    throw new Error("Signataire existant : déverrouillez-le.");
  const salt = b64(crypto.getRandomValues(new Uint8Array(32))),
    key = await derive(password, salt);
  await savePrivateRecord("meta:" + owner, {
    owner,
    salt,
    version: 1,
    check: await encrypt(key, { owner }, owner),
  } satisfies Meta);
  unlocked.set(owner, key);
}
export function vaultUnlocked(owner: string) {
  return unlocked.has(owner);
}
export function lockVault() {
  unlocked.clear();
}
export async function createPositionKey(
  owner: string,
  position: string,
): Promise<Keys> {
  const key = unlocked.get(owner);
  if (!key) throw new Error("Déverrouillez votre signataire local.");
  const id = "key:" + owner + ":" + position,
    previous = await privateRecord<StoredKey>(id);
  if (previous && previous.keys.length >= 32)
    throw new Error(
      "Limite locale de générations atteinte ; conservez votre sauvegarde.",
    );
  const pair = ml_dsa65.keygen(),
    entry = {
      publicKey: b64(pair.publicKey),
      encrypted: await encrypt(
        key,
        { secret: b64(pair.secretKey), public: b64(pair.publicKey) },
        owner + ":" + position,
      ),
    };
  await savePrivateRecord(id, {
    owner,
    position,
    keys: [...(previous?.keys || []), entry],
  } satisfies StoredKey);
  return pair;
}
export async function positionKey(
  owner: string,
  position: string,
  publicKey: string,
): Promise<Keys> {
  const key = unlocked.get(owner),
    record = await privateRecord<StoredKey>("key:" + owner + ":" + position),
    entry = record?.keys.find((k) => k.publicKey === publicKey);
  if (!key || !entry || record?.owner !== owner)
    throw new Error(
      "Clé locale absente ou verrouillée. Restaurez la sauvegarde du propriétaire courant.",
    );
  const material = await decrypt<{ secret: string; public: string }>(
    key,
    entry.encrypted,
    owner + ":" + position,
  );
  if (material.public !== publicKey)
    throw new Error("Clé de signature différente de la génération sur chaîne.");
  return {
    secretKey: unb64(material.secret),
    publicKey: unb64(material.public),
  };
}
export async function exportVault(owner: string) {
  const d = await db();
  const records = await new Promise<{ id: string; value: unknown }[]>(
    (resolve, reject) => {
      const result: { id: string; value: unknown }[] = [],
        t = d.transaction("records", "readonly"),
        r = t.objectStore("records").openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          const v = c.value;
          if (
            v?.owner === owner &&
            /^(key:|data:|mission:|meta:)/.test(String(c.key))
          )
            result.push({ id: String(c.key), value: v });
          c.continue();
        } else resolve(result);
      };
      r.onerror = () => reject(new Error("Export impossible."));
      t.oncomplete = () => d.close();
    },
  );
  return {
    format: "EVERKEEP_ENCRYPTED_KEYS_V1",
    network: "testnet",
    owner,
    records: [
      ...new Map(
        [
          ...records,
          ...[...sessionRecords]
            .filter(([, v]) => (v as { owner?: string })?.owner === owner)
            .map(([id, value]) => ({ id, value })),
        ].map((r) => [r.id, r]),
      ).values(),
    ],
  };
}
export async function backupVault(owner: string) {
  const content = await exportVault(owner),
    blob = new Blob([JSON.stringify(content)], { type: "application/json" }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = owner + "-everkeep-encrypted.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importVault(value: unknown, owner: string) {
  const v = value as Awaited<ReturnType<typeof exportVault>>;
  if (
    !v ||
    v.format !== "EVERKEEP_ENCRYPTED_KEYS_V1" ||
    v.network !== "testnet" ||
    v.owner !== owner ||
    !Array.isArray(v.records) ||
    v.records.length > 1000
  )
    throw new Error("Sauvegarde chiffrée incompatible.");
  const staged = new Map<string, unknown>();
  for (const r of v.records) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !(
        r.id === "meta:" + owner ||
        r.id.startsWith("key:" + owner + ":") ||
        r.id.startsWith("data:" + owner + ":") ||
        r.id.startsWith("mission:")
      ) ||
      (r.value as { owner?: string })?.owner !== owner
    )
      throw new Error("Entrée de sauvegarde invalide.");
    if (staged.has(r.id)) throw new Error("Entrée de sauvegarde dupliquée.");
    const existing = await privateRecord<{ owner?: string }>(r.id);
    if (existing?.owner && existing.owner !== owner)
      throw new Error("Le suivi existant appartient à un autre compte.");
    if (
      existing &&
      JSON.stringify(existing) !== JSON.stringify(r.value) &&
      !r.id.startsWith("key:" + owner + ":") &&
      !r.id.startsWith("data:" + owner + ":") &&
      !r.id.startsWith("mission:")
    )
      throw new Error(
        "Une clé locale différente existe déjà. Restauration interrompue sans remplacement.",
      );
    if (r.id.startsWith("key:" + owner + ":")) {
      const existing = await privateRecord<StoredKey>(r.id),
        incoming = r.value as StoredKey;
      if (
        !Array.isArray(incoming.keys) ||
        incoming.keys.length > 32 ||
        r.id !== "key:" + owner + ":" + incoming.position
      )
        throw new Error("Trousseau de sauvegarde invalide.");
      const merged = new Map(
        (existing?.keys || []).map((k) => [k.publicKey, k]),
      );
      for (const key of incoming.keys) {
        const prior = merged.get(key.publicKey);
        if (prior && JSON.stringify(prior) !== JSON.stringify(key))
          throw new Error("Génération de clé différente ; aucune suppression.");
        merged.set(key.publicKey, key);
      }
      if (merged.size > 32) throw new Error("Trop de générations de clés.");
      staged.set(r.id, {
        ...incoming,
        keys: [...merged.values()],
      });
    } else staged.set(r.id, r.value);
  }
  for (const [id, record] of staged) await savePrivateRecord(id, record);
}
export function requestVault(owner: string): Promise<void> {
  if (unlocked.has(owner)) return Promise.resolve();
  return new Promise((resolve, reject) =>
    window.dispatchEvent(
      new CustomEvent("everkeep-vault-request", {
        detail: { owner, resolve, reject },
      }),
    ),
  );
}
export async function requestKeyBackup(owner: string): Promise<void> {
  if (!unlocked.has(owner)) await requestVault(owner);
  for (const [id, record] of sessionRecords)
    if ((record as { owner?: string }).owner === owner)
      await savePrivateRecord(id, record);
  window.dispatchEvent(
    new CustomEvent("everkeep-vault-saved", { detail: { owner } }),
  );
}
window.addEventListener("everkeep-lock", lockVault);
