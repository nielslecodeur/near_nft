# Hosted agent runner (Cloudflare Workers, free plan)

The same runner as `scripts/agent-runner.ts`, hosted: it holds agent keys and acts for the built-in roles
(Collector, Subscriptions, Allowance, the guided first agent) every minute, with no computer left on.

- **Same API** as the local runner ([`public/openapi/runner.json`](../../public/openapi/runner.json)), NEP-413 sign-in
  included, and **the same missions** ([`scripts/runner-logic.ts`](../../scripts/runner-logic.ts)).
- **No NEAR library**: transactions are borsh-encoded by hand and signed with WebCrypto ed25519
  ([`src/near.ts`](src/near.ts)), so a tick stays far inside the free plan's 10 ms of CPU. The bytes and
  signatures match near-api-js exactly (`tests/worker-near.test.ts`).
- **Storage**: D1. Agent secret keys are encrypted with AES-GCM under the `SECRETS_KEY` secret.
- **Trust**: whoever runs the Worker holds the agents' keys. Each key can only call `agent_pay`,
  `agent_buy` and `pause` with no deposit, inside the limits the contract enforces: it can never withdraw,
  change limits or move an NFT. Testnet only.
- **Private skills, the NFT as the key** (`/gated/<nft_contract>/<token_id>`): the holder of an NFT stores a
  SKILL.md for it (encrypted, at most 64 KB). Only the account that holds the NFT *now* can read or replace it:
  every request asks the NFT contract (`nft_token`) after a NEP-413 sign-in. Send the NFT and the access goes
  with it. Anyone can read its public card (`/meta`: name, size, sha256), never its text.

## Deploy (once)

```bash
cd workers/runner && npm install
npx wrangler login                                  # opens Cloudflare in the browser
npx wrangler d1 create agent-wallet-runner          # paste the printed database_id into wrangler.toml
npm run db:remote                                   # creates the tables
head -c 32 /dev/urandom | base64 | npx wrangler secret put SECRETS_KEY
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | tee ~/.everkeep-agents/hosted-admin-token | npx wrangler secret put ADMIN_TOKEN
npm run deploy                                      # prints https://agent-wallet-runner.<you>.workers.dev
```

Then point the app at it (`VITE_AGENTS_RUNNER` on the host, or the default in `src/keepers/agents.ts`) and check:

```bash
RUNNER_URL=https://agent-wallet-runner.<you>.workers.dev RUNNER_ADMIN_TOKEN=$(cat ~/.everkeep-agents/hosted-admin-token) \
  npx tsx scripts/hosted-runner-proof.ts
```

## Live

`https://agent-wallet-runner.nielshallgren.workers.dev` (deployed 2026-11-09), used by the hosted app by default.
Proof against it (`docs/results/hosted-runner-proof.json`): the Worker made the agent key, the demo account
hired v2 seat 6 with it, **Cloudflare's cron paid 0.1 USDC by itself** (tx `Dm2DfM5n4ZEdEu7UY5F4tt4WFBj1fAaqBaLmhSf6i8B2`,
in the seat's on-chain log) and a 0.2 USDC payment through the Worker was refused on chain as over the
per-action cap (tx `3yZBp5Gs72Xy9ZJ6EAY49jEYjehVKrbfpxve2fPAxAW9`). A freshly deployed cron took about three
minutes to start firing.

Private skills (`docs/results/gated-skill-proof.json`, 6 checks): a fresh NFT for the demo account; a non-holder
can neither store nor read, signed-out callers get 401; the holder stores and reads; the public card has no text;
the agent card v2-7 links to the skill; after the NFT moves, the old holder gets 403 and the new one reads the
same skill and claims the card.

## Run it locally

```bash
npm run dev    # wrangler dev, local D1; secrets come from .dev.vars (gitignored)
RUNNER_URL=http://127.0.0.1:8787 npx tsx scripts/hosted-runner-proof.ts   # from the repo root
```

Local proof (2026-11-09, `docs/results/hosted-runner-local-proof.json`): the Worker made the agent key,
the demo account hired v2 seat 5 with it, the triggered tick paid 0.1 USDC signed in the Worker, and a
0.2 USDC payment through the Worker was refused on chain as over the per-action cap.
