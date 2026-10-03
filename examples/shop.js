// Liquid gift search: search a partner shop (Mint & Marquee: custom 3D printed figurines, statues, keychains, bag tags)
// for $0.001 per search. Returns products with price, photo, a short description and a link to buy.
//
//   npm i viem
//   node examples/shop.js --info                                        # free: what the shop sells
//   PRIVATE_KEY=0x... node examples/shop.js --q "soccer gift" --max 30  # paid: $0.001 search, USDC on Base
//
// Flow (x402 exact, EIP-3009): GET -> 402 with the price -> sign one USDC TransferWithAuthorization on Base -> repeat
// the GET with PAYMENT-SIGNATURE -> 200. Any x402 client (AgentCash, x402-fetch, CDP) does this for you. The 402 also
// offers Arc and Polygon; this example pays on Base.
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai");
const SHOP = arg("shop", "mintandmarquee");
const MAX_ATOMIC = 2_000n; // refuse to pay more than $0.002 per search
const TREASURY = "0x487b28a4fbba8cf46eb6e1d72e6959202bb75e90"; // the only address this script will pay

if (process.argv.includes("--info")) { console.log(JSON.stringify(await (await fetch(`${API}/v1/shop/${SHOP}`)).json(), null, 2)); process.exit(0); }
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required (or use --info)");
const agent = privateKeyToAccount(process.env.PRIVATE_KEY);
const params = new URLSearchParams({ q: arg("q", "gift") });
if (arg("max")) params.set("max", arg("max"));
if (arg("limit")) params.set("limit", arg("limit"));
const url = `${API}/v1/shop/${SHOP}/search?${params}`;

// 1. ask: the 402 is the price
const r1 = await fetch(url);
if (r1.status !== 402) { console.log(r1.status, await r1.text()); process.exit(0); }
const req = JSON.parse(Buffer.from(r1.headers.get("payment-required"), "base64").toString());
const a = req.accepts.find((x) => x.network === "eip155:8453");
if (!a || a.payTo.toLowerCase() !== TREASURY || BigInt(a.amount) > MAX_ATOMIC) throw new Error("unexpected payment request, refusing to pay");

// 2. sign one USDC TransferWithAuthorization (no gas, no approve)
const now = Math.floor(Date.now() / 1000);
const authorization = { from: agent.address, to: a.payTo, value: a.amount, validAfter: "0", validBefore: String(now + 120), nonce: "0x" + randomBytes(32).toString("hex") };
const signature = await agent.signTypedData({
  domain: { name: a.extra.name, version: a.extra.version, chainId: 8453, verifyingContract: a.asset },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { ...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore) },
});

// 3. repeat with the payment
const header = Buffer.from(JSON.stringify({ x402Version: 2, accepted: a, payload: { signature, authorization } })).toString("base64");
const r2 = await fetch(url, { headers: { "PAYMENT-SIGNATURE": header } });
const out = await r2.json();
if (r2.status !== 200) { console.log(r2.status, out); process.exit(1); }
for (const p of out.products) console.log(`$${p.priceUsd}  ${p.name}\n        ${p.url}`);
console.log(`\n${out.foundWith.line}`);
