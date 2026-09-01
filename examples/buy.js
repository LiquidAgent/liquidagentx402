// Liquid Agent — buy the tokenized-stock index in a few calls (Node + viem).
//
//   npm i viem
//   PRIVATE_KEY=0x... node examples/buy.js
//
// Reads are free. Every write endpoint returns an UNSIGNED {to,data,value,chainId} that we sign with our
// own wallet and broadcast to Base. The Liquid Agent server never holds a key.
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const API = process.env.API || "https://api.liquidagent.ai";
const RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: base, transport: http(RPC) });

const get = async (p) => (await fetch(API + p)).json();
const post = async (p, body = {}) =>
  (await fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

// Sign + broadcast an unsigned {to,data,value}. B20 precompile swaps break gas estimation, so we
// estimate first and fall back to a fixed limit if it throws.
async function send(tx) {
  const value = BigInt(tx.value || 0);
  let gas;
  try { gas = await pub.estimateGas({ account: account.address, to: tx.to, data: tx.data, value }); gas += gas / 5n; }
  catch { gas = 3_000_000n; }
  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value, gas });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log("   tx:", hash, "status:", rc.status);
  return rc;
}

async function main() {
  console.log("account:", account.address);

  // 1. Discover the index (free)
  const basket = await get("/v1/basket");
  console.log("index:", basket.constituents.map((c) => `${c.symbol} $${c.priceUsd}`).join(", "));

  // 2. Open your own vault (one time) — sign + broadcast
  console.log("create-vault...");
  await send(await post("/v1/create-vault", {}));
  const bal = await get(`/v1/balance/${account.address}`);
  const vault = bal.vaults[bal.vaults.length - 1].vault;
  console.log("your vault:", vault);

  // 3. Buy $2 into it (USDC-6: 2000000 = $2.00) — ONE tx via EIP-2612 permit, no approve:
  //    a) ask for the permit payload, b) sign it OFF-CHAIN (free), c) exchange the signature
  //    for a single unsigned depositWithPermit tx and broadcast that.
  console.log("buy $2 (one tx, no approve)...");
  const { typedData } = await post("/v1/buy", { vault, usdc: "2000000", permit: true, owner: account.address });
  const message = { ...typedData.message, value: BigInt(typedData.message.value), nonce: BigInt(typedData.message.nonce), deadline: BigInt(typedData.message.deadline) };
  const signature = await wallet.signTypedData({ account, domain: typedData.domain, types: typedData.types, primaryType: typedData.primaryType, message });
  const buy = await post("/v1/buy", { vault, usdc: "2000000", permit: { deadline: typedData.message.deadline, signature } });
  await send(buy);

  // 4. Read the result (free)
  const v = await get(`/v1/vault/${vault}`);
  console.log("NAV:", "$" + v.nav, "weights:", v.weightsBps);
  console.log("done. exit any time with POST /v1/redeem { vault, shares, inKind }");
}

main().catch((e) => { console.error(e); process.exit(1); });
