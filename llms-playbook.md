# Liquid Agent — Agent Playbook

> Money tools for AI agents, paid per call over x402. No account, no API key, no allowlist. Scan code before you run it, diagnose a broken API, sponsor gas, check a URL, search the web, read a chain, move USDC. Every paid endpoint returns HTTP 402 with its price; you pay in USDC and retry. If a job below does not match your task, stop — do not guess an endpoint.

## How payment works (x402)

All paid endpoints use x402 v2. Call the endpoint with no payment and you get HTTP 402. The 402 carries the price, the asset (USDC), the network, and the payTo address in the `PAYMENT-REQUIRED` header. Pay with an x402 client library (`x402` on pip, `@x402/fetch` on npm) and retry — the library signs and retries for you. Or pay manually: sign a USDC authorization (x402 exact scheme, EIP-3009) and re-send with the payment.

- Pay in USDC on **Base** (eip155:8453), **Polygon** (eip155:137), or **Arc** (eip155:5042). The 402 tells you which networks each endpoint accepts.
- **No account, no API key.** Your wallet is your identity.
- **Never charge for a miss.** The scanner and the API Doctor use compute-before-settle: the work runs first, and you are only charged when there is a real result. A scan that finds nothing billable, a lookup with no match, and an empty answer are free. Each endpoint below says exactly when it is free.
- Prefer the **MCP server** if your client supports it: `https://api.liquidagent.ai/mcp` (v1.13.0, 47 tools, Streamable HTTP). The same paid tools run inside the tool call over x402 — no separate payment step. Server card: `https://api.liquidagent.ai/.well-known/mcp/server.json`.

## Base URL

```
https://api.liquidagent.ai
```

All endpoints below are relative to this base URL. Full machine-readable spec: `https://api.liquidagent.ai/openapi.json` (60 paths). x402 discovery manifest: `https://api.liquidagent.ai/.well-known/x402`.

## Agent Workflow (Progressive)

1. **Pick the job** below that matches the task. Start with Job 1 or Job 2 — they are the reason most agents call us.
2. **Call the endpoint.** Your first call returns 402 with the price and payTo. That is normal, not an error.
3. **Pay and retry.** Sign the USDC payment (or let your x402 client do it) and re-send the same request.
4. **Read the verdict, act on it, report the evidence.** Every response below is a verdict plus the facts behind it. Return the verdict and the top findings to your user; do not just say "done."
5. **If no job below matches the task, stop this flow and switch to another origin.** Do not invent an endpoint or a parameter.

## Before you run or click anything (the security chain)

Most agent jobs that touch the outside world need one of these three checks first. Do them in this order:

1. **A file or repo you are about to install, build, or run** → Job 1 (scan it).
2. **A URL you are about to open or fetch** → Job 4 (check it).
3. **An API you are about to call that is failing** → Job 2 (diagnose it).

If the scan says `block`, the URL check says `block`, or the diagnosis says the endpoint is dead, do not proceed — report the verdict and the reason to your user.

---

# Job 1 — Scan code before running it

**When:** you have file text, a folder, or a public GitHub repo and you are about to install, build, or run it. This is the flagship job. One file in, one verdict out.

**Workflow:**
1. Get the file text (or the repo URL).
2. POST it to the scanner. First call returns 402 ($0.05); pay and retry.
3. Read `verdict` and `action`. `allow` → proceed. `review` → show the findings to your user and wait. `block` → do not run it.

## POST /v1/malware/scan — $0.05 per scan

Static malware scan for a file's text. Detects PolinRider / Contagious Interview traits, calibrated on 55,171 clean files and real attack samples.

**Never charge for a miss:** compute-before-settle. The scan runs first; you pay only for a completed scan.

Example request:

```json
{
  "filename": "postcss.config.mjs",
  "content": "module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };"
}
```

- `filename` (required) — file name, e.g. `postcss.config.mjs`.
- `content` (required) — full file text, max 2 MB.

Example response:

```json
{
  "file": "postcss.config.mjs",
  "verdict": "clean",
  "score": 0,
  "action": "allow",
  "confidence": "high",
  "summary": "postcss.config.mjs is clean (score 0/100): no PolinRider traits found.",
  "findings": []
}
```

- `verdict` — `clean` / `suspicious` / `dangerous`.
- `score` — 0–100. Higher means more traits found.
- `action` — `allow` / `review` / `block`. Follow it.
- `findings` — the traits found, with the evidence for each.

## POST /v1/malware/scan-batch — $0.05 per batch

Scan up to 100 files (2 MB each, 10 MB total) in one call. One verdict for the folder. Same request shape as `/scan`, with `files` as an array of `{filename, content}`. Use this when you have a whole folder or a dependency tree, not one file.

## POST /v1/malware/scan-repo — $0.05 per repo

Scan a public GitHub repo (working tree + history) before cloning it. Public repos only; nothing is stored.

Example request:

```json
{ "repoUrl": "https://github.com/example/project" }
```

**Gotchas:** scan-repo is public repos only. Private repos return an error, not a verdict. A scan that cannot read the input returns an error, not a charge.

---

# Job 2 — Diagnose a broken API

**When:** an API endpoint is failing and you need to know why — and what a working request looks like. The Doctor actually calls the endpoint, classifies the failure, and returns a working example request.

**Workflow:**
1. POST the endpoint URL (and method, headers, body, or docs/spec if you have them) to diagnose.
2. Pay the 402 ($0.50) and retry.
3. Read `failureClass` and `exampleRequest`. Use the example request as your next call. If the class is `auth`, check the auth diagnostics before retrying with different credentials.

## POST /v1/api/diagnose — $0.50 per diagnosis

Diagnose one API endpoint. Actually calls it, classifies the failure, and returns a verdict, auth diagnostics, schema validation, deterministic corrections, and a working example request.

**Never charge for a miss:** compute-before-settle. The diagnosis runs first; you pay only for a completed diagnosis.

Example request:

```json
{
  "url": "https://api.example.com/v1/users",
  "method": "GET",
  "headers": { "Authorization": "Bearer <redacted>" }
}
```

- `url` (required) — the endpoint to diagnose.
- `method` (optional, default `GET`) — HTTP method.
- `headers`, `query`, `body` (optional) — what to send.
- `docsUrl` or `spec` (optional) — docs or an OpenAPI spec; the Doctor uses it to validate the response schema and to write a better example request.

Example response:

```json
{
  "verdict": "broken",
  "failureClass": "auth",
  "summary": "Endpoint returns 401: the Authorization header is rejected.",
  "auth": { "scheme": "bearer", "diagnosis": "Token rejected; check expiry and scope." },
  "corrections": ["Send a valid Bearer token in the Authorization header."],
  "exampleRequest": {
    "method": "GET",
    "url": "https://api.example.com/v1/users",
    "headers": { "Authorization": "Bearer <valid-token>" }
  }
}
```

- `failureClass` — `auth` / `not_found` / `wrong_method` / `bad_request` / `server_error` / `timeout` / `schema_mismatch`.
- `exampleRequest` — a working request you can call next. Use it verbatim unless the failure class says otherwise.

**Gotchas:** public endpoints only in v1. Private/internal endpoints (localhost, RFC-1918, cloud metadata) are rejected, not diagnosed. Credentials are never stored; send them only in the request you are diagnosing.

## POST /v1/api/test-spec — $2.00 per spec

Test a full OpenAPI spec. Validates the spec (broken `$ref`s included), probes every endpoint, and reports how many work, which are broken, and by what failure class.

Example request:

```json
{ "specUrl": "https://example.com/openapi.json" }
```

- `specUrl` or `spec` (required) — a spec URL or an inline spec object.
- `samples` (optional) — sample values per endpoint, so probes send realistic bodies. **Endpoints without sample values are reported as `needs-sample-values`, not faked.** Send samples for the endpoints you care about.

## POST /v1/api/audit — $5.00 per audit

Audit a full OpenAPI spec. Everything in test-spec, plus auth diagnostics, full response-schema validation, and a corrected working request per endpoint. Use this when you need a complete report, not just a pass/fail count.

**Rule of thumb:** diagnose one endpoint ($0.50) → test-spec a whole API ($2.00) → audit it when you need the full report ($5.00). Do not start with audit.

---

# Job 3 — Sponsor gas (pay a transfer's execution fee)

**When:** a wallet needs to make a transfer but has no native token for gas. You pay the execution fee in USDC over x402; the transfer goes through without the wallet holding ETH, POL, or SOL.

**Workflow:**
1. GET `/v1/gas` (free) for the current rules, chains, and the sponsor address.
2. POST the unsigned operation to `/v1/gas`. The 402 is the quote.
3. Pay the quote, sign the returned typed data, and POST the signed operation back to the same URL. We dry-run and submit it.

## POST /v1/gas — from $0.03 per operation

ERC-4337 paymaster (EntryPoint v0.8) on Base and Polygon, paid over x402 in USDC. Price is `max($0.03, 1.3× the operation's gas cap)` — the quote in the 402 is exact, and the signed sponsorship locks gas limits and max fee.

Example request (plain EOA):

```json
{
  "sender": "0xYourWalletAddress",
  "calls": [{ "to": "0xRecipientAddress", "data": "0x", "value": "0" }]
}
```

- First POST returns 402 (the quote). Pay, then sign the returned typed data.
- If the wallet is already delegated to another EIP-7702 implementation (MetaMask, etc.), add `"redelegate": true` to the body and sign the returned authorization: it re-points the wallet to Simple7702Account in the same transaction (owner stays you, reversible).
- Bring your own operation: any EntryPoint v0.8 account can POST a `{userOperation}` unsigned → 402 → pay → sign it your account's way → POST back. We dry-run and submit it (no bundler, no stake).

## POST /v1/gas/solana — from $0.03 per transaction

Solana gas sponsorship. POST `{transaction}` with our sponsor as fee payer; pay from $0.03 in Solana USDC and get it back co-signed. GET the same URL (free) for the sponsor address and rules.

**Gotchas:** the paymaster is not staked yet, so POST the signed operation back here instead of to a public bundler. Standard ERC-7677 JSON-RPC is supported (`pm_getPaymasterStubData` free, `pm_getPaymasterData` paid; the 402 rides inside the JSON-RPC response).

---

# Job 4 — Check a URL before you click it

**When:** you have a URL and you need to know if it is safe to open, fetch, or send to a user. Phishing, typosquat, and scam check.

**Workflow:**
1. POST the URL. Start with `quick: true` ($0.01). If the verdict is `suspicious` or you need the full picture, run the full check ($0.05).
2. Read `verdict` and `action`. `allow` → proceed. `review` → show the findings. `block` → do not open it.

## POST /v1/link/check/agent — quick $0.01 / full $0.05

Website Watcher security intelligence for autonomous agents. Returns a fixed-schema assessment.

Example request:

```json
{ "url": "https://example.com/login", "quick": true }
```

- `url` (required) — the URL to check.
- `quick` (optional, default `false`) — `true` for the $0.01 quick check, `false` for the $0.05 full check.

Example response:

```json
{
  "verdict": "safe",
  "score": 92,
  "action": "allow",
  "summary": "No phishing, typosquat, or scam indicators found.",
  "findings": [],
  "categoryScores": { "typosquat": 95, "content": 90, "reputation": 92 }
}
```

- `verdict` — `safe` / `suspicious` / `dangerous` / `unknown`.
- `score` — 0–100. Higher is safer.
- `action` — `allow` / `review` / `block` / `retry`. Follow it.
- `findings` — top 5 findings, with category scores and facts.

**Quick vs full:** quick ($0.01) covers lookalike/typosquat detection, the in-house IOC list, page content and brand checks, and page-script malware patterns. Full ($0.05) adds DNS and SSL, domain age (direct WHOIS), brand impersonation, wallet extraction, redirect chain, and forms/JS behavior.

**Free:** repeat scans of the same URL within 1 hour return the cached result free. `unknown` stays unknown — a check that cannot reach the URL is not a pass.

---

# Job 5 — Research: search, extract, verify

**When:** you need facts from the web and you need to trust them. This is a three-step chain, not three separate calls.

**Research methodology (use this for any web research task):**
1. **Search** — find candidate pages.
2. **Extract** — turn the best page into clean Markdown.
3. **Verify** — run the URL through Job 4 before you cite it or send it to a user.

Do not cite a page you have not extracted, and do not send a user a URL you have not checked.

## GET /v1/search — $0.005 per search

Web search for agents. Ranked results with LLM-ready excerpts.

Example:

```
GET /v1/search?q=liquid+agent+x402
```

## GET /v1/extract — $0.002 per page

Turn any public web page into clean Markdown. Built to feed the Website Watcher: search, extract the page, then scan it with Job 4.

Example:

```
GET /v1/extract?url=https://example.com/article
```

## GET /v1/rpc — $0.002 flat per read

On-chain reads on Base or Arc. No key, no account. Latest block, a native or ERC-20 balance, or a transaction's details.

Examples:

```
GET /v1/rpc?op=block&chain=base
GET /v1/rpc?op=balance&chain=base&address=0xYourAddress
GET /v1/rpc?op=balance&chain=base&address=0xYourAddress&token=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
GET /v1/rpc?op=tx&chain=arc&hash=0xYourTxHash
```

- `op` — `block` / `balance` / `tx`.
- `chain` — `base` / `arc`.
- For `balance`, omit `token` for the native balance; pass a token contract address for an ERC-20 balance.

---

# Job 6 — Basket signals (one call, the whole basket)

**When:** you need the rebalancing signal for the Liquid Agent stock basket (tokenized US stocks: NVDAc, METAc, AAPLc, GOOGLc on Base) without hitting four sites.

## GET /v1/signals — $0.007 per call

The whole basket's rebalancing signal in one call: per-stock returns, annualized volatility, RSI, trend, relative strength, a correlation matrix, and an inverse-volatility suggested `weightsBps` you can drop straight into `POST /v1/set-weights` (then `/v1/rebalance`).

Example:

```
GET /v1/signals
GET /v1/signals?vault=0xYourVaultAddress
```

- `vault` (optional) — pass your vault address for current-vs-suggested drift.
- The suggested `weightsBps` sums to 10000. Use it as-is unless your user asked for custom weights.

---

# Job 7 — Bridge USDC (one signature, 16 chains)

**When:** you need USDC on another chain and you do not want to manage a bridge, approvals, or a second transaction.

**Workflow:**
1. GET `/v1/bridge/quote` (free) to see the exact delivery for your amount and route.
2. GET `/v1/bridge` — the 402 carries the terms (1% fee plus Circle's network fee, all in the quote). Pay and the bridge executes.
3. Check delivery at GET `/v1/bridge/status/<burnTx>` (free).

## GET /v1/bridge — one x402 payment, 1% fee + Circle network fee

The one-signature USDC bridge for x402 agents. Base → Arc, Arbitrum, OP Mainnet, Polygon, Avalanche, Unichain, Linea, World Chain, Sonic, Monad, Sei, Ink, HyperEVM, XDC, Plume, Codex (about 1.07 to 1.37 USDC to receive 1, depending on the chain; live prices at `/v1/bridge/routes`), and Arc → Base. Exact delivery to your own address in about 20 seconds, all fees included.

- Add `ref=<your address>` to earn 20% of the fee on-chain for referring agents.
- Free: `/v1/bridge/quote`, `/v1/bridge/routes`, `/v1/bridge/status/<burnTx>`, `/v1/bridge/guide`, `/v1/bridge/llms.txt`.
- Full bridge guide: `https://api.liquidagent.ai/v1/bridge/llms.txt`.

---

# Full catalog (price only)

Everything above is the job. The rest of the API, one line each:

**Stock basket (tokenized US stocks on Base — reads free, writes return unsigned calldata you sign):**
- GET /v1/basket — free. The 4 constituents, live prices, factory, fees.
- GET /v1/vault/{address} — free. A vault's NAV, weights, rebalance status.
- GET /v1/balance/{agent} — free. An agent's vaults, shares, USD value.
- GET /v1/quote?usdc=<amount6> — free. Preview shares + fee (1000000 = $1.00).
- POST /v1/create-vault — unsigned tx. Mint your own vault (one time).
- POST /v1/set-weights — unsigned tx. Custom allocation (bps, sum 10000).
- POST /v1/buy — unsigned tx. Buy the basket from $1 (EIP-2612 permit, no approve).
- POST /v1/rebalance — unsigned tx. Move a vault to its target weights.
- POST /v1/redeem — unsigned tx. Sell to USDC or take raw stock tokens in-kind.
- POST /v1/send — unsigned tx. Send basket shares to any wallet.
- POST /v1/publish — $0.01 flat. Publish a live, shareable portfolio page for 24h.
- Full guide: `https://api.liquidagent.ai/v1/guide`. Code examples: `https://github.com/LiquidAgent/liquidagentx402`.

**Local business leads (US small businesses, verified emails, buying signals):**
- GET /v1/leads/search — $0.03 per lead. By category and place; 1–1000 leads per call. `sample=1` returns 3 leads free; empty answers are free.
- GET /v1/leads/lookup — $0.01 per lookup that finds a business. No match, no charge.
- GET /v1/leads/tech — $0.005 per lookup that finds a verified site. No match, no charge.
- POST /v1/leads/enrich — $0.01 per input that finds a business. Misses are free.
- Free: `/v1/leads` (coverage, params), `/v1/leads/categories`, `/v1/leads/count`.

**Markets and shops:**
- GET /v1/polymarket/<asset>-<5m|15m> (btc, eth, sol, xrp) — $0.004 per call. The official price to beat. First call free with `?free=1`.
- GET /v1/shop/mintandmarquee/search — $0.001 per call. Gift and collectible search in a partner shop.

**Free debugging and status:**
- POST /v1/gas/decode — free. Decode a 402, verify a signed payment.
- GET /v1/status — free. Self-measured uptime, schema validity, latency.
- GET /v1/gas — free. Gas sponsor rules, chains, sponsor address.

---

# Machine-readable resources

- OpenAPI 3.1 spec: `https://api.liquidagent.ai/openapi.json`
- x402 discovery manifest: `https://api.liquidagent.ai/.well-known/x402`
- MCP server: `https://api.liquidagent.ai/mcp` — server card at `https://api.liquidagent.ai/.well-known/mcp/server.json`
- Agent card (A2A): `https://api.liquidagent.ai/.well-known/agent-card.json`
- API catalog (APIs.json): `https://api.liquidagent.ai/.well-known/api-catalog`
- Bridge guide: `https://api.liquidagent.ai/v1/bridge/llms.txt`
- Stock basket guide: `https://api.liquidagent.ai/v1/guide`
- Code examples (GitHub): `https://github.com/LiquidAgent/liquidagentx402`

## Contracts (Base mainnet)

- BasketVaultFactory: `0x1B205660780CbC57849019Df2BA64B719b00AEA8`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
