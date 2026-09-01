# Liquid Agent — Tokenized Stock Index for AI Agents (x402 · Base)

> **Buy tokenized US stocks on-chain, from an AI agent.** Mint your own vault holding a basket of Coinbase's tokenized **NVDA, META, AAPL, GOOGL** on Base — buy from **$1**, rebalance anytime, cash out any block. No oracle, no project token, fully self-custodial. Reads are free; every transaction is returned as **unsigned calldata** your agent signs and broadcasts with its own gas. The server holds no key.

**Live API:** https://api.liquidagent.ai · **Agent guide:** https://api.liquidagent.ai/v1/guide · **Status:** https://api.liquidagent.ai/v1/status

`x402` · `AI agents` · `tokenized stocks` · `Base` · `ERC-4626` · `ERC-8004` · `agentic commerce` · `no oracle` · `self-custodial`

---

## What is this?

**Liquid Agent** is an **agent-native tokenized-stock index** on Base. An autonomous agent (or a human) can:

- **Discover** the index and live prices over plain HTTP — no API key, no account, no allowlist.
- **Mint its own vault** (ERC-4626) holding a band-rebalanced basket of Coinbase's tokenized **NVDA / META / AAPL / GOOGL**.
- **Buy from $1**, set custom weights, rebalance, and **exit any block** — to USDC, or the raw stock tokens in-kind (un-trappable).

Every **read is free**. Every **write returns an unsigned transaction** the agent signs with its own wallet and broadcasts with its own gas — **the server never holds a key**, so there's no account to create and nothing to steal.

Built for the agent economy: **x402-discoverable**, an **A2A agent card**, `llms.txt` / `agents.txt`, and a permissionless **ERC-8004 on-chain identity** (agentId `74094` on Base).

## Why an agent picks this

Instead of picking four stocks, sizing each, buying them separately, and rebalancing by hand, an agent makes **one call** and owns a single auto-rebalanced share of a diversified tokenized-equity basket — self-priced (no oracle), redeemable any block, with no project token, all reachable over a live HTTP + x402 API.

## Discovery (machine-readable, self-hosted)

| Doc | URL |
|-----|-----|
| **Agent guide (full procedure)** | https://api.liquidagent.ai/v1/guide |
| OpenAPI 3.1 | https://api.liquidagent.ai/openapi.json |
| x402 discovery manifest | https://api.liquidagent.ai/.well-known/x402 |
| x402 resource catalog | https://api.liquidagent.ai/.well-known/x402-resources |
| A2A agent card | https://api.liquidagent.ai/.well-known/agent-card.json |
| ERC-8004 registration | https://api.liquidagent.ai/.well-known/erc8004.json |
| llms.txt | https://api.liquidagent.ai/llms.txt |

## Quickstart — create → buy → rebalance → exit

Reads are free. Writes return an unsigned `{to,data,value,chainId}` (or `{steps:[...]}`) that **you sign and broadcast**.

```bash
BASE=https://api.liquidagent.ai

# 1. Discover the index (free)
curl -s $BASE/v1/basket

# 2. Preview a $2 buy (free; USDC-6, so 2000000 = $2.00)
curl -s "$BASE/v1/quote?usdc=2000000"

# 3. Open your vault (ONE time) — returns an unsigned tx; sign + broadcast it
curl -s -X POST $BASE/v1/create-vault -H 'content-type: application/json' -d '{}'

# 4. Find your vault address
curl -s $BASE/v1/balance/0xYourAddress          # -> vaults[0].vault

# 5. (optional) Set custom weights — bps summing to 10000; sign + broadcast
curl -s -X POST $BASE/v1/set-weights -H 'content-type: application/json' \
  -d '{"vault":"0xYourVault","weightsBps":[4000,2000,2000,2000]}'

# 6. Buy in — ONE tx, no approve: get an EIP-2612 permit payload, sign it OFF-CHAIN,
#    then exchange the signature for a single unsigned depositWithPermit tx
curl -s -X POST $BASE/v1/buy -H 'content-type: application/json' \
  -d '{"vault":"0xYourVault","usdc":"2000000","permit":true,"owner":"0xYourAddress"}'
#    -> {typedData} ... sign with eth_signTypedData_v4, then:
curl -s -X POST $BASE/v1/buy -H 'content-type: application/json' \
  -d '{"vault":"0xYourVault","usdc":"2000000","permit":{"deadline":<from typedData>,"signature":"0x..."}}'
#    (omit `permit` entirely for the legacy approve + deposit two-step)

# 7. Check your vault (free)
curl -s $BASE/v1/vault/0xYourVault

# 8. (optional) Rebalance to target — sign + broadcast
curl -s -X POST $BASE/v1/rebalance -H 'content-type: application/json' -d '{"vault":"0xYourVault"}'

# 9. Cash out — to USDC or raw tokens; sign + broadcast
curl -s -X POST $BASE/v1/redeem -H 'content-type: application/json' \
  -d '{"vault":"0xYourVault","shares":"<amount>","inKind":false}'
```

**Signing:** every write returns an unsigned `{to,data,value,chainId}`. Sign it with your own wallet and broadcast via `eth_sendRawTransaction` to any Base RPC. `deposit` / `rebalance` / `redeem` swap B20 precompile tokens, which break naive public-RPC gas estimation — if estimation fails, pass an explicit gas limit of **~3,000,000**.

Runnable examples: [`examples/buy.js`](examples/buy.js) (viem) · [`examples/buy.py`](examples/buy.py) (Python) · [`examples/read.sh`](examples/read.sh) (curl).

## Endpoints

**Reads (free):** `GET /v1/basket` · `GET /v1/vault/{address}` · `GET /v1/balance/{agent}` · `GET /v1/quote?usdc=` · `GET /v1/guide`
**Writes (return unsigned calldata):** `POST /v1/create-vault` · `/v1/set-weights` · `/v1/buy` · `/v1/rebalance` · `/v1/redeem` *(sell / cash out)* · `/v1/send` *(transfer to any wallet)*
**Paid (x402):** `GET /v1/signals` *($0.04 — the basket's rebalancing signal in one call)* · `POST /v1/publish` *($0.25 — a live, shareable portfolio page)*

An agent can **buy** the basket, **sell** it any block (`/v1/redeem` → USDC or the raw stocks in-kind), and **send** it to any wallet (`/v1/send`) — gift or hand a whole tokenized-stock basket to another agent in one transfer, no vault needed on their end.

Full spec in [`openapi.json`](openapi.json).

## Paid: basket signals (x402)

`GET /v1/signals` — **$0.04 USDC per call** — one call returns the whole basket's rebalancing signal, so an agent doesn't have to visit four sites: per-stock returns, annualized volatility, RSI, trend, relative strength, a correlation matrix, and an **inverse-volatility suggested `weightsBps`** you can drop straight into `POST /v1/set-weights` → `POST /v1/rebalance`. Add `?vault=<yours>` to also get current-vs-suggested **drift** for your vault.

Pay by signing a USDC authorization (x402 **exact** scheme, EIP-3009, on Base) — any x402-aware client handles the 402 automatically:

```bash
curl -s https://api.liquidagent.ai/v1/signals            # -> 402 with the x402 payment challenge
# an x402 client (AgentCash, x402-fetch, CDP) pays the $0.04, then receives:
# { "basket":[{symbol,returns,volAnnualPct,rsi14,trend,relStrengthM1}, ...],
#   "basketStats":{ "correlation": {...} },
#   "signals":{ "riskParityWeightsBps":[...], "biasVsEqualWeightBps":[...], "momentumRankDesc":[...] } }
```

Everything else stays **free** — this is the one paid resource.

## Addresses — Base mainnet (chainId 8453)

| | |
|---|---|
| BasketVaultFactory | `0x1B205660780CbC57849019Df2BA64B719b00AEA8` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| NVDAc (NVIDIA) | `0xb20000000000000000000078ee7ce2fE4908108C` |
| METAc (Meta) | `0xb2000000000000000000008bC8786B856E61707C` |
| AAPLc (Apple) | `0xb200000000000000000000C2e324d24d7eEcd1fb` |
| GOOGLc (Alphabet) | `0xb2000000000000000000002D0BA3164cc74f58B7` |
| Fee sink / treasury | `0x487b28A4FbbA8Cf46eb6E1d72e6959202Bb75e90` |
| ERC-8004 identity | `eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/74094` |

## Fees & mechanics

- **0.20%** mint fee on deposits · **0.90%/yr** streaming management fee · **no performance fee**. Both hard-capped in bytecode.
- **Self-priced NAV** from a pool TWAP with a spot-vs-TWAP circuit breaker that fails closed. **No external oracle.**
- **Band-rebalanced** at a 5% drift band + 1h cooldown; a 5% USDC buffer smooths flows.
- **In-kind redemption** is price-free and can never be paused — you're never trapped.
- **No project token in the live index.** (A LIQUID revenue-share token is on the later roadmap; the Phase 1 index itself has none.)

## License

MIT — see [LICENSE](LICENSE).
