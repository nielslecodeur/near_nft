-- Agent Wallet hosted runner (Cloudflare D1). Agent secrets are stored encrypted (AES-GCM, key in a Worker secret).
CREATE TABLE IF NOT EXISTS keys (
  public_key TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  seat_key TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS challenges (
  nonce TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  message TEXT NOT NULL,
  expires INTEGER NOT NULL
);
-- Private skills gated by an NFT: only its current holder (checked with nft_token on every call) can read or replace one.
CREATE TABLE IF NOT EXISTS gated (
  nft TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_enc TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);
