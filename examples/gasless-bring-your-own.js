// Liquid Agent gas sponsor — BRING YOUR OWN OPERATION.
// Any EntryPoint v0.8 smart account (a wallet already delegated to another EIP-7702 implementation, or a deployed
// smart account) pays gas in USDC over x402. You build the operation with your own SDK, the sponsor submits it:
// no bundler, no paymaster stake, no ETH.
//
//   npm i viem            (viem >= 2.56; for other account types also: npm i permissionless)
//   PRIVATE_KEY=0x... node examples/gasless-bring-your-own.js
//     [--to 0x… --data 0x… --value 0]   the call to sponsor (default: send 1 USDC to the sponsor's treasury, the smallest test)
//     [--payer-pk 0x…]                  EOA that pays the USDC fee, if it is not the account's own key
//
// Flow (one URL, POST https://api.liquidagent.ai/v1/gas):
//   1. build the unsigned EntryPoint v0.8 user operation with your account's SDK
//   2. POST {userOperation}            -> HTTP 402 = the exact USDC quote for THIS operation (valid 120 s)
//   3. pay it (one EIP-3009 USDC signature) and repeat -> {userOperation with paymaster fields, typedData, validUntil}
//   4. sign the operation the way YOUR account expects (SmartAccount.signUserOperation)
//   5. POST {userOperation} with the signature -> the sponsor dry-runs it through the EntryPoint, then submits it and
//      its deposit pays the gas. A failed dry run costs nothing and can be retried before validUntil.
import { createPublicClient, http, getAddress, toHex, hexToBigInt, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { toSimple7702SmartAccount, entryPoint08Address } from "viem/account-abstraction";
import { randomBytes } from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > -1 ? process.argv[i + 1] : d; };
const API = arg("api", "https://api.liquidagent.ai"), RPC = arg("rpc", "https://mainnet.base.org");
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", TREASURY = "0x487b28A4FbbA8Cf46eb6E1d72e6959202Bb75e90";
if (!/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY || "")) throw new Error("PRIVATE_KEY=0x... required");
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const post = async (path, body, headers = {}) => { const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- 1. YOUR account. Anything that implements viem's SmartAccount on EntryPoint v0.8 works here. Examples:
//   permissionless:  toKernelSmartAccount({ client: pub, owners: [owner], entryPoint: { address: entryPoint08Address, version: "0.8" } })
//                    toSafeSmartAccount({...}), toNexusSmartAccount({...}) — check the SDK for v0.8 support
//   viem (default):  toSimple7702SmartAccount — your EOA delegated to eth-infinitism's Simple7702Account
// The sponsor only uses the standard interface: encodeCalls, getNonce, getFactoryArgs, signUserOperation.
const owner = privateKeyToAccount(process.env.PRIVATE_KEY);
const account = await toSimple7702SmartAccount({ client: pub, owner });
if (account.entryPoint.version !== "0.8") throw new Error("the sponsor is deployed for EntryPoint v0.8; this account targets " + account.entryPoint.version);
const payer = arg("payer-pk") ? privateKeyToAccount(arg("payer-pk")) : owner; // whoever holds the USDC for the fee
const code = await pub.getCode({ address: account.address });
const fresh = !code || code === "0x"; // not yet deployed / delegated
log("account", account.address, "| fresh:", fresh, "| payer", payer.address, "| ETH", (Number(await pub.getBalance({ address: account.address })) / 1e18).toFixed(6));

// ---- 2. the call(s) you want executed, encoded by YOUR account (its own batch/execute format)
const calls = arg("to")
  ? [{ to: getAddress(arg("to")), data: arg("data", "0x"), value: BigInt(arg("value", "0")) }]
  : [{ to: USDC, data: encodeFunctionData({ abi: [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }], functionName: "transfer", args: [TREASURY, 1_000_000n] }), value: 0n }];
const callData = await account.encodeCalls(calls);

// ---- 3. gas fields. Without a bundler you estimate them yourself; the sponsor prices the cap you declare, so a little
//         headroom costs cents, never a failed op. callGas: what the EntryPoint would spend calling your account.
let callGasLimit = 300_000n;
try { callGasLimit = ((await pub.estimateGas({ account: entryPoint08Address, to: account.address, data: callData, stateOverride: fresh ? [{ address: account.address, code: "0xef0100" + account.authorization.address.slice(2) }] : undefined })) * 12n) / 10n + 20_000n; } catch { /* keep the default */ }
const blk = await pub.getBlock(); const fees = await pub.estimateFeesPerGas().catch(() => ({ maxPriorityFeePerGas: 1_000_000n }));
const maxPriorityFeePerGas = fees.maxPriorityFeePerGas > 20_000_000n ? 20_000_000n : fees.maxPriorityFeePerGas; // Base norm; cap silly RPC suggestions
const maxFeePerGas = (blk.baseFeePerGas ?? 5_000_000n) * 2n + maxPriorityFeePerGas;
const factoryArgs = fresh ? await account.getFactoryArgs() : {};
let userOperation = {
  sender: account.address, nonce: toHex(await account.getNonce()), callData,
  callGasLimit: toHex(callGasLimit), verificationGasLimit: toHex(fresh ? 200_000n : 150_000n), preVerificationGas: toHex(80_000n),
  maxFeePerGas: toHex(maxFeePerGas), maxPriorityFeePerGas: toHex(maxPriorityFeePerGas), signature: "0x",
  ...(factoryArgs.factory ? { factory: factoryArgs.factory, factoryData: factoryArgs.factoryData || "0x" } : {}),
};

// ---- 4. quote: POST the unsigned operation with no payment -> 402 carrying the exact USDC price
let sp = await post("/v1/gas", { userOperation });
if (sp.status !== 402) throw new Error("expected 402 (the quote), got " + sp.status + " " + JSON.stringify(sp.body).slice(0, 200));
const acc = sp.body.accepts[0];
log("quote:", (Number(acc.amount) / 1e6).toFixed(4), "USDC");

// ---- 5. pay it (x402 exact scheme: one EIP-3009 USDC authorization signed off-chain by the payer) and repeat
const nonce = toHex(randomBytes(32)), validBefore = Math.floor(Date.now() / 1000) + 300;
const paySig = await payer.signTypedData({
  domain: { name: acc.extra.name, version: acc.extra.version, chainId: acc.extra.chainId, verifyingContract: acc.extra.verifyingContract },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
  primaryType: "TransferWithAuthorization",
  message: { from: payer.address, to: acc.payTo, value: BigInt(acc.amount), validAfter: 0n, validBefore: BigInt(validBefore), nonce },
});
const payment = { x402Version: 2, scheme: acc.scheme, network: acc.network, payload: { signature: paySig, authorization: { from: payer.address, to: acc.payTo, value: acc.amount, validAfter: "0", validBefore: String(validBefore), nonce } } };
sp = await post("/v1/gas", { userOperation }, { "X-PAYMENT": Buffer.from(JSON.stringify(payment)).toString("base64") });
if (sp.status !== 200) throw new Error("sponsor: " + JSON.stringify(sp.body).slice(0, 300));
userOperation = sp.body.userOperation; // now carries paymaster, paymasterData, paymasterVerificationGasLimit, paymasterPostOpGasLimit
log("sponsored by", userOperation.paymaster, "| paid tx", sp.body._paid?.transaction, "| valid until", new Date(sp.body.validUntil * 1000).toISOString().slice(11, 19));

// ---- 6. sign it YOUR account's way. (Simple7702 = EIP-712 over the EntryPoint hash; other SDKs wrap it however they do.)
const big = (h) => hexToBigInt(h);
const forSigning = {
  sender: userOperation.sender, nonce: big(userOperation.nonce), callData: userOperation.callData,
  callGasLimit: big(userOperation.callGasLimit), verificationGasLimit: big(userOperation.verificationGasLimit), preVerificationGas: big(userOperation.preVerificationGas),
  maxFeePerGas: big(userOperation.maxFeePerGas), maxPriorityFeePerGas: big(userOperation.maxPriorityFeePerGas),
  paymaster: userOperation.paymaster, paymasterData: userOperation.paymasterData, paymasterVerificationGasLimit: big(userOperation.paymasterVerificationGasLimit), paymasterPostOpGasLimit: big(userOperation.paymasterPostOpGasLimit),
  ...(userOperation.factory ? { factory: userOperation.factory, factoryData: userOperation.factoryData } : {}),
  ...(userOperation.factory === "0x7702" ? { authorization: { address: account.authorization.address } } : {}), // the EIP-7702 delegate is part of the v0.8 hash
  signature: "0x",
};
userOperation.signature = await account.signUserOperation({ ...forSigning, chainId: base.id });

// First use of a not-yet-delegated EOA (Simple7702 only): also sign the EIP-7702 authorization the sponsor will attach.
let authorization = null;
if (fresh && account.authorization) {
  const a = await owner.signAuthorization({ contractAddress: account.authorization.address, chainId: base.id, nonce: await pub.getTransactionCount({ address: owner.address }) });
  authorization = { chainId: base.id, address: account.authorization.address, nonce: a.nonce, r: a.r, s: a.s, yParity: a.yParity };
}

// ---- 7. submit: same URL. The sponsor dry-runs it through the EntryPoint, then bundles it; its deposit pays the gas.
const ex = await post("/v1/gas", { userOperation, ...(authorization ? { authorization } : {}) });
if (ex.status !== 200) throw new Error("execute: " + JSON.stringify(ex.body).slice(0, 300)); // a 400 here means the dry run failed: nothing was sent or spent
log("executed", ex.body.txHash, "| success", ex.body.success, "| gas paid by sponsor", ex.body.actualGasCostEth, "ETH");
log("account ETH after:", (Number(await pub.getBalance({ address: account.address })) / 1e18).toFixed(6), "(you never needed any)");
