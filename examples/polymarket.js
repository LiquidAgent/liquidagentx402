// Liquid Polymarket: the OFFICIAL price to beat for Polymarket crypto Up/Down markets, live, for $0.004 per call.
// Polymarket's public API only publishes it after the window closes; this returns it from the start of the window.
//
//   npm i viem
//   node examples/polymarket.js --market btc-5m --index           # free: list markets
//   PRIVATE_KEY=0x... node examples/polymarket.js --market btc-5m   # paid: live window
//   PRIVATE_KEY=0x... node examples/polymarket.js --market eth-15m --start 1790653500   # paid: a past window's outcome
//
// Markets: btc-5m btc-15m eth-5m eth-15m sol-5m sol-15m xrp-5m xrp-15m
// Flow (x402 exact, EIP-3009): GET -> 402 with the price -> sign one USDC TransferWithAuthorization on Base -> repeat
// the GET with PAYMENT-SIGNATURE -> 200. Any x402 client (AgentCash, x402-fetch, CDP) does this for you.
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai");
const MARKET = arg("market", "btc-5m"), START = arg("start", "");
const MAX_ATOMIC = 10_000n; // refuse to pay more than $0.01 per call
const TREASURY = "0x487b28a4fbba8cf46eb6e1d72e6959202bb75e90"; // the only address this script will pay

if (process.argv.includes("--index")) { console.log(JSON.stringify(await (await fetch(`${API}/v1/polymarket`)).json(), null, 2)); process.exit(0); }
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required (or use --index)");
const agent = privateKeyToAccount(process.env.PRIVATE_KEY);
const url = `${API}/v1/polymarket/${MARKET}${START ? `?start=${START}` : ""}`;

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
console.log(r2.status, JSON.stringify(await r2.json(), null, 2));
