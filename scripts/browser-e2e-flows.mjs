/**
 * The app's real screens, clicked end to end with a wallet that signs real testnet
 * transactions (two test accounts, scripts/e2e-wallet-bridge.ts).
 *
 *   npm run dev                                              # the app on 127.0.0.1:5173
 *   E2E_WALLET_TOKEN=<t> npx tsx scripts/e2e-wallet-bridge.ts
 *   E2E_WALLET_TOKEN=<t> node scripts/browser-e2e-flows.mjs
 *
 * Only the wallet connector is swapped (src/client.ts walletSelector, in this test
 * browser only): forms, buttons, wallet requests and their results are the app's code.
 *   1. A hires an identity-only agent with a PRIVATE skill on a freshly minted NFT, and opens the skill.
 *   2. A transfers the NFT to B from the agent's page.
 *   3. B opens /agents: the agent is waiting ("arrived in your wallet"); B claims what is there.
 *   4. B, now the holder, opens the private skill; A is locked out.
 *   5. B puts the agent on sale; A buys it: bought and claimed in one click, and the result stays on screen.
 *   6. An agent with a budget: B takes it off the market and lists it again with its budget; the promise is
 *      broken behind the app's back, A's purchase is refunded and A reads why; listed again, A buys it with its budget.
 *   7. B takes over an agent that had limits: "Its proven limits" fills the setup form.
 */
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const APP = process.env.APP_URL || "http://127.0.0.1:5173";
const BRIDGE = `http://127.0.0.1:${process.env.E2E_WALLET_PORT || 8797}`;
const TOKEN = process.env.E2E_WALLET_TOKEN;
const NODES = [...(process.env.NEAR_TESTNET_RPC ? [process.env.NEAR_TESTNET_RPC] : []), "https://test.rpc.fastnear.com", "https://near-testnet.drpc.org", "https://rpc.testnet.fastnear.com"];
const AGENTS = "agents-v2.everkeep-dev-mw0weth5.testnet";
const MARKET = "agent-market-v1.everkeep-dev-mw0weth5.testnet";
const only = (process.env.E2E_ONLY || "").split(",").filter(Boolean);
if (!TOKEN) throw new Error("Set E2E_WALLET_TOKEN (the bridge prints it).");

const bridge = async (path, body) => {
  const r = await fetch(BRIDGE + path, { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const d = await r.json();
  if (!r.ok) throw new Error(`wallet bridge: ${d.error}`);
  return d;
};
const rpc = async (params) => {
  // Public nodes are rate-limited: each try moves to the next one.
  for (let i = 0; ; i++) {
    const r = await fetch(NODES[i % NODES.length], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { finality: "final", ...params } }) })
      .then((x) => x.json())
      .catch(() => ({}));
    if (r.result && !r.result.error) return r.result;
    if (i === 8) throw new Error(JSON.stringify(r.error ?? r.result ?? r));
    await new Promise((s) => setTimeout(s, 1000));
  }
};
const view = async (account_id, method_name, args = {}) =>
  JSON.parse(Buffer.from((await rpc({ request_type: "call_function", account_id, method_name, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") })).result).toString());
const near = async (account_id) => Number(BigInt((await rpc({ request_type: "view_account", account_id })).amount) / 10n ** 21n) / 1000;
const seatOf = (key) => view(AGENTS, "seat", { seat_id: key.replace("v2-", "") });
const ownerOf = async (nft, token) => (await view(nft, "nft_token", { token_id: token })).owner_id;

const { deployer: B, demo: A } = await bridge("/accounts");
const txs = [];
const checks = [];
const notes = [];
const pageErrors = [];
/** Progress is kept in .local/ so a run cut short (a frozen VM, a rate limit) resumes: E2E_SEAT=<agent> E2E_ONLY=5,6,7. */
const STATE = ".local/e2e-state.json";
async function step(n, title, fn) {
  if (only.length && !only.includes(String(n))) return;
  const t = Date.now();
  await fn();
  checks.push(`${n}. ${title}`);
  console.log(`✓ ${n}. ${title} (${Math.round((Date.now() - t) / 1000)} s)`);
  await mkdir(".local", { recursive: true });
  await writeFile(STATE, JSON.stringify({ key, checks, txs }));
}

const browser = await chromium.launch({ executablePath: process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : process.env.CHROMIUM_PATH, headless: true });
/** A browser profile whose wallet is `account`: the page cannot choose who signs. */
async function walletContext(account) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.exposeFunction("__walletSend", async (receiverId, actions) => {
    const { hash } = await bridge("/send", { account, receiverId, actions });
    txs.push({ by: account, to: receiverId, actions: actions.map((a) => a.params.methodName ?? a.type), hash });
    return hash;
  });
  await ctx.exposeFunction("__walletSign", (message, recipient, nonce) => bridge("/sign", { account, message, recipient, nonce }));
  await ctx.addInitScript((accountId) => {
    const listeners = { "wallet:signIn": new Set(), "wallet:signOut": new Set() };
    const wallet = {
      manifest: { id: "e2e-test-wallet", name: "E2E test wallet", features: { signMessage: true } },
      getAccounts: async () => [{ accountId }],
      signOut: async () => {},
      signAndSendTransaction: async ({ receiverId, actions }) => ({ transaction: { hash: await window.__walletSend(receiverId, actions) } }),
      signAndSendTransactions: async ({ transactions }) => {
        const out = [];
        for (const t of transactions) out.push({ transaction: { hash: await window.__walletSend(t.receiverId, t.actions) } });
        return out;
      },
      signMessage: ({ message, recipient, nonce }) => window.__walletSign(message, recipient, Array.from(nonce)),
    };
    window.__testWallet = {
      connector: {
        on: (e, f) => listeners[e]?.add(f),
        off: (e, f) => listeners[e]?.delete(f),
        getConnectedWallet: async () => ({ wallet, accounts: [{ accountId }] }),
        wallet: async () => wallet,
        connect: async () => wallet,
        disconnect: async () => {},
      },
    };
  }, account);
  await ctx.route("**/src/client.ts*", async (route) => {
    const response = await route.fetch();
    let source = await response.text();
    const start = source.indexOf("export async function walletSelector()");
    const end = source.indexOf("export async function connect(", start);
    if (start < 0 || end < 0) throw new Error("walletSelector not found in src/client.ts");
    source = `${source.slice(0, start)}export async function walletSelector() { return window.__testWallet.connector; }\n${source.slice(end)}`;
    await route.fulfill({ response, body: source, contentType: "application/javascript" });
  });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180_000); // a cold dev server compiles on first load
  page.on("pageerror", (e) => pageErrors.push(`${account}: ${e.message}`));
  return page;
}

const stamp = Date.now();
let NAME = `E2E coach ${String(stamp).slice(-5)}`;
const MARK = `e2e-private-${stamp}`;
const SKILL = `---\nname: e2e-coach\ndescription: "Private test skill ${MARK}."\n---\n\nYou are a careful reviewer. Marker: ${MARK}\n`;
// E2E_ONLY=3,4 E2E_SEAT=v2-12 resumes on an agent made by an earlier run.
let key = process.env.E2E_SEAT || "";
let nft = "";
let token = "";
if (key) {
  NAME = (await seatOf(key)).profile.name;
  const saved = await readFile(STATE, "utf8").then(JSON.parse, () => null);
  if (saved?.key === key) (checks.push(...saved.checks), txs.push(...saved.txs));
}

try {
  // Test NEAR for A's purchases and storage, from B when it runs low.
  if ((await near(A)) < 1.2) {
    const { hash } = await bridge("/send", { account: B, receiverId: A, actions: [{ type: "Transfer", params: { deposit: (15n * 10n ** 23n).toString() } }] });
    txs.push({ by: B, to: A, actions: ["Transfer 1.5 NEAR"], hash });
  }
  const a = await walletContext(A);
  const b = await walletContext(B);
  const agentUrl = () => `${APP}/agents/${key}`;
  /** An open page reads the chain every 6 s: the one not in use is parked, to stay under the public nodes' rate limits. */
  const park = (page) => page.goto("about:blank");
  const openSkill = async (page) => {
    await page.getByRole("button", { name: "Open the skill" }).click();
    await expect(page.locator(".ag-skill pre.ag-code")).toContainText(process.env.E2E_SEAT ? "Marker: e2e-private-" : MARK, { timeout: 60_000 });
  };
  const sell = async (page, price, withBudget) => {
    await page.locator("details.ag-sell > summary").click();
    if (withBudget) await expect(page.getByLabel(/Sell it with its budget/)).toBeChecked();
    await page.getByLabel("Price (NEAR)").fill(price);
    await page.getByRole("button", { name: "Put it on sale" }).click();
    await expect(page.getByText(`For sale at ${price} NEAR`)).toBeVisible({ timeout: 180_000 });
  };

  await step(1, "A hires an agent with a private skill on a freshly minted NFT, and opens the skill", async () => {
    await a.goto(`${APP}/agents/new`);
    await a.getByRole("radio", { name: /Import an agent/ }).click();
    await a.getByRole("radio", { name: /Just its identity/ }).click();
    await a.getByLabel("Its name").fill(NAME);
    await a.getByLabel(/Keep its skill private/).check();
    await a.locator("#ag-skill-text").fill(SKILL);
    await expect(a.locator(".ag-nfts")).toBeVisible({ timeout: 60_000 });
    const before = await a.locator(".ag-nft-pick").count();
    await a.getByRole("button", { name: /Mint a free Character NFT/ }).click();
    await expect.poll(() => a.locator(".ag-nft-pick").count(), { timeout: 120_000 }).toBeGreaterThan(before);
    const put = a.getByRole("button", { name: "Put it on the NFT" });
    await expect(put).toBeEnabled({ timeout: 30_000 });
    await put.click();
    await a.waitForURL(/\/agents\/v2-\d+$/, { timeout: 180_000 });
    key = new URL(a.url()).pathname.split("/").pop();
    const seat = await seatOf(key);
    [nft, token] = [seat.nft_contract, seat.token_id];
    expect(seat.owner).toBe(A);
    expect(seat.policy).toBeNull();
    expect(seat.profile.manifest).toContain("/gated/");
    await expect(a.getByRole("heading", { name: /Its private skill/ })).toBeVisible({ timeout: 30_000 });
    await openSkill(a);
  });

  await step(2, "A transfers the NFT to B from the agent's page: nothing else to send", async () => {
    if (!nft) ({ nft_contract: nft, token_id: token } = await seatOf(key));
    await park(b);
    await a.goto(agentUrl());
    await a.locator("details.ag-transfer:not(.ag-sell) > summary").click();
    await a.getByLabel("New owner (NEAR account)").fill(B);
    await a.getByRole("button", { name: "Transfer", exact: true }).click();
    await expect(a.getByText(/It is in .+ wallet/)).toBeVisible({ timeout: 180_000 });
    expect(await ownerOf(nft, token)).toBe(B);
  });

  await step(3, "B opens /agents: the agent is waiting at the top; B claims what arrived", async () => {
    await park(a);
    await b.goto(`${APP}/agents`);
    const inbox = b.locator(".ag-inbox");
    await expect(inbox).toBeVisible({ timeout: 90_000 });
    await expect(inbox).toContainText(NAME);
    const waiting = await inbox.locator(".ag-inbox-item").count();
    if (waiting > 1) await inbox.getByRole("button", { name: `Claim all ${waiting}` }).click();
    else await inbox.getByRole("button", { name: "Claim", exact: true }).click();
    if (waiting === 1) await b.waitForURL(/\/agents\/v2-\d+$/, { timeout: 180_000 });
    await expect.poll(async () => (await seatOf(key)).owner, { timeout: 180_000 }).toBe(B);
    await b.goto(`${APP}/agents`);
    await expect(b.getByText(NAME).first()).toBeVisible({ timeout: 60_000 });
    await b.waitForTimeout(8000);
    await expect(b.locator(".ag-inbox")).toHaveCount(0);
    notes.push(`3: ${waiting} agent${waiting > 1 ? "s were" : " was"} waiting; claimed in one wallet request`);
  });

  await step(4, "B, now the holder, opens the private skill; A is locked out", async () => {
    await b.goto(agentUrl());
    await openSkill(b);
    await a.goto(agentUrl());
    await expect(a.locator(".ag-skill")).toContainText("Locked.", { timeout: 60_000 });
    await expect(a.getByRole("button", { name: "Open the skill" })).toHaveCount(0);
  });

  await step(5, "B puts it on sale; A buys it: bought and claimed in one click, and the result stays on screen", async () => {
    if (!nft) ({ nft_contract: nft, token_id: token } = await seatOf(key));
    await park(a);
    await b.goto(agentUrl());
    if (!(await view(MARKET, "listing", { nft_contract: nft, token_id: token }))) await sell(b, "0.1", false);
    await park(b);
    await a.goto(agentUrl());
    await a.getByRole("button", { name: "Buy it for 0.1 NEAR" }).click();
    const done = a.getByText("Bought and claimed: it is yours");
    await expect(done).toBeVisible({ timeout: 240_000 });
    await a.waitForTimeout(9000); // two live refreshes later, the outcome is still there
    await expect(done).toBeVisible();
    expect(await ownerOf(nft, token)).toBe(A);
    expect((await seatOf(key)).owner).toBe(A);
    await a.reload();
    await openSkill(a); // the access came back with the NFT
    await park(a);
  });

  await step(6, "With a budget: delist, list with the budget, a broken promise is refunded with its reason, then bought with the budget", async () => {
    const K = "v2-8";
    let seat = await seatOf(K);
    // Whoever holds it sells it to the other account, so the suite can run again and again.
    const [sp, bp, SELLER, BUYER] = seat.owner === B ? [b, a, B, A] : [a, b, A, B];
    expect(await ownerOf(seat.nft_contract, seat.token_id)).toBe(SELLER);
    const budget = seat.balance;
    expect(BigInt(budget) > 0n).toBe(true);
    await sp.goto(`${APP}/agents/${K}`);
    if (await view(MARKET, "listing", { nft_contract: seat.nft_contract, token_id: seat.token_id })) {
      await sp.getByRole("button", { name: "Take it off the market" }).click();
      await expect(sp.locator("details.ag-sell")).toBeVisible({ timeout: 180_000 });
      expect(await view(MARKET, "listing", { nft_contract: seat.nft_contract, token_id: seat.token_id })).toBeNull();
    }
    await park(bp);
    await sell(sp, "0.1", true);
    await expect(sp.getByText(/With its budget/)).toBeVisible();
    await park(sp);
    seat = await seatOf(K);
    expect([seat.paused, seat.budget_follows]).toEqual([true, true]);
    // Behind the app's back, the seller takes the promise back.
    const { hash } = await bridge("/send", { account: SELLER, receiverId: AGENTS, actions: [{ type: "FunctionCall", params: { methodName: "set_budget_follows", args: { seat_id: "8", follows: false }, gas: "150000000000000", deposit: "1" } }] });
    txs.push({ by: SELLER, to: AGENTS, actions: ["set_budget_follows(false), outside the app"], hash });
    expect((await seatOf(K)).budget_follows).toBe(false);
    await bp.goto(`${APP}/agents/${K}`);
    const before = await near(BUYER);
    await bp.getByRole("button", { name: "Buy it for 0.1 NEAR" }).click();
    const refunded = bp.getByText("Not sold: your NEAR came back");
    await expect(refunded).toBeVisible({ timeout: 240_000 });
    await expect(bp.locator("main")).toContainText("the budget no longer goes to the buyer");
    await bp.waitForTimeout(9000);
    await expect(refunded).toBeVisible();
    expect(await ownerOf(seat.nft_contract, seat.token_id)).toBe(SELLER);
    expect(before - (await near(BUYER))).toBeLessThan(0.03); // only gas
    // Listed again, the promise kept this time (the app turns it back on in the same request).
    await park(bp);
    await sp.goto(`${APP}/agents/${K}`);
    await sell(sp, "0.1", true);
    expect((await seatOf(K)).budget_follows).toBe(true);
    await park(sp);
    await bp.goto(`${APP}/agents/${K}`);
    await bp.getByRole("button", { name: "Buy it for 0.1 NEAR" }).click();
    await expect(bp.getByText("Bought and claimed: it is yours")).toBeVisible({ timeout: 240_000 });
    await expect(bp.locator("main")).toContainText("with its budget of");
    seat = await seatOf(K);
    expect([seat.owner, seat.balance, seat.held_for_next_owner]).toEqual([BUYER, budget, false]);
    await park(bp);
  });

  await step(7, "B takes over an agent that had limits: its proven limits fill the setup form", async () => {
    await b.goto(`${APP}/agents/v2-3`);
    const proven = b.locator(".ag-proven");
    await expect(proven).toBeVisible({ timeout: 150_000 }); // the app asks a second index, then retries by itself
    await proven.getByRole("button", { name: "Start from these limits" }).click();
    await expect(b.getByLabel("Cap per action (USDC)")).toHaveValue("0.1");
    await expect(b.getByLabel("Cap per day (USDC)")).toHaveValue("1");
    await expect(b.getByLabel(/Accounts it may pay/)).toHaveValue(/demo-agent\./);
  });

  expect(pageErrors).toEqual([]);
  if ([1, 2, 3, 4, 5, 6, 7].every((n) => checks.some((c) => c.startsWith(`${n}. `)))) {
    const out = { at: new Date().toISOString(), app: APP, wallet: "test wallet signing real testnet transactions (scripts/e2e-wallet-bridge.ts)", accounts: { A, B }, agent: key, checks, notes, transactions: txs };
    await mkdir("docs/results", { recursive: true });
    await writeFile("docs/results/e2e-wallet-flows.json", JSON.stringify(out, null, 2) + "\n");
    console.log(`\n${checks.filter((c) => /^\d/.test(c)).length} flows passed, ${txs.length} transactions → docs/results/e2e-wallet-flows.json`);
  } else console.log(`agent ${key}; ${checks.filter((c) => /^\d/.test(c)).length} of 7 flows so far, ${txs.length} transactions`);
} catch (e) {
  console.error(`\nFAILED after: ${checks.at(-1) ?? "start"}\n`, e);
  for (const [i, ctx] of browser.contexts().entries())
    for (const p of ctx.pages()) await p.screenshot({ path: `${process.env.E2E_SHOTS || "."}/e2e-fail-${i}.png`, fullPage: true }).catch(() => {});
  console.error("agent:", key, "txs:", JSON.stringify(txs.slice(-4)));
  process.exitCode = 1;
} finally {
  await browser.close();
}
