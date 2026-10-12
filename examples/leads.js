// Liquid Leads: US local businesses by category and place, with a checked email (graded A/B/C), contact name, phone,
// a website proven by the business's own phone number, socials and buying signals. $0.03 per lead, flat.
//
//   npm i viem
//   node examples/leads.js --count --category dentist --city Atlanta                   # free: matches and exact price
//   PRIVATE_KEY=0x... node examples/leads.js --category dentist --city Atlanta --limit 10   # paid: 10 leads = $0.30
//
// Flow (x402 exact, EIP-3009): GET -> 402 with the exact total -> sign one USDC TransferWithAuthorization on Base ->
// repeat the GET with PAYMENT-SIGNATURE -> 200. Any x402 client (AgentCash, x402-fetch, CDP) does this for you. The
// 402 also offers Arc; this example pays on Base.
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai");
const LIMIT = Number(arg("limit", "10"));
const MAX_ATOMIC = BigInt(LIMIT) * 30_000n; // refuse to pay more than $0.03 a lead
const TREASURY = "0x487b28a4fbba8cf46eb6e1d72e6959202bb75e90"; // the only address this script will pay

const params = new URLSearchParams({ category: arg("category", "dentist"), limit: String(LIMIT) });
for (const k of ["city", "county", "zip", "near", "radiusKm", "email", "minGrade", "website", "booking", "payments"]) if (arg(k)) params.set(k, arg(k));
if (!params.has("city") && !params.has("county") && !params.has("zip") && !params.has("near")) params.set("city", "Atlanta");

if (process.argv.includes("--count")) { console.log(JSON.stringify(await (await fetch(`${API}/v1/leads/count?${params}`)).json(), null, 2)); process.exit(0); }
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required (or use --count)");
const agent = privateKeyToAccount(process.env.PRIVATE_KEY);
const url = `${API}/v1/leads/search?${params}`;

// 1. ask: the 402 is the exact total for the leads that exist
const r1 = await fetch(url);
if (r1.status !== 402) { console.log(r1.status, await r1.text()); process.exit(0); }
const req = JSON.parse(Buffer.from(r1.headers.get("payment-required"), "base64").toString());
const a = req.accepts.find((x) => x.network === "eip155:8453");
if (!a || a.payTo.toLowerCase() !== TREASURY || BigInt(a.amount) > MAX_ATOMIC) throw new Error("unexpected payment request, refusing to pay");
console.log(req.note || `paying $${Number(a.amount) / 1e6}`);

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
for (const l of out.leads) console.log(`${l.name}  ${l.phone || ""}  ${l.email ? `${l.email.address} (${l.email.grade})` : "no email"}\n        ${l.website || "no website"}`);
console.log(`\n${out.count} leads, $${out.priceUsd}${out.next ? `  next page: ${out.next}` : ""}`);
