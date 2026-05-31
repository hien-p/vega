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
 * The hashes below were captured from this Go program (the LIMIT_BUY
 * fixture shown; the other two follow the same shape). Run it in a temp
 * module with `go get github.com/sodex-tech/sodex-go-sdk-public@latest`
 * to re-verify after any SDK bump:
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
 *     // Use RequireFromString, not NewFromFloat — float carries binary
 *     // rounding error that shifts the decimal string and the hash.
 *     price := decimal.RequireFromString("2099.5")
 *     qty   := decimal.RequireFromString("0.05")
 *     req := &stypes.BatchNewOrderRequest{
 *       AccountID: 1001,
 *       Orders: []*stypes.BatchNewOrderItem{{
 *         SymbolID:    2,
 *         ClOrdID:     "vega-fixture-001",
 *         Side:        enums.OrderSideBuy,    // marshals as 1
 *         Type:        enums.OrderTypeLimit,  // marshals as 1
 *         TimeInForce: enums.TimeInForceGTC,  // marshals as 1
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

// SoDEX enums are Go ints with no MarshalJSON → encoding/json emits numbers.
const ORDER_SIDE_CODE = { buy: 1, sell: 2 };
const ORDER_TYPE_CODE = { limit: 1, market: 2 };
const TIME_IN_FORCE_CODE = { gtc: 1, fok: 2, ioc: 3, post_only: 4 };

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

function normalizeDecimalString(value) {
  if (!DECIMAL_RE.test(value)) throw new Error(`Invalid decimal "${value}".`);
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function canonicalBatchNewOrderItem(item) {
  const out = {
    symbolID: item.symbolID,
    clOrdID: item.clOrdID,
    side: ORDER_SIDE_CODE[item.side],
    type: ORDER_TYPE_CODE[item.type],
    timeInForce: TIME_IN_FORCE_CODE[item.timeInForce],
  };
  if (item.price !== undefined) out.price = normalizeDecimalString(item.price);
  if (item.quantity !== undefined) out.quantity = normalizeDecimalString(item.quantity);
  if (item.funds !== undefined) out.funds = normalizeDecimalString(item.funds);
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
// Ground truth captured from the Go SDK program at the top of this file
// (go run, sodex-go-sdk-public@v0.0.0-20260420030753). These confirm:
//   • enums serialize as integers (side/type/timeInForce)
//   • shopspring decimals normalize trailing zeros ("2099.0" → "2099")
// Any drift in the JS canonicalizer now flips these assertions.

const EXPECTED = {
  LIMIT_BUY: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-fixture-001","side":1,"type":1,"timeInForce":1,"price":"2099.5","quantity":"0.05"}]}}',
    hash: "0xf719f99a3e436de3bc89bab0a6352b71fa8b808fa731e662981b66f4fbc9bf11",
  },
  MARKET_SELL: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-fixture-002","side":2,"type":2,"timeInForce":3,"quantity":"0.05"}]}}',
    hash: "0x08a26f98e07d920ff17104efc8d7b54e197faddb33632669ffc90f6a88496f7f",
  },
  BATCH: {
    json:
      '{"type":"batchNewOrder","params":{"accountID":1001,"orders":[{"symbolID":2,"clOrdID":"vega-batch-a","side":1,"type":1,"timeInForce":1,"price":"2099","quantity":"0.01"},{"symbolID":2,"clOrdID":"vega-batch-b","side":2,"type":1,"timeInForce":4,"price":"2101","quantity":"0.01"}]}}',
    hash: "0xfabb5e7e25e9fa8c02392d860d98220d266b5bda4a249020934b79bd43b46f8f",
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
  assert.equal(hash, expected.hash, `${name}: payloadHash mismatch`);
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
console.log("All canonical JSON outputs and payload hashes locked.");
