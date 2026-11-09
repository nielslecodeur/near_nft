# Hosting the Agent Wallet (free)

The app is a static site (`npm run build` → `dist/`, about 4 MB). Any static host works as long as every
path that is not a file serves `index.html`, so links such as `/agents/v2-4` open directly.

## Vercel (recommended: no code change, redeploys on every push)

1. Sign in at vercel.com with GitHub, **Add New → Project**, import `nielslecodeur/near_nft`.
2. Branch: `keepers` (or `main`, same content). Framework, build command and output come from
   [`vercel.json`](../vercel.json): Vite, `npm run build`, `dist`, with the single-page rewrite.
3. Deploy. The site's own address is used for shared agent links (`location.origin`); set
   `VITE_PUBLIC_URL` only to force another one (a custom domain).

## Netlify or Cloudflare Pages

Build command `npm run build`, publish directory `dist`. [`public/_redirects`](../public/_redirects) gives the
single-page rewrite on both.

## What works on the hosted site

- Everything that reads the chain: the read-only Agent Wallet (`/agents?as=<account>`), every agent page,
  the Market, the dashboard, live activity, explorer links.
- Everything signed by the visitor's wallet: hiring (including "Import an agent" and "Just its identity"),
  funding, limits, pause, transfer, claim, profile.
- The AI-facing files: `/llms.txt`, `/abi/agents-v2.json`, `/openapi/runner.json`, `/mcp/agent-wallet.mjs`.

The built-in roles (Collector, Subscriptions, Allowance, the guided first agent) need the **runner**, which
runs on the user's own computer. To let the hosted site reach it, start it with the site's origin allowed:

```bash
AGENTS_RUNNER_ORIGINS="https://<your-app>.vercel.app,http://127.0.0.1:5173" npm run agent:runner
```

The runner answers Chrome's Private Network Access preflight for those origins only.
