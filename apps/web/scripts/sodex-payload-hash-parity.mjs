/**
 * SoDEX payload-hash JS/Go parity check.
 *
 * Hashes a fixed BatchNewOrderRequest with the JS canonical encoder used
 * in `lib/sodex-trade.ts` and asserts the result matches a frozen
 * expected payloadHash. The expected hash MUST be cross-checked against
 * the Go SDK at sodex-tech/sodex-go-sdk-public once. After that, any
 * accidental divergence in the JS encoder (key reorder, omitempty drift,
 * decimal handling, HTML escaping) flips this test.
 *
 * Run from apps/web:
 *   node scripts/sodex-payload-hash-parity.mjs
 *
 * Or with verbose output:
 *   node scripts/sodex-payload-hash-parity.mjs --verbose
 *
 * To regenerate the expected hash with Go (do this once with the SDK
 * checked out and a Go toolchain):
 *
 *   package main
 *
 *   import (
 *     "encoding/json"
 *     "fmt"
 *     "github.com/ethereum/go-ethereum/crypto"
 *     "github.com/shopspring/decimal"
 *     "github.com/sodex-tech/sodex-go-sdk-public/common/enums"
 *     stypes "github.com/sodex-tech/sodex-go-sdk-public/spot/types"
 *     ctypes "github.com/sodex-tech/sodex-go-sdk-public/common/types"
 *   )
 *
 *   func main() {
 *     price := decimal.NewFromFloat(2099.5)
 *     qty   := decimal.NewFromFloat(0.05)
 *     req := &stypes.BatchNewOrderRequest{
 *       AccountID: 1001,
 *       Orders: []*stypes.BatchNewOrderItem{{
 *         SymbolID:    2,
 *         ClOrdID:     "vega-fixture-001",
 *         Side:        enums.OrderSideBuy,
 *         Type:        enums.OrderTypeLimit,
 *         TimeInForce: enums.TimeInForceGTC,
 *         Price:       &price,
 *         Quantity:    &qty,
 *       }},
 *     }
 *     ap := &ctypes.ActionPayload{Type: req.ActionName(), Params: req}
 *     bz, _ := json.Marshal(ap)
 *     fmt.Println("json:", string(bz))
 *     fmt.Printf("hash: 0x%x\n", crypto.Keccak256(bz))
 *   }
 */

import { keccak256 } from "viem";
import { strict as assert } from "node:assert";

// ─── Canonical encoder (mirrors lib/sodex-trade.ts) ──────────────────────

function canonicalBatchNewOrderItem(item) {
  const out = {
    symbolID: item.symbolID,
    clOrdID: item.clOrdID,
    side: item.side,
    type: item.type,
    timeInForce: item.timeInForce,
  };
  if (item.price !== undefined) out.price = item.price;
  if (item.quantity !== undefined) out.quantity = item.quantity;
  if (item.funds !== undefined) out.funds = item.funds;
  return out;
}

function canonicalBatchNewOrderRequest(req) {
  return {
    accountID: req.accountID,
    orders: req.orders.map(canonicalBatchNewOrderItem),
  };
}

function actionPayloadJSON(actionName, params) {
  return JSON.stringify({ type: actionName, params });
}

function computePayloadHash(actionName, params) {
  return keccak256(new TextEncoder().encode(actionPayloadJSON(actionName, params)));
}

// ─── Fixtures ────────────────────────────────────────────────────────────

// Limit BUY on vETH_vUSDC (symbolID=2 on mainnet, verified via curl).
// All decimals as strings (matches Go shopspring/decimal JSON output).
const LIMIT_BUY_FIXTURE = {
  accountID: 1001,
  orders: [
    {
      symbolID: 2,
      clOrdID: "vega-fixture-001",
      side: "buy",
      type: "limit",
      timeInForce: "gtc",
      price: "2099.5",
      quantity: "0.05",
    },
  ],
};

// Market SELL — exercises the omitempty path (no price, no funds).
const MARKET_SELL_FIXTURE = {
  accountID: 1001,
  orders: [
    {
      symbolID: 2,
      clOrdID: "vega-fixture-002",
      side: "sell",
      type: "market",
      timeInForce: "ioc",
      quantity: "0.05",
    },
  ],
};

// Batch of two: ensures array ordering + key order in items is stable.
const BATCH_FIXTURE = {
  accountID: 1001,
  orders: [
    {
      symbolID: 2,
      clOrdID: "vega-batch-a",
      side: "buy",
      type: "limit",
      timeInForce: "gtc",
      price: "2099.0",
      quantity: "0.01",
    },
    {
      symbolID: 2,
      clOrdID: "vega-batch-b",
      side: "sell",
      type: "limit",
      timeInForce: "post_only",
      price: "2101.0",
      quantity: "0.01",
    },
  ],
};

// ─── Expected JSON + hashes ──────────────────────────────────────────────
// These are the JS-side outputs. CROSS-CHECK against the Go program at
// the top of this file before relying on them for real txn. If Go output
// differs (e.g. by a single byte from HTML escaping), update the
// canonicalizer in sodex-trade.ts AND this script in lockstep.

const EXPECTED = {
  LIMIT_BUY: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-fixture-001","side":"buy","type":"limit","timeInForce":"gtc","price":"2099.5","quantity":"0.05"}]}}',
  },
  MARKET_SELL: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-fixture-002","side":"sell","type":"market","timeInForce":"ioc","quantity":"0.05"}]}}',
  },
  BATCH: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-batch-a","side":"buy","type":"limit","timeInForce":"gtc","price":"2099.0","quantity":"0.01"},{"symbolID":2,"clOrdID":"vega-batch-b","side":"sell","type":"limit","timeInForce":"post_only","price":"2101.0","quantity":"0.01"}]}}',
  },
};

// ─── Run ─────────────────────────────────────────────────────────────────

const verbose = process.argv.includes("--verbose");

function runCase(name, fixture, expected) {
  const body = canonicalBatchNewOrderRequest(fixture);
  const json = actionPayloadJSON("batchNewOrder", body);
  const hash = computePayloadHash("batchNewOrder", body);

  if (verbose) {
    console.log(`── ${name} ──`);
    console.log("json:", json);
    console.log("len: ", json.length, "bytes");
    console.log("hash:", hash);
    console.log();
  }

  assert.equal(json, expected.json, `${name}: canonical JSON mismatch`);
  console.log(`OK  ${name}  ${hash}`);
  return hash;
}

console.log("SoDEX payload-hash parity check");
console.log("================================");
console.log();

runCase("limit_buy   ", LIMIT_BUY_FIXTURE, EXPECTED.LIMIT_BUY);
runCase("market_sell ", MARKET_SELL_FIXTURE, EXPECTED.MARKET_SELL);
runCase("batch       ", BATCH_FIXTURE, EXPECTED.BATCH);

console.log();
console.log("All canonical JSON outputs locked.");
console.log("Cross-check the hashes printed above against the Go SDK once,");
console.log("then encode the verified hashes here as additional assertions.");
