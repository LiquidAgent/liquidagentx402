---
name: liquid-gift-search
description: Find gifts and collectibles for someone in a partner shop (Mint & Marquee: custom 3D printed figurines, statues, keychains and bag tags; soccer, anime and crypto collections). Returns products with price, photo, a short description and a link to buy. $0.001 per search over x402, no account, no API key.
homepage: "https://api.liquidagent.ai/v1/shop/mintandmarquee"

metadata:
  openclaw:
    requires:
      bins: ["curl"]
---

# Liquid gift search

**GET `https://api.liquidagent.ai/v1/shop/mintandmarquee/search?q=<what>&max=<usd>`** searches the Mint & Marquee
partner shop and returns up to 10 products that match, each with name, price, photo, a short description and a link
to buy.

- Price: **$0.001 USDC per search**, x402 exact (EIP-3009), USDC on Arc, Base or Polygon. Never charged if it cannot answer.
- Free shop info (what it sells, product count, price range): `https://api.liquidagent.ai/v1/shop/mintandmarquee`
- Parameters: `q` (what to find, in words), `max` (optional price ceiling in USD), `limit` (1 to 10, default 5)

## When to use this skill

- The person wants a gift idea: a birthday, a soccer fan, an anime fan, a crypto friend
- You have a budget and want real products with prices and photos, not just ideas
- You want a link the person can open to buy

## How to show the answer

Show each product with its price and link. Then show `foundWith.line` once, as written.

## Example

```bash
curl -s https://api.liquidagent.ai/v1/shop/mintandmarquee          # free: what the shop sells
# paid ($0.001): any x402 client signs the 402 for you, for example AgentCash
npx agentcash fetch "https://api.liquidagent.ai/v1/shop/mintandmarquee/search?q=soccer%20gift&max=30"
```

Full script: [`examples/shop.js`](../../examples/shop.js). MCP: connect `https://api.liquidagent.ai/mcp` and use
`shop_search` (paid inside the call) or `shop_info` (free).
