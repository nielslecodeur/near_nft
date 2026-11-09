# Docs

This repository holds two iterations built during the NEAR Hackathon window (first commit 2026-11-02).
The project submitted is the **Agent Wallet**; Everkeep was the first iteration and is kept for the record.

## Agent Wallet (the submission)

Start with [`../AGENTS.md`](../AGENTS.md): what it is, how to connect an AI, every contract method.

| Doc | What |
|---|---|
| [agents-design.md](agents-design.md) | Agent seats: design, who can call what, NFT transfers, threat model, checkpoints and live results |
| [keepers-contract.md](keepers-contract.md) | Keepers, the cards sold on the Market buyer agents shop on: contract design |
| [keepers-inventory.md](keepers-inventory.md) | Keepers v2: the token basket each card holds |
| [keepers-audit.md](keepers-audit.md) | Keepers v2 security audit |
| [keepers-brief.md](keepers-brief.md) | Keepers improvement brief (French) |
| [audit-nft-art.md](audit-nft-art.md) | Audit of the NFT art used by the agent cards |
| [results/](results/) | Deployment records and test reports (`agents-v1-testnet-deployment.json`, ...) |
| [screenshots/](screenshots/) | Browser-check screenshots of every page, desktop and mobile |

Machine-readable: [`../public/llms.txt`](../public/llms.txt), [`../public/abi/agents.json`](../public/abi/agents.json)
(contract ABI), [`../public/openapi/runner.json`](../public/openapi/runner.json) (runner API).

## Everkeep (first iteration, 2026-11-02 → 05, in French)

Transferable savings positions as NFTs, thematic baskets and paid analysis missions. The project pivoted on
2026-11-05 (commit `9f6b50f`, tag `everkeep-baseline`) to Keepers, then on 2026-11-06 to the Agent Wallet.
Its code is still in the repo (`src/*.tsx`, `contracts/{wallet,collection,strategy,missions,demo-token,test-receiver}`)
and its docs are listed here unchanged; nothing in the Agent Wallet depends on them.

- Product and progress: [everkeep/PRODUCT.md](everkeep/PRODUCT.md), [everkeep/PROGRESS.md](everkeep/PROGRESS.md),
  [everkeep/AUDIT.md](everkeep/AUDIT.md), [everkeep/DESIGN.md](everkeep/DESIGN.md)
- Architecture and security: [architecture.md](architecture.md), [threat-model.md](threat-model.md),
  [crypto-design.md](crypto-design.md), [transfer-protocol.md](transfer-protocol.md), [settlement.md](settlement.md)
- Product slices: [thematic-baskets.md](thematic-baskets.md), [marketplace-mvp.md](marketplace-mvp.md),
  [agent-missions.md](agent-missions.md), [agent-ux-simple.md](agent-ux-simple.md),
  [conversation-wallet.md](conversation-wallet.md), [migrations-option2.md](migrations-option2.md),
  [option2-implementation.md](option2-implementation.md), [option2-validation.md](option2-validation.md)
- Interface: [frontend-design.md](frontend-design.md), [art-direction-v2.md](art-direction-v2.md),
  [orbite-direction.md](orbite-direction.md), [ui-direction.md](ui-direction.md), [ui-review.md](ui-review.md),
  [ux-guided.md](ux-guided.md), [explorer-agent.md](explorer-agent.md), [explorer-catalogue.md](explorer-catalogue.md),
  [explorer-marketplace.md](explorer-marketplace.md)
- Operations: [demo.md](demo.md), [testnet.md](testnet.md), [testing.md](testing.md),
  [wallet-connection.md](wallet-connection.md), [ecosystem.md](ecosystem.md), [references.md](references.md)
