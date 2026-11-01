---
name: liquid-chain-tools
description: Multi-chain transaction and event-log decoding, Base batch preflight, decoded EVM logs, and bulk lead enrichment over x402. No account, no API key, and no transaction signing or broadcasting.
homepage: "https://api.liquidagent.ai"

metadata:
  openclaw:
    requires:
      bins: ["curl"]
---

# Liquid chain tools and bulk enrichment

Use these read-only endpoints to inspect transactions before signing, decode chain activity, and enrich businesses. Fees are paid per completed call over x402. Provider failures and output-limit failures are not charged. Valid simulation reverts are completed results.

## Endpoints

| Endpoint | Price | Use |
|---|---:|---|
| `POST /v1/gas/preflight` | $0.005 | Simulate one unsigned Base call with optional `from` as `msg.sender`. Returns success or a decoded revert, gas estimate, and indicative USDC sponsorship estimate. |
| `POST /v1/gas/preflight/batch` | $0.005 + $0.002 per additional call | Simulate 1-20 Base calls with one block, one fee snapshot, and one settlement. Per-call success or revert and aggregate gas. |
| `POST /v1/gas/decode` | $0.003 | Decode a transaction and ordered logs with your ABI on Base, Polygon, Arbitrum, Optimism, or Avalanche. Unknown selectors/events retain raw data with `decoded:false`. |
| `POST /v1/chain/logs` | $0.005 per started 1,000 blocks | Retrieve and decode EVM event logs with adaptive chunking and raw fallback. Maximum 10,000 blocks, 100 logs, or 1 MiB output. |
| `POST /v1/leads/enrich` | $0.01 per input that finds a business; misses free | Enrich 1-100 websites or US phone numbers with full business details, graded email, contact, socials, and website tech. One settlement for the exact hit count. |

Service chains for decoder and logs: Base `8453`, Polygon `137`, Arbitrum `42161`, Optimism `10`, Avalanche `43114`. Batch preflight is Base-only. Payment-network offers depend on the live 402; logs currently includes Arc USDC when settlement is available.

## Call them

```bash
# Base preflight
npx agentcash fetch https://api.liquidagent.ai/v1/gas/preflight -m POST -b '{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x","value":"0"}'

# Batch preflight (two calls)
npx agentcash fetch https://api.liquidagent.ai/v1/gas/preflight/batch -m POST -b '{"calls":[{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x","value":"0"},{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x","value":"0"}]}'

# Decode a transaction and its logs (supply the contract ABI)
npx agentcash fetch https://api.liquidagent.ai/v1/gas/decode -m POST -b '{"chain":8453,"txHash":"0xc9a9b57ffcb07e1c23ae6e66f161ab02bb97626026a571268197c835ec968245","abi":[{"type":"function","name":"transferWithAuthorization","stateMutability":"nonpayable","inputs":[],"outputs":[]},{"type":"event","name":"Transfer","inputs":[{"name":"from","type":"address","indexed":true},{"name":"to","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}]}]}'

# Decode Transfer events in one block
npx agentcash fetch https://api.liquidagent.ai/v1/chain/logs -m POST -b '{"chain":8453,"address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","fromBlock":"53355207","toBlock":"53355207","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"],"abi":[{"type":"event","name":"Transfer","inputs":[{"name":"from","type":"address","indexed":true},{"name":"to","type":"address","indexed":true},{"name":"value","type":"uint256","indexed":false}]}]}'

# Enrich a business website and a guaranteed miss
npx agentcash fetch https://api.liquidagent.ai/v1/leads/enrich -m POST -b '{"records":[{"domain":"atlantadentistrybydesign.com"},{"domain":"no-such-business-9f3k2.example"}]}'
```

Every successful response includes a `_paid` receipt when settlement completes. No target transaction is signed or broadcast by these endpoints.
