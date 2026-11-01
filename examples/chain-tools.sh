#!/usr/bin/env bash
set -euo pipefail

# Read-only x402 examples for Liquid chain tools and bulk enrichment.
# Requires AgentCash for the paid calls. Each endpoint returns a 402 until the client pays.
BASE=https://api.liquidagent.ai
USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
TX=0xc9a9b57ffcb07e1c23ae6e66f161ab02bb97626026a571268197c835ec968245

# $0.005: one Base transaction preflight. No target transaction is broadcast.
npx agentcash fetch "$BASE/v1/gas/preflight" -m POST -b "{\"to\":\"$USDC\",\"data\":\"0x\",\"value\":\"0\"}"

# $0.007: two calls with one settlement ($0.005 + $0.002).
npx agentcash fetch "$BASE/v1/gas/preflight/batch" -m POST -b "{\"calls\":[{\"to\":\"$USDC\",\"data\":\"0x\",\"value\":\"0\"},{\"to\":\"$USDC\",\"data\":\"0x\",\"value\":\"0\"}]}"

# $0.003: decode the transaction and its event logs with a caller-supplied ABI.
npx agentcash fetch "$BASE/v1/gas/decode" -m POST -b "{\"chain\":8453,\"txHash\":\"$TX\",\"abi\":[{\"type\":\"function\",\"name\":\"transferWithAuthorization\",\"stateMutability\":\"nonpayable\",\"inputs\":[],\"outputs\":[]},{\"type\":\"event\",\"name\":\"Transfer\",\"inputs\":[{\"name\":\"from\",\"type\":\"address\",\"indexed\":true},{\"name\":\"to\",\"type\":\"address\",\"indexed\":true},{\"name\":\"value\",\"type\":\"uint256\",\"indexed\":false}]}]}"

# $0.005: decode Transfer events in the transaction's one-block range.
npx agentcash fetch "$BASE/v1/chain/logs" -m POST -b "{\"chain\":8453,\"address\":\"$USDC\",\"fromBlock\":\"53355207\",\"toBlock\":\"53355207\",\"topics\":[\"0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\"],\"abi\":[{\"type\":\"event\",\"name\":\"Transfer\",\"inputs\":[{\"name\":\"from\",\"type\":\"address\",\"indexed\":true},{\"name\":\"to\",\"type\":\"address\",\"indexed\":true},{\"name\":\"value\",\"type\":\"uint256\",\"indexed\":false}]}]}"

# $0.01: one matching business is enriched; the miss is free.
npx agentcash fetch "$BASE/v1/leads/enrich" -m POST -b '{"records":[{"domain":"atlantadentistrybydesign.com"},{"domain":"no-such-business-9f3k2.example"}]}'
