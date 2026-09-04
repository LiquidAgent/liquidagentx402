// Liquid Agent — buy the tokenized-stock index with ZERO ETH: the gas sponsor pays the gas, you pay USDC over x402.
//
//   npm i viem
//   PRIVATE_KEY=0x... node examples/gasless.js --vault 0xYourVault --usdc 2000000
//   (--mode transfer sends 1 USDC to the treasury instead of buying: the smallest possible end-to-end test)
//
// ONE endpoint, POST /v1/gas, three bodies:
//   {sender, calls}                 -> 402 = the exact quote; repeat WITH payment -> sponsored userOperation + typedData (+ EIP-7702 authorization)
//   {userOperation (signed), authorization?} -> we submit it; our deposit pays the gas. No further charge.
//   (smart-wallet SDKs use the same URL as an ERC-7677 paymaster instead — see README)
// Your EOA becomes an eth-infinitism Simple7702Account by delegation (owner = you). Reversible, standard, no deployment.
import { createPublicClient, http, encodeFunctionData, getAddress, hexToBigInt, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai"), RPC = arg("rpc", "https://mainnet.base.org");
const MODE = arg("mode", "deposit"), USDC_AMT = arg("usdc", "2000000");
const VAULT = getAddress(arg("vault", "0x0000000000000000000000000000000000000000"));
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", TREASURY = "0x487b28A4FbbA8Cf46eb6E1d72e6959202Bb75e90";
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required");
if (MODE === "deposit" && VAULT === "0x0000000000000000000000000000000000000000") throw new Error("--vault 0xYourVault required (GET /v1/balance/<you> lists yours)");

const agent = privateKeyToAccount(process.env.PRIVATE_KEY);
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const erc20 = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];
const post = async (path, body, headers = {}) => { const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

log("agent", agent.address, "| ETH", (Number(await pub.getBalance({ address: agent.address })) / 1e18).toFixed(6), "| USDC", (Number(await pub.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [agent.address] })) / 1e6).toFixed(2));

// 1. the call we want sponsored: a USDC transfer (test) or a one-tx vault buy via EIP-2612 permit (from this API)
let call;
if (MODE === "transfer") {
  call = { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [TREASURY, 1_000_000n] }), value: "0" };
} else {
  const p1 = await post("/v1/buy", { vault: VAULT, usdc: USDC_AMT, permit: true, owner: agent.address });
  if (p1.status !== 200) throw new Error("buy phase1: " + JSON.stringify(p1.body));
  const permitSig = await agent.signTypedData(p1.body.typedData);              // off-chain, free
  const p2 = await post("/v1/buy", { vault: VAULT, usdc: USDC_AMT, permit: { deadline: p1.body.typedData.message.deadline, signature: permitSig } });
  if (p2.status !== 200) throw new Error("buy phase2: " + JSON.stringify(p2.body));
  call = { to: p2.body.to, data: p2.body.data, value: "0" };
}

// 2. quote: POST {sender, calls} with no payment -> 402 carrying the exact USDC price
// Already delegated to another EIP-7702 implementation? Add --redelegate: the sponsor returns an authorization you sign
// that re-points your wallet to Simple7702Account (owner = you, reversible) in the same transaction. Or keep your
// delegation and use examples/gasless-bring-your-own.js instead.
const body = { sender: agent.address, calls: [call], ...(process.argv.includes("--redelegate") ? { redelegate: true } : {}) };
let sp = await post("/v1/gas", body);
if (sp.status !== 402) throw new Error("expected 402, got " + sp.status + " " + JSON.stringify(sp.body).slice(0, 200));
const acc = sp.body.accepts[0];
log("quote:", (Number(acc.amount) / 1e6).toFixed(4), "USDC");

// 3. pay it (x402 exact scheme = one EIP-3009 USDC authorization, signed off-chain) and repeat the same call
const nonce = toHex(randomBytes(32)), validBefore = Math.floor(Date.now() / 1000) + 300;
const paySig = await agent.signTypedData({
  domain: { name: acc.extra.name, version: acc.extra.version, chainId: acc.extra.chainId, verifyingContract: acc.extra.verifyingContract },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { from: agent.address, to: acc.payTo, value: BigInt(acc.amount), validAfter: 0n, validBefore: BigInt(validBefore), nonce },
});
const payment = { x402Version: 2, scheme: acc.scheme, network: acc.network, payload: { signature: paySig, authorization: { from: agent.address, to: acc.payTo, value: acc.amount, validAfter: "0", validBefore: String(validBefore), nonce } } };
sp = await post("/v1/gas", body, { "X-PAYMENT": Buffer.from(JSON.stringify(payment)).toString("base64") });
if (sp.status !== 200) throw new Error("sponsor: " + JSON.stringify(sp.body).slice(0, 300));
log("sponsored | paid tx", sp.body._paid.transaction, "| delegated already:", sp.body.delegated);

// 4. sign the operation (and, the first time, the EIP-7702 authorization that turns the EOA into a smart account)
let authorization = null;
if (sp.body.authorization) {
  const a = sp.body.authorization;
  const signed = await agent.signAuthorization({ contractAddress: a.address, chainId: a.chainId, nonce: a.nonce });
  authorization = { chainId: a.chainId, address: a.address, nonce: a.nonce, r: signed.r, s: signed.s, yParity: signed.yParity };
}
const userOperation = { ...sp.body.userOperation, signature: await agent.signTypedData(sp.body.typedData) };

// 5. submit: same URL, signed operation. The sponsor bundles it; its deposit pays the gas.
const ex = await post("/v1/gas", { userOperation, authorization });
if (ex.status !== 200) throw new Error("execute: " + JSON.stringify(ex.body).slice(0, 300));
log("executed", ex.body.txHash, "| success", ex.body.success, "| gas paid by sponsor", ex.body.actualGasCostEth, "ETH");
log("agent ETH after:", (Number(await pub.getBalance({ address: agent.address })) / 1e18).toFixed(6), "(unchanged — you never needed any)");
