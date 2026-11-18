---
name: liquid-agent
description: Pay for live API calls in USDC over x402 — sponsor gas, check Polymarket price-to-beat, read stock basket signals, find US business leads, check whether a URL is safe, scan code for malware, diagnose, test or audit an API, search the web and read on-chain data, move USDC between chains, search a gift shop. Use when an agent needs to pay for a live API call, sponsor a transaction without holding native gas, check a market price, identify a business, verify code before running it, or move USDC cross-chain.
---

# Liquid Agent

Money tools for AI agents, paid per call in USDC over x402 (v2). No account, no API key. Every paid call returns a `402` you settle in USDC; the response then returns `200` with the result.

- Base URL: `https://api.liquidagent.ai`
- Chains: Base (default), Arc, Polygon, Solana (gas only)
- Discovery: `/.well-known/x402` (machine-readable catalog), `/openapi.json` (60 paths), `/llms-full.txt` (full guide as Markdown), `/mcp.json`
- MCP server (free, 47 tools): `https://api.liquidagent.ai/mcp`
- Worked examples (JS + Python): `https://github.com/LiquidAgent/liquidagentx402`

## How paying works

1. Call the endpoint. It answers `402` with an `accepts` array: amount, asset (USDC), network, payee, and the EIP-3009 payload to sign.
2. Sign the payment authorization with the payer wallet and send the call again with the `X-PAYMENT` header (base64 of the signed payload). See the examples repo for `viem` (JS) and `web3` (Python) code.
3. The call settles on-chain (usually via the CDP facilitator) and returns `200`.

Free calls (quotes, coverage, docs) never return a `402`.

## Paid endpoints

| What | Endpoint | Price |
|---|---|---|
| Gas sponsor — pay an agent's gas in USDC, no ETH/POL/SOL needed | `POST /v1/gas` | from $0.03 |
| Gas sponsor on Solana | `POST /v1/gas/solana` | from $0.03 |
| Transaction preflight (simulate, decode reverts, estimate cost) | `POST /v1/gas/preflight` | $0.005 |
| Polymarket 5m / 15m Up/Down price-to-beat (BTC, ETH, SOL, XRP) | `GET /v1/polymarket/{asset}-{5m,15m}` | $0.004 |
| Stock basket signals (returns, volatility, RSI, risk-parity weights) | `GET /v1/signals` | $0.007 |
| Business leads by category and place (graded email, contact, phone) | `GET /v1/leads/search` | $0.03/lead |
| Identify a business from a phone number or website | `GET /v1/leads/lookup` | $0.01 |
| What a business website runs on | `GET /v1/leads/tech` | $0.005 |
| Website safety check, quick (verdict, score 0–100, action) | `POST /v1/link/check/agent` + `{"url": "...", "quick": true}` | $0.01 |
| Website safety check, full report (threat intel, DNS/SSL, redirects, forms) | `POST /v1/link/check/agent` + `{"url": "...", "quick": false}` | $0.05 |
| Malware scan, one file (verdict, score 0–100, action; static, never executed) | `POST /v1/malware/scan` + `{"filename": "...", "content": "..."}` | $0.05 |
| Malware scan, folder of up to 100 files, one verdict | `POST /v1/malware/scan-batch` + `{"files": [{"filename": "...", "content": "..."}]}` | $0.05 |
| Malware scan, public GitHub repo (working tree + history) | `POST /v1/malware/scan-repo` + `{"repoUrl": "https://github.com/owner/repo"}` | $0.05 |
| API Doctor: diagnose one endpoint live (verdict, failure class, corrections, working example) | `POST /v1/api/diagnose` + `{"url": "https://api.example.com/endpoint"}` | $0.50 |
| API Doctor: validate an OpenAPI spec and probe every endpoint | `POST /v1/api/test-spec` + `{"specUrl": "https://api.example.com/openapi.json"}` | $2.00 |
| API Doctor: audit a spec (test-spec + auth diagnostics + corrected request per endpoint) | `POST /v1/api/audit` + `{"specUrl": "https://api.example.com/openapi.json"}` | $5.00 |
| Web search (ranked results, LLM-ready excerpts) | `GET /v1/search?q=...` | $0.005 |
| Turn any public web page into clean Markdown | `GET /v1/extract?url=...` | $0.002 |
| On-chain reads: latest block, native or ERC-20 balance, transaction details | `GET /v1/rpc?op=block\|balance\|tx&chain=base\|arc` | $0.002 |
| USDC bridge Base ↔ 16 chains (Arc, Arbitrum, OP, Polygon…), one signature | `GET /v1/bridge?from=base&to=arc&amount=1` | 1% |
| Gift and collectible search | `GET /v1/shop/mintandmarquee/search?q=...` | $0.001 |
| Live shareable portfolio page (24h) | `POST /v1/publish` | $0.01 |

## Free endpoints

Quotes and coverage before paying: `GET /v1/leads/count`, `GET /v1/leads/categories`, `GET /v1/bridge/quote`, `GET /v1/bridge/routes`, `GET /v1/gas` (info), `GET /v1/guide` (plain-English walkthrough), `GET /v1/basket`, `GET /v1/quote?usdc=1`.

## Rules for agents

- Check the free quote/coverage endpoint first when one exists (leads count, bridge quote) so you know the exact price before paying.
- Never pay for a call whose free preview already answers the question.
- The 402 response is the price: if the amount in `accepts` is higher than the table above, do not pay — re-check the docs.
- Gas sponsorship pays the agent's transaction fees only; it never moves the agent's own funds.
