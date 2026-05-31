/**
 * End-to-end signed-order smoke test against SoDEX testnet spot.
 *
 * Exercises the full pipeline without a browser wallet:
 *   1. Derive address from SODEX_TESTNET_PRIVATE_KEY
 *   2. Fetch /spot/accounts/{addr}/state    → accountID, balance check
 *   3. Fetch /spot/markets/symbols          → symbolID + precision
 *   4. Fetch /spot/markets/{sym}/orderbook  → best bid for price anchor
 *   5. Build BatchNewOrderRequest (limit BUY at ~50% of best bid — far
 *      enough below market that it sits resting and never crosses)
 *   6. canonical JSON → keccak256 → payloadHash      (Go-parity locked)
 *   7. EIP-712 sign ExchangeAction{payloadHash, nonce} via viem
 *   8. Wire signature = [0x01] ‖ 65-byte ECDSA  (66 bytes)
 *   9. POST /spot/trade/orders/batch with X-Api-Sign/Nonce/Chain
 *  10. Validate `code === 0`, print orderID + explorer link
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-place-testnet-order.mjs --dry-run
 *   node --env-file=.env.local scripts/sodex-place-testnet-order.mjs --symbol TESTBTC_vUSDC
 *
 * Flags:
 *   --dry-run         Build + sign but DO NOT POST. Always run this first.
 *   --symbol <name>   Default TESTBTC_vUSDC. Try vBTC_vUSDC if available.
 *   --network <net>   testnet | mainnet (default testnet)
 *
 * Env:
 *   SODEX_TESTNET_PRIVATE_KEY  64-hex string, no 0x prefix accepted too.
 */

import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Network config ──────────────────────────────────────────────────────

const NETWORKS = {
  testnet: {
    spotBase: "https://testnet-gw.sodex.dev/api/v1/spot",
    chainId: 138565,
    explorer: "https://test-scan.valuechain.xyz",
  },
  mainnet: {
    spotBase: "https://mainnet-gw.sodex.dev/api/v1/spot",
    chainId: 286623,
    explorer: "https://main-scan.valuechain.xyz",
  },
};

// ─── Canonical encoder (must match lib/sodex-trade.ts byte-for-byte) ────

const ORDER_SIDE_CODE = { buy: 1, sell: 2 };
const ORDER_TYPE_CODE = { limit: 1, market: 2 };
const TIME_IN_FORCE_CODE = { gtc: 1, fok: 2, ioc: 3, post_only: 4 };
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const SAFE_CL_ORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

function normalizeDecimalString(value) {
  if (!DECIMAL_RE.test(value)) throw new Error(`Invalid decimal "${value}".`);
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function canonicalBatchNewOrderItem(item) {
  if (!SAFE_CL_ORD_ID.test(item.clOrdID)) {
    throw new Error(`Invalid clOrdID "${item.clOrdID}".`);
  }
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
  return { accountID: req.accountID, orders: req.orders.map(canonicalBatchNewOrderItem) };
}

function computePayloadHash(actionName, params) {
  const json = JSON.stringify({ type: actionName, params });
  return { json, hash: keccak256(new TextEncoder().encode(json)) };
}

// ─── Nonce ───────────────────────────────────────────────────────────────

let lastNonce = 0n;
function nextNonce() {
  const ts = BigInt(Date.now());
  const next = ts > lastNonce ? ts : lastNonce + 1n;
  lastNonce = next;
  return next;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ─── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const networkName = (() => {
  const i = args.indexOf("--network");
  return i >= 0 ? args[i + 1] : "testnet";
})();
const symbolName = (() => {
  const i = args.indexOf("--symbol");
  return i >= 0 ? args[i + 1] : "vBTC_vUSDC";
})();

const net = NETWORKS[networkName];
if (!net) throw new Error(`Unknown network "${networkName}". Use testnet|mainnet.`);

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  // 0. Account
  const raw = process.env.SODEX_TESTNET_PRIVATE_KEY;
  if (!raw) throw new Error("Set SODEX_TESTNET_PRIVATE_KEY in .env.local");
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(pk)) throw new Error("SODEX_TESTNET_PRIVATE_KEY must be 64 hex chars.");
  const account = privateKeyToAccount(pk);
  console.log(`network:    ${networkName} (chainId ${net.chainId})`);
  console.log(`address:    ${account.address}`);
  console.log(`spotBase:   ${net.spotBase}`);
  console.log();

  // 1. accountID
  console.log("→ resolve accountID…");
  const stateRes = await get(`${net.spotBase}/accounts/${account.address}/state`);
  if (stateRes.code !== 0) throw new Error(`account state code=${stateRes.code}: ${stateRes.error ?? "?"}`);
  const accountID = stateRes.data?.aid;
  if (!accountID) {
    console.log("  no accountID. Has this wallet ever interacted with SoDEX?");
    console.log("  Visit https://testnet.sodex.com/ and connect once to create an account, then claim the faucet.");
    process.exit(2);
  }
  const balances = stateRes.data?.B ?? [];
  const usdc = balances.find((b) => b?.a === "vUSDC");
  console.log(`  accountID:   ${accountID}`);
  console.log(`  vUSDC bal:   ${usdc?.t ?? "0"} (locked ${usdc?.l ?? "0"})`);
  if (!usdc || Number(usdc.t) - Number(usdc.l) < 5) {
    console.log("  ⚠ vUSDC balance below 5 — claim faucet at https://testnet.sodex.com/faucet first.");
  }
  console.log();

  // 2. symbolID + precision
  console.log(`→ resolve symbol ${symbolName}…`);
  const symRes = await get(`${net.spotBase}/markets/symbols`);
  if (symRes.code !== 0) throw new Error(`symbols code=${symRes.code}`);
  const sym = symRes.data.find((s) => s.name === symbolName);
  if (!sym) throw new Error(`symbol ${symbolName} not found. Available: ${symRes.data.map((s) => s.name).join(", ")}`);
  console.log(`  symbolID:        ${sym.id}`);
  console.log(`  pricePrecision:  ${sym.pricePrecision} (tickSize ${sym.tickSize})`);
  console.log(`  qtyPrecision:    ${sym.quantityPrecision} (stepSize ${sym.stepSize})`);
  console.log(`  minQuantity:     ${sym.minQuantity}`);
  console.log(`  minNotional:     ${sym.minNotional}`);
  console.log();

  // 3. orderbook → best bid for anchoring price far below market
  console.log("→ orderbook…");
  const obRes = await get(`${net.spotBase}/markets/${symbolName}/orderbook?limit=1`);
  const bestBid = Number(obRes.data?.bids?.[0]?.[0] ?? 0);
  const bestAsk = Number(obRes.data?.asks?.[0]?.[0] ?? 0);
  console.log(`  best bid: ${bestBid} | best ask: ${bestAsk}`);
  if (!bestBid) throw new Error("no bids on the book — cannot anchor a safe far-from-market price");
  console.log();

  // 4. Build a deeply-out-of-the-money limit BUY: 50% of best bid,
  //    rounded down to tickSize, qty = minQuantity.
  function floorToTick(value, tickSize) {
    const t = Number(tickSize);
    const v = Math.floor(value / t) * t;
    // Trim float noise: render with enough precision based on tickSize.
    const decs = (tickSize.split(".")[1] ?? "").length;
    return v.toFixed(decs);
  }
  // 50% below best bid, but never below the symbol's own minPrice / tickSize.
  const minPriceFloor = Math.max(Number(sym.minPrice || 0), Number(sym.tickSize));
  const safePriceNum = Math.max(bestBid * 0.5, minPriceFloor);
  const safePrice = floorToTick(safePriceNum, sym.tickSize);

  // Notional must clear minNotional. Target 2× minNotional so we leave
  // headroom for the maker fee + any server-side rounding. Round qty UP
  // to the next stepSize, and never below the symbol's own minQuantity.
  function ceilToStep(value, stepSize) {
    const s = Number(stepSize);
    const ratio = value / s;
    const rounded = Math.ceil(ratio - 1e-12);
    const decs = (stepSize.split(".")[1] ?? "").length;
    return (rounded * s).toFixed(decs);
  }
  const targetNotional = Math.max(Number(sym.minNotional || 0) * 2, 5);
  const rawQty = targetNotional / Number(safePrice);
  const stepQty = ceilToStep(rawQty, sym.stepSize);
  const safeQty = Number(stepQty) < Number(sym.minQuantity) ? sym.minQuantity : stepQty;
  const notional = (Number(safePrice) * Number(safeQty)).toFixed(4);
  console.log(`  safePrice:   ${safePrice}  qty: ${safeQty}  notional: ${notional} vUSDC`);

  const order = {
    accountID,
    orders: [
      {
        symbolID: sym.id,
        clOrdID: `vega-smoke-${Date.now()}`,
        side: "buy",
        type: "limit",
        timeInForce: "gtc",
        price: safePrice,
        quantity: safeQty,
      },
    ],
  };
  console.log("→ planned order:");
  console.log("  ", JSON.stringify(order));
  console.log();

  // 5. Canonical JSON + payloadHash
  const canonical = canonicalBatchNewOrderRequest(order);
  const { json, hash: payloadHash } = computePayloadHash("batchNewOrder", canonical);
  console.log(`  canonical JSON (${json.length} bytes):`);
  console.log("  ", json);
  console.log(`  payloadHash: ${payloadHash}`);
  console.log();

  // 6. EIP-712 sign ExchangeAction
  const nonce = nextNonce();
  const sig65Raw = await account.signTypedData({
    domain: {
      name: "spot",
      version: "1",
      chainId: net.chainId,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      ExchangeAction: [
        { name: "payloadHash", type: "bytes32" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "ExchangeAction",
    message: { payloadHash, nonce },
  });
  if (!sig65Raw.startsWith("0x") || sig65Raw.length !== 132) {
    throw new Error(`unexpected sig length: ${sig65Raw.length}`);
  }
  // viem follows the Ethereum 27/28 convention for the v byte. The SoDEX
  // server calls go-ethereum's crypto.SigToPub which expects v ∈ {0,1}.
  // Normalize before prepending the SignatureTypeEIP712 prefix.
  const sigBytes = Buffer.from(sig65Raw.slice(2), "hex");
  const vRaw = sigBytes[64];
  if (vRaw === 27) sigBytes[64] = 0;
  else if (vRaw === 28) sigBytes[64] = 1;
  else if (vRaw !== 0 && vRaw !== 1) {
    throw new Error(`unexpected v byte: 0x${vRaw.toString(16)}`);
  }
  const sig65 = "0x" + sigBytes.toString("hex");
  const wireSig = `0x01${sig65.slice(2)}`;
  console.log(`  nonce:    ${nonce}`);
  console.log(`  sig65:    ${sig65}   (raw v=${vRaw} → normalized v=${sigBytes[64]})`);
  console.log(`  wireSig:  ${wireSig}`);
  console.log();

  if (dryRun) {
    console.log("DRY RUN — skipped POST. Drop --dry-run to actually place the order.");
    return;
  }

  // 7. POST signed body
  console.log("→ POST /trade/orders/batch…");
  const postRes = await fetch(`${net.spotBase}/trade/orders/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Sign": wireSig,
      "X-Api-Nonce": nonce.toString(),
      "X-Api-Chain": String(net.chainId),
    },
    body: JSON.stringify(canonical),
  });
  const text = await postRes.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log(`  HTTP ${postRes.status}`);
  console.log("  body:", body);
  if (postRes.ok && body?.code === 0) {
    console.log();
    console.log("✓ SIGNED REAL TXN ACCEPTED");
    const orderID = Array.isArray(body.data) ? body.data[0]?.orderID : body.data?.orderID;
    if (orderID) {
      console.log(`  orderID: ${orderID}`);
    }
    console.log(`  open orders: ${net.spotBase}/accounts/${account.address}/orders`);
  } else {
    console.log();
    console.log("✗ REJECTED — see body above. Common causes:");
    console.log("  - code 400xxx: signature failed verification (canonicalizer drift)");
    console.log("  - code 401xxx: account not registered or nonce reused");
    console.log("  - code 402xxx: insufficient balance");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
