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

Every **read is free**. Every **write returns an unsigned transaction** the agent signs with its own wallet and broadcasts with its own gas (or hands it to the **gas sponsor** and pays in USDC) — **the server never holds a key**, so there's no account to create and nothing to steal.

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

## Agent skill (OpenClaw · ClawHub · skills.sh)

A ready-made skill that teaches an agent the whole flow lives in [`skills/liquid-agent-stocks/SKILL.md`](skills/liquid-agent-stocks/SKILL.md).

```bash
clawhub install liquid-agent-stocks          # OpenClaw / ClawHub — the stock index
clawhub install liquid-gas-sponsor           # OpenClaw / ClawHub — the gas sponsor (transact with USDC only, no ETH)
npx skills add LiquidAgent/liquidagentx402   # skills.sh (any agent that reads SKILL.md)
```

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
**Paid (x402):** `GET /v1/signals` *($0.04 — the basket's rebalancing signal in one call)* · `POST /v1/publish` *($0.25 — a live, shareable portfolio page)* · `POST /v1/gas` *(from $0.03 — the gas sponsor: transact with USDC only, no ETH)*

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

Everything else stays **free**; the paid resources are signals, publish, and the gas sponsor below.

## Paid: gas sponsor (x402) — transact with USDC only, no ETH

Most agent wallets hold USDC and nothing else. `POST /v1/gas` is an **ERC-4337 paymaster you pay per operation in USDC over x402**: no ETH, no account, no API key. Price is `max($0.03, 1.3 × the operation's gas cap)`; the signed sponsorship locks the gas limits and max fee, so the sponsor can never charge more than it quoted. **One endpoint, the body picks the lane:**

**Smart-wallet SDKs (ERC-7677).** Point the SDK's paymaster URL at `https://api.liquidagent.ai/v1/gas`. `pm_getPaymasterStubData` is free; an unpaid `pm_getPaymasterData` returns a JSON-RPC error `{code:402, data:<x402 PaymentRequired>}` (HTTP stays 200 so SDKs don't choke). Put the x402 payment object in `params[3].context.x402` and retry. **Then send the signed operation back to the same URL, not to a public bundler:** bundlers only relay staked paymasters and this one is not staked yet, so the bring-your-own-operation step below is the last mile (we dry-run and submit it ourselves).

**Plain wallets (any EOA, via EIP-7702).** Two calls to the same URL:

```bash
# 1. quote: the 402 IS the quote (exact price for THIS operation, valid 120 s)
curl -s -X POST https://api.liquidagent.ai/v1/gas -H 'content-type: application/json' \
  -d '{"sender":"0xYourEOA","calls":[{"to":"0x…","data":"0x…","value":"0"}]}'      # any calls, e.g. an unsigned tx from this API
# 2. pay it: an x402 client repeats the call with X-PAYMENT and receives
#    { userOperation (sponsored), typedData, authorization? (EIP-7702, only if your EOA is not delegated yet), validUntil }
#    sign typedData with eth_signTypedData_v4 (+ sign the authorization if given), then POST them back to the same URL:
#    {"userOperation": <with signature>, "authorization": <signed, optional>}  -> we submit; our deposit pays the gas.
#    No further charge. Only operations we sponsored are accepted, once each.
```

Full walkthrough with signatures in [`examples/gasless.js`](examples/gasless.js) — a wallet with **zero ETH** buys the index end to end.

**Any other smart account (bring your own operation).** Already delegated to a different EIP-7702 implementation, or running a deployed smart account (Kernel, Safe, Nexus…) on EntryPoint v0.8? Build the operation with your own SDK and let the sponsor submit it — **no bundler, no paymaster stake, no ETH**:

```bash
# 1. quote: POST the UNSIGNED EntryPoint v0.8 operation (sender = your account, your calldata, your gas limits)
curl -s -X POST https://api.liquidagent.ai/v1/gas -H 'content-type: application/json' \
  -d '{"userOperation":{"sender":"0xYourAccount","nonce":"0x…","callData":"0x…","callGasLimit":"0x…","verificationGasLimit":"0x…","preVerificationGas":"0x…","maxFeePerGas":"0x…","maxPriorityFeePerGas":"0x…","signature":"0x"}}'
# 2. pay the 402 and repeat -> { userOperation (with the paymaster fields), typedData, validUntil }
# 3. sign it the way YOUR account expects (viem: account.signUserOperation), POST {"userOperation": <with signature>} to the same URL.
#    The sponsor dry-runs it through the EntryPoint first: a rejected dry run costs nothing and can be retried before validUntil.
```

Working reference in [`examples/gasless-bring-your-own.js`](examples/gasless-bring-your-own.js): swap the account constructor for your SDK's. `GET /v1/gas` describes the sponsor; `GET /v1/gas/stats` shows live usage.

## Addresses — Base mainnet (chainId 8453)

| | |
|---|---|
| BasketVaultFactory | `0x1B205660780CbC57849019Df2BA64B719b00AEA8` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| NVDAc (NVIDIA) | `0xb20000000000000000000078ee7ce2fE4908108C` |
| METAc (Meta) | `0xb2000000000000000000008bC8786B856E61707C` |
| AAPLc (Apple) | `0xb200000000000000000000C2e324d24d7eEcd1fb` |
| GOOGLc (Alphabet) | `0xb2000000000000000000002D0BA3164cc74f58B7` |
| Fee sink / treasury (x402 payTo) | `0x487b28A4FbbA8Cf46eb6E1d72e6959202Bb75e90` |
| Gas sponsor paymaster (EntryPoint v0.8) | `0x9676897c3bf08977cdbe78213f84e72a29b844ec` |
| EntryPoint v0.8 | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` |
| Simple7702Account (EOA delegation target) | `0xe6Cae83BdE06E4c305530e199D7217f42808555B` |
| ERC-8004 identity | `eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/74094` |

## Fees & mechanics

- **0.20%** mint fee on deposits · **0.90%/yr** streaming management fee · **no performance fee**. Both hard-capped in bytecode.
- **Self-priced NAV** from a pool TWAP with a spot-vs-TWAP circuit breaker that fails closed. **No external oracle.**
- **Band-rebalanced** at a 5% drift band + 1h cooldown; a 5% USDC buffer smooths flows.
- **In-kind redemption** is price-free and can never be paused — you're never trapped.
- **No project token in the live index.** (A LIQUID revenue-share token is on the later roadmap; the Phase 1 index itself has none.)

## License

MIT — see [LICENSE](LICENSE).
