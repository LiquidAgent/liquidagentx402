"""
Liquid Agent — buy the tokenized-stock index (Python + web3).

    pip install web3 requests
    PRIVATE_KEY=0x... python examples/buy.py

Reads are free. Every write endpoint returns an UNSIGNED {to,data,value,chainId} that we sign with our
own wallet and broadcast to Base. The Liquid Agent server never holds a key.
"""
import os
import requests
from web3 import Web3

API = os.environ.get("API", "https://api.liquidagent.ai")
RPC = os.environ.get("BASE_RPC", "https://mainnet.base.org")
w3 = Web3(Web3.HTTPProvider(RPC))
acct = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])


def send(tx):
    """Sign + broadcast an unsigned {to,data,value}. Precompile swaps break gas estimation, so fall back."""
    to = Web3.to_checksum_address(tx["to"])
    value = int(tx.get("value", 0))
    try:
        gas = int(w3.eth.estimate_gas({"from": acct.address, "to": to, "data": tx["data"], "value": value}) * 1.2)
    except Exception:
        gas = 3_000_000
    txn = {
        "from": acct.address, "to": to, "data": tx["data"], "value": value,
        "gas": gas, "nonce": w3.eth.get_transaction_count(acct.address),
        "maxFeePerGas": w3.eth.gas_price * 2, "maxPriorityFeePerGas": w3.to_wei(0.01, "gwei"),
        "chainId": 8453,
    }
    signed = acct.sign_transaction(txn)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    rc = w3.eth.wait_for_transaction_receipt(h)
    print(f"   tx: {h.hex()} status: {rc.status}")
    return rc


def main():
    print("account:", acct.address)

    # 1. Discover the index (free)
    basket = requests.get(f"{API}/v1/basket").json()
    print("index:", ", ".join(f"{c['symbol']} ${c['priceUsd']}" for c in basket["constituents"]))

    # 2. Open your own vault (one time)
    print("create-vault...")
    send(requests.post(f"{API}/v1/create-vault", json={}).json())
    bal = requests.get(f"{API}/v1/balance/{acct.address}").json()
    vault = bal["vaults"][-1]["vault"]
    print("your vault:", vault)

    # 3. Buy $2 into it (USDC-6: 2000000 = $2.00) — approve + deposit
    print("buy $2...")
    buy = requests.post(f"{API}/v1/buy", json={"vault": vault, "usdc": "2000000"}).json()
    for step in buy["steps"]:
        print("  ", step["label"])
        send(step)

    # 4. Read the result (free)
    v = requests.get(f"{API}/v1/vault/{vault}").json()
    print("NAV: $" + str(v["nav"]), "weights:", v["weightsBps"])
    print("done. exit any time with POST /v1/redeem { vault, shares, inKind }")


if __name__ == "__main__":
    main()
