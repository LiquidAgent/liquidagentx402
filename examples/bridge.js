// Liquid Bridge — move USDC between Base and Arc with ONE x402 signature. No transaction to build, no approvals,
// no gas token. You receive exactly the amount you ask for, at your own address, usually in 10 to 20 seconds.
//
//   npm i viem
//   node examples/bridge.js --quote                                  # free: just show the price (no key needed)
//   PRIVATE_KEY=0x... node examples/bridge.js --from base --to arc --amount 1
//   PRIVATE_KEY=0x... node examples/bridge.js --from arc --to base --amount 1 --ref 0xYourReferrer
//
// The flow is plain x402 "exact" (EIP-3009):
//   1. GET /v1/bridge?from=&to=&amount=[&ref=]      -> 402, the PAYMENT-REQUIRED header holds the exact price
//   2. sign one TransferWithAuthorization to payTo (the bridge contract on the SOURCE chain) for that amount
//   3. repeat the call with the PAYMENT-SIGNATURE header -> 200 {status, receive, burnTx, mintTx, referrerEarned}
// Any x402 client that supports the source chain does this for you (e.g. AgentCash on Base).
// Add --ref <address> (yours or anyone's) to credit 20% of Liquid's fee to that address, on-chain.
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai");
const FROM = arg("from", "base"), TO = arg("to", FROM === "base" ? "arc" : "base"), AMOUNT = arg("amount", "1"), REF = arg("ref", "");
const MAX_OVER = Number(arg("max-fee-pct", "12")); // refuse to pay if all-in cost is above this % of the amount

// The only addresses this script will ever pay (the public bridge contracts, one per source chain).
const CONTRACTS = {
  "eip155:8453": { chainId: 8453, contract: "0xbf43e09b91c4d4aa55e033a3487f345ce4ed7557", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }, // Base
  "eip155:5042": { chainId: 5042, contract: "0x3bc7bf1afc96c1de35ac48e1a0a3cc3d617a77b1", usdc: "0x3600000000000000000000000000000000000000" }, // Arc
};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const url = `${API}/v1/bridge?from=${FROM}&to=${TO}&amount=${AMOUNT}${REF ? `&ref=${REF}` : ""}`;

if (process.argv.includes("--quote")) {
  const q = await (await fetch(`${API}/v1/bridge/quote?from=${FROM}&to=${TO}&amount=${AMOUNT}${REF ? `&ref=${REF}` : ""}`)).json();
  console.log(JSON.stringify(q, null, 2));
  process.exit(0);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required (or use --quote)");
const agent = privateKeyToAccount(process.env.PRIVATE_KEY);

// 1. ask: the 402 is the exact price
const r1 = await fetch(url);
if (r1.status !== 402) throw new Error(`expected 402, got ${r1.status}: ${await r1.text()}`);
const req = JSON.parse(Buffer.from(r1.headers.get("payment-required"), "base64").toString()).accepts[0];
const known = CONTRACTS[req.network];
const value = BigInt(req.amount);

// guards: pay only the known bridge contract, only in USDC, never absurdly above the amount
if (!known) throw new Error(`refusing: unknown network ${req.network}`);
if (req.payTo.toLowerCase() !== known.contract) throw new Error(`refusing: payTo ${req.payTo} is not the bridge contract`);
if (req.asset.toLowerCase() !== known.usdc.toLowerCase()) throw new Error(`refusing: asset ${req.asset} is not USDC`);
const amountAtomic = BigInt(Math.round(Number(AMOUNT) * 1e6));
if (Number(value - amountAtomic) / Number(amountAtomic) * 100 > MAX_OVER) throw new Error(`refusing: price ${Number(value) / 1e6} is more than ${MAX_OVER}% above ${AMOUNT}`);
log(`${FROM} -> ${TO}: receive ${AMOUNT} USDC, pay ${Number(value) / 1e6} USDC on ${req.network} to ${req.payTo}`);

// 2. sign one EIP-3009 authorization; the signing domain comes from the 402 ("USD Coin" on Base, "USDC" on Arc)
const now = BigInt(Math.floor(Date.now() / 1000));
const authorization = { from: agent.address, to: req.payTo, value, validAfter: 0n, validBefore: now + 300n, nonce: `0x${randomBytes(32).toString("hex")}` };
const signature = await agent.signTypedData({
  domain: { name: req.extra.name, version: req.extra.version, chainId: known.chainId, verifyingContract: req.asset },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: authorization,
});
const payment = { x402Version: 2, accepted: req, payload: { signature, authorization: Object.fromEntries(Object.entries(authorization).map(([k, v]) => [k, String(v)])) } };

// 3. pay: the same call with the payment header
const t0 = Date.now();
const r2 = await fetch(url, { headers: { "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payment)).toString("base64") } });
const out = await r2.json();
log(`HTTP ${r2.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(out, null, 2));

// 202 = sent, still confirming: follow statusUrl, never pay again
if (r2.status === 202 || (out.status && out.status !== "minted" && out.statusUrl)) {
  for (let i = 0; i < 36; i++) {
    await new Promise((res) => setTimeout(res, 5000));
    const s = await (await fetch(out.statusUrl)).json();
    log("status", s.state, s.mintTx || "");
    if (s.state === "minted") break;
  }
}
