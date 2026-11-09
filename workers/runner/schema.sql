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
