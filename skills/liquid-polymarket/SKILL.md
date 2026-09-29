---
name: liquid-polymarket
description: The official price to beat for Polymarket's crypto Up/Down markets (BTC, ETH, SOL, XRP on 5m and 15m), live from the start of each window, plus the live Chainlink price, seconds left, token ids and market prices. Polymarket's public API only publishes the price to beat after the window closes. $0.002 per call over x402, no account, no API key.
homepage: "https://api.liquidagent.ai/v1/polymarket"

metadata:
  openclaw:
    requires:
      bins: ["curl"]
---

# Liquid Polymarket: the official price to beat, live

Polymarket's crypto Up/Down markets settle Up when the Chainlink average at the end of the window is at or above
the **price to beat**, the 60 s Chainlink TWAP just before the window starts. Polymarket's public API only shows
that number after the window closes. **GET `https://api.liquidagent.ai/v1/polymarket/<asset>-<timeframe>`** returns
it live, from the first seconds of the window.

- Markets: `btc-5m`, `btc-15m`, `eth-5m`, `eth-15m`, `sol-5m`, `sol-15m`, `xrp-5m`, `xrp-15m`
- Price: **$0.002 USDC per call**, x402 exact (EIP-3009), USDC on Base or Polygon. Never charged if it cannot answer.
- **First call free:** add `?free=1` for one live answer at no charge (one per agent), no wallet needed.
- Accuracy: matched Polymarket's published price to beat to every decimal, and the outcome, on every resolved window
  tested, including live paid calls checked against the value Polymarket published after close.
- Free index: `https://api.liquidagent.ai/v1/polymarket`

## When to use this skill

- You trade or quote Polymarket crypto Up/Down markets and need the exact line during the window
- You want to know how far the live Chainlink price is from the price to beat, and how long is left
- You need the official settle and outcome of a past window (`?start=<unix window start>`)

## Call it

```bash
# Free: list markets and prices
curl -s https://api.liquidagent.ai/v1/polymarket

# Paid ($0.002): any x402 client pays the 402 and repeats the call
npx agentcash fetch https://api.liquidagent.ai/v1/polymarket/btc-5m
```

Response (live window):

```json
{
  "status": "live",
  "market": { "asset": "BTC", "timeframe": "5m", "slug": "btc-updown-5m-1790653200", "secondsLeft": 284,
              "upTokenId": "2727...", "downTokenId": "9238..." },
  "priceToBeat": 83094.1139894528,
  "priceToBeatSource": "Polymarket official (60 s Chainlink TWAP before the window)",
  "chainlink": { "price": 83085.16, "at": "2026-09-29T03:40:14.000Z", "ageSeconds": 0.5 },
  "distance": -8.95,
  "marketPrices": { "up": 0.435, "down": 0.565 }
}
```

Past window: `GET /v1/polymarket/btc-5m?start=1790653200` returns `priceToBeat`, `settlePrice`, `outcome` and
Polymarket's `officialOutcome`.

## Rule

Price to beat = TWAP of Chainlink over the 60 s before the window. Settle = mean of the 60 per-second Chainlink
ticks stamped end-62 s ... end-3 s. Up if settle >= price to beat.

Data, not financial advice. Polymarket may be restricted in your jurisdiction.
