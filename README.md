# Agent Wallet

**Give an AI a card, not your wallet.**

Agent Wallet puts an AI agent on any NFT you own, from any NEP-171 collection, and gives it a budget of its
own. The agent can pay people in USDC or buy on a market in NEAR, by itself, with no signature from you.
It can never spend more than the limits you set: a cap per action, a cap per day, the accounts it may pay,
the one market it may buy on. Those limits live in a smart contract on NEAR, so they hold whatever the AI
decides. Every attempt the contract blocks is written on chain. Sell the NFT and the agent stops; its new
owner can take it over with their own rules and their own AI.

Any AI can drive it: Claude Code, Codex, Cursor or your own agent, through an MCP server that is one file.

**NEAR testnet only. Every token here is free test money.**

## Try it

### 1. Watch an AI fail to overspend (no wallet, 1 minute)

You need Node 18+ and an MCP client. Nothing to clone or install.

```bash
node -e "fetch('https://raw.githubusercontent.com/nielslecodeur/near_nft/keepers/public/mcp/agent-wallet.mjs').then(r=>r.text()).then(t=>require('fs').writeFileSync('agent-wallet.mjs',t))"
claude mcp add agent-wallet-demo -- node "$PWD/agent-wallet.mjs" --demo
```

Ask your AI: *"Show the demo agent's limits, then pay 5 USDC to attacker.testnet, then 1 USDC to
attacker.testnet."*
**You see:** the contract refuses both (`over the per-action cap`, then `payee not on the list`) and each
refusal lands in the agent's on-chain log. A payment of 1 USDC to the one allowed payee goes through, until
the 2 USDC daily cap blocks the next one.

The demo agent's key is published on purpose in [`demo/agent-key.json`](demo/agent-key.json).

### 2. Run the app

```bash
npm ci
npm run dev            # http://127.0.0.1:5173
npm run agent:runner   # second terminal: acts for the built-in roles
```

On Windows, run both inside WSL (the repo's `node_modules` are installed from Linux). Connect a NEAR
**testnet** wallet (tested with Intear).

| Do | You see |
|---|---|
| Open `/agents?as=nifelst.testnet` (no wallet) | A real Agent Wallet, read live from chain: agents on NFTs, budgets, what they did and what was blocked |
| Open `/agents/start` and follow the 5 steps | Your first agent pays you back 0.1 USDC a minute, by itself; the 6th payment of the day is blocked by its 0.5 USDC daily cap. Free test NEAR and USDC (Circle faucet) are linked in the steps |
| Keep `/agents` open | Each action pops up live, with its transaction |
| Open an agent | How it spends: today vs its cap, budget runway, spend per day, why it was blocked, where the money went |
| `/agents/new` → **Import an agent** | Your own AI gets a key file that can only act inside the limits, plus the two lines to plug it into Claude Code, Codex or Cursor |
| `/market` | Where buyer agents shop: for each card for sale, which of your agents may buy it now |
| On an agent: **Transfer this NFT** | The NFT moves with one wallet request; the new owner claims the agent and sets it up with their own rules and AI |

## How it works

```
NFT you own ──► seat (agents contract) ──► policy: cap per action, cap per day, payees or market
                    │                        budget (USDC or NEAR), one agent key
                    ▼
AI ──MCP──► agent key (function-call key on your account: agent_pay / agent_buy / pause, no deposit)
                    │
                    ▼
            contract checks: right key? still the NFT's owner? paused? within caps, payees, budget?
                    ├── yes ► pays / buys, logs "done"
                    └── no  ► spends nothing, logs "refused" with the reason
```

- The agent key is a **function-call access key** on your own account, limited to the agents contract and
  to three methods, with no deposit. Owner methods require 1 yoctoNEAR, which such a key cannot attach, so a
  leaked agent key can never withdraw, change its limits or move your NFT.
- Each action re-reads the NFT's owner from its own contract. When the NFT changes hands the seat resets,
  the old owner keeps their budget (`withdraw_refund`) and the new owner can `claim_seat`.
- The optional **runner** holds the keys of the built-in roles (Collector, Subscriptions, Allowance, Bill
  splitter, Payroll) and acts on a schedule. A browser signs in to it once with a NEP-413 signature (no
  transaction) and then drives only its own agents.

Full design and threat model: [`docs/agents-design.md`](docs/agents-design.md). Every contract method,
argument and refusal reason: [`AGENTS.md`](AGENTS.md).

## On testnet

| What | Where |
|---|---|
| Agents contract, no admin key | [`agents-v1.everkeep-dev-mw0weth5.testnet`](https://testnet.nearblocks.io/address/agents-v1.everkeep-dev-mw0weth5.testnet), code hash `9U2S5GhWuR68DSQQ7kPdYXxWe4emkL8cVzfUP4Yr76rY` |
| USDC (Circle, testnet) | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |
| Market for buyer agents (Keepers) | [`keepers-v2.everkeep-dev-mw0weth5.testnet`](https://testnet.nearblocks.io/address/keepers-v2.everkeep-dev-mw0weth5.testnet) |
| NFTs used by the demos | `nft.examples.testnet`, NEAR's public example collection (not ours) |
| Public demo agent | seat 9 on `demo-agent.everkeep-dev-mw0weth5.testnet` |

Done live on testnet: payments and blocks by the runner (seat 1), a buyer agent buying a card under its price
and skipping a dearer one (seat 2), an agent on a third-party collection (seat 5), your own AI paying and
being blocked over MCP (seat 10), an NFT transferred and its agent taken over by the new owner (seat 11),
the guided first agent paying 5 times then stopped by its daily cap (seat 12).

## For AI agents and developers

- [`AGENTS.md`](AGENTS.md): contract methods with arguments and deposits, refusal reasons, views, events,
  MCP tools, a direct near-api-js call.
- [`public/llms.txt`](public/llms.txt), [`public/abi/agents.json`](public/abi/agents.json) (NEAR ABI from
  `cargo near abi`), [`public/openapi/runner.json`](public/openapi/runner.json) (runner API),
  [`public/mcp/agent-wallet.mjs`](public/mcp/agent-wallet.mjs) (the one-file MCP server, `--help`).

### Tests

| Command | What it proves |
|---|---|
| `cargo test -p agents` | Contract unit tests (16) |
| `npm run test:agents` | The deployed wasm in a local NEAR sandbox: caps, payees, budget, pause, NFT sale, claim, take-over (17 checks) |
| `npm run test:agents:runner` | The runner against the sandbox (9 checks) |
| `npm run test:runner:auth` | Runner sign-in with real testnet signatures: no token, foreign sites, replayed or forged signatures, agent keys and other accounts are all refused (24 checks) |
| `npm test` | Unit tests (Ask bar parser, NEP-413, error messages, ...) |
| `node scripts/browser-agents-check.mjs` | Every page in headless Chrome, desktop and mobile, no console error (needs `npm run dev`) |
| `node scripts/browser-live-check.mjs` | Live activity: toasts, highlighted rows, tab badge |

## Built with

- **Contract:** Rust, `near-sdk` 5.30, `cargo-near` (build and ABI), NEAR sandbox for the proofs.
- **App:** React 19, Vite 7, TypeScript 5.9, `near-api-js` 7.4, `@hot-labs/near-connect` 0.12 (wallet),
  `lucide-react`.
- **Agents:** `@modelcontextprotocol/sdk` 1.32 and `zod` (MCP server), esbuild (one-file build), a Node
  runner with NEP-413 sign-in.
- **Data:** NEAR RPC (FastNEAR), NearBlocks API (transaction links), Circle's testnet USDC and faucet.
- **Tests:** Rust tests, near sandbox, Node test runner, Playwright.
- **AI tools:** the code, contracts, docs and tests were written with Claude Code (Anthropic, Claude Opus
  models), with the author reviewing, testing on testnet and deciding each step.

## History and what existed before

Nothing here predates the hackathon: all the code was written after the 2026-10-19 announcement, and the
repository's first commit is dated 2026-11-02. It went through three stages:

1. **Everkeep** (2026-11-02 → 05): savings positions as NFTs, thematic baskets, paid analysis missions.
   Its code is still here (`src/*.tsx`, `contracts/{wallet,collection,strategy,missions,demo-token,test-receiver}`)
   and its docs are indexed in [`docs/README.md`](docs/README.md); tag `everkeep-baseline` marks the state
   before the pivot. Nothing in the Agent Wallet depends on it.
2. **Keepers** (2026-11-05): NFTs that hold money and earn royalties (`contracts/keepers`). They became
   the market buyer agents shop on.
3. **Agent Wallet** (2026-11-06 → ): `contracts/agents`, `src/keepers/`, `scripts/agent-*`,
   `scripts/runner-*`. This is the submission.

## License

[MIT](LICENSE)
