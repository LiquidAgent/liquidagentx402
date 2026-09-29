---
name: liquid-usdc-bridge
description: Move USDC from Base to 16 chains (Arc, Arbitrum, OP, Polygon, Avalanche, Unichain, Linea, World Chain, Sonic, Monad, Sei, Ink, HyperEVM, XDC, Plume, Codex), or from Arc to Base, with one x402 signature. No transaction to build, no approvals, no gas token; you receive exactly the amount you ask for at your own address. Refer other agents with ref= and earn 20% of the fee on-chain. No account, no API key.
homepage: "https://api.liquidagent.ai/v1/bridge/guide"

metadata:
  openclaw:
    requires:
      bins: ["curl"]
---

# Liquid Bridge — the one-signature USDC bridge for x402 agents

Your agent holds USDC on one chain and needs it on another. **GET `https://api.liquidagent.ai/v1/bridge`**
answers with an x402 **402** that is the exact price. Sign one standard payment, repeat the call, and the
USDC arrives at **your own address** on the destination, usually in 10 to 20 seconds. Non-custodial: your
payment goes to the bridge contract, which burns it through Circle CCTP to you in the same transaction.

- Live routes: **Base -> 16 chains** (Arc, Arbitrum, OP Mainnet, Polygon, Avalanche, Unichain, Linea, World Chain, Sonic, Monad, Sei, Ink, HyperEVM, XDC, Plume and Codex; pay on Base) and **Arc -> Base** (pay on Arc)
- Price: **1% of the amount**, plus Circle's network fee and gas at cost, all in the quote.
  Example: receive 1 USDC on Arc for about 1.035 USDC on Base; receive 1 USDC on Base for about 1.078 USDC on Arc.
  Minimum 1 USDC. Liquid's fee can never exceed max(3%, $0.05): the contract enforces it.
- Delivery: always to the payer's own address; smart-contract wallets are refused before any charge
- Your x402 client must support the source chain (Base works with AgentCash, x402-fetch, CDP; Arc needs an Arc-capable client)

## When to use this skill

- You have USDC on Base and a service, agent or contract you need to pay lives on Arc (or the reverse)
- You want to move funds between chains without holding ETH or building CCTP transactions
- You run a tool, wallet or MCP server and want to earn on every bridge your users make (see Earn)

## Three steps

```bash
# 0. free quote (no payment)
curl -s "https://api.liquidagent.ai/v1/bridge/quote?from=base&to=arc&amount=1"

# 1. ask: HTTP 402, the PAYMENT-REQUIRED header (base64 JSON, x402 v2) holds network, asset, payTo, amount
curl -si "https://api.liquidagent.ai/v1/bridge?from=base&to=arc&amount=1"

# 2. sign one EIP-3009 TransferWithAuthorization to payTo for exactly `amount`
#    (EIP-712 domain = extra.name / extra.version from the 402: "USD Coin" v2 on Base, "USDC" v2 on Arc)
# 3. repeat the same call with the PAYMENT-SIGNATURE header -> 200 {status, receive, burnTx, mintTx, referrerEarned}
```

An x402 client does steps 1 to 3 for you. Runnable example: [`examples/bridge.js`](../../examples/bridge.js).

## Earn: agents referring agents

- Add `ref=<your address>` to any bridge URL you call or share: **20% of Liquid's fee** is credited to you,
  on-chain, in the same transaction, on the chain where the referred agent paid.
- The first referrer of a payer also earns on that payer's later bridges that carry no `ref`.
- Self-referral is allowed (it works as a 20% discount).
- Paid out daily once your balance reaches $0.01, or call `claim()` on the contract any time.
- Check your earnings: `GET https://api.liquidagent.ai/v1/bridge/earnings/<your address>`

## If something goes wrong

- **202**: sent, still confirming. Follow `statusUrl`; do not pay again.
- **502 "bridge not submitted"**: your authorization was not used; nothing was charged.
- **402 again**: the price moved or your authorization expired; sign the new amount.
- **Same signature sent twice**: settled at most once. A new signature is a new bridge.
- **Attested but never minted (rare)**: `GET https://iris-api.circle.com/v2/messages/<6 for Base | 26 for Arc>?transactionHash=<burnTx>`,
  then call `receiveMessage(message, attestation)` on MessageTransmitterV2 `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`
  on the destination. The USDC always goes to you.

## Contracts (no owner, no pause, no withdraw)

| Chain | Bridge contract (x402 payTo) | USDC |
|---|---|---|
| Base `eip155:8453` | `0xbf43e09b91c4d4aa55e033a3487f345ce4ed7557` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Arc `eip155:5042` | `0x3bc7bf1afc96c1de35ac48e1a0a3cc3d617a77b1` | `0x3600000000000000000000000000000000000000` |

Full guide: https://api.liquidagent.ai/v1/bridge/guide · OpenAPI: https://api.liquidagent.ai/v1/bridge/openapi.json · llms.txt: https://api.liquidagent.ai/v1/bridge/llms.txt
