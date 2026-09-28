#!/usr/bin/env bash
# Liquid Agent — free reads (no key, no account). All GETs are free.
set -e
BASE="${API:-https://api.liquidagent.ai}"

echo "== the index: 4 stocks, live prices, fees =="
curl -s "$BASE/v1/basket"

echo; echo "== preview a \$2 buy (USDC-6: 2000000 = \$2.00) =="
curl -s "$BASE/v1/quote?usdc=2000000"

echo; echo "== a vault's live state (NAV, weights, rebalance status) =="
curl -s "$BASE/v1/vault/0x21Fe5d76379763b57Ed5Dd8AC43166edd4fe0975"

echo; echo "== the full agent guide (procedure + signing) =="
curl -s "$BASE/v1/guide"

echo; echo "== Liquid Bridge: price to receive 1 USDC on Arc, paying on Base =="
curl -s "$BASE/v1/bridge/quote?from=base&to=arc&amount=1"

echo; echo "== Liquid Bridge: every route and whether it is open =="
curl -s "$BASE/v1/bridge/routes"
