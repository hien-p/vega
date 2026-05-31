/**
 * Signed cancel against SoDEX testnet spot.
 *
 * Sibling to sodex-place-testnet-order.mjs — same EIP-712 + v-byte +
 * 0x01-prefix wire format, but action name is "batchCancelOrder" and the
 * HTTP verb is DELETE on the same /trade/orders/batch endpoint.
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-cancel-testnet-order.mjs \
 *     --order 1250224257 --symbol vBTC_vUSDC
 *
 * Flags:
 *   --order <id>      orderID to cancel (required)
 *   --symbol <name>   Default vBTC_vUSDC; must match the symbol of the order
 *   --network <net>   testnet | mainnet (default testnet)
 *   --dry-run         Build + sign but don't DELETE
 */

import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const NETWORKS = {
  testnet: { spotBase: "https://testnet-gw.sodex.dev/api/v1/spot", chainId: 138565 },
  mainnet: { spotBase: "https://mainnet-gw.sodex.dev/api/v1/spot", chainId: 286623 },
};

const SAFE_CL_ORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Cancel item: {symbolID, clOrdID, orderID?, origClOrdID?}.
// clOrdID is THIS cancel action's id (idempotency); orderID or
// origClOrdID identify which existing order to kill.
function canonicalCancelItem(item) {
  if (!SAFE_CL_ORD_ID.test(item.clOrdID)) {
    throw new Error(`Invalid clOrdID "${item.clOrdID}".`);
  }
  const out = { symbolID: item.symbolID, clOrdID: item.clOrdID };
  if (item.orderID !== undefined) out.orderID = item.orderID;
  if (item.origClOrdID !== undefined) out.origClOrdID = item.origClOrdID;
  return out;
}

function canonicalBatchCancelOrderRequest(req) {
  return { accountID: req.accountID, cancels: req.cancels.map(canonicalCancelItem) };
}

function computePayloadHash(actionName, params) {
  const json = JSON.stringify({ type: actionName, params });
  return { json, hash: keccak256(new TextEncoder().encode(json)) };
}

let lastNonce = 0n;
function nextNonce() {
  const ts = BigInt(Date.now());
  const next = ts > lastNonce ? ts : lastNonce + 1n;
  lastNonce = next;
  return next;
}

function normalizeV(sig65Hex) {
  const bytes = Buffer.from(sig65Hex.slice(2), "hex");
  const v = bytes[64];
  if (v === 27) bytes[64] = 0;
  else if (v === 28) bytes[64] = 1;
  else if (v !== 0 && v !== 1) throw new Error(`unexpected v byte: 0x${v.toString(16)}`);
  return "0x" + bytes.toString("hex");
}

// ─── CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
function flag(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const networkName = flag("--network", "testnet");
const symbolName = flag("--symbol", "vBTC_vUSDC");
const orderIDRaw = flag("--order", null);
if (!orderIDRaw) {
  console.error("ERROR: --order <orderID> is required.");
  process.exit(2);
}
const orderID = Number(orderIDRaw);
if (!Number.isSafeInteger(orderID) || orderID <= 0) {
  console.error(`ERROR: --order must be a positive integer, got ${orderIDRaw}`);
  process.exit(2);
}

const net = NETWORKS[networkName];
if (!net) throw new Error(`Unknown network "${networkName}".`);

// ─── Main ────────────────────────────────────────────────────────────────

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const raw = process.env.SODEX_TESTNET_PRIVATE_KEY;
  if (!raw) throw new Error("Set SODEX_TESTNET_PRIVATE_KEY in .env.local");
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
  const account = privateKeyToAccount(pk);

  console.log(`network:   ${networkName} (chainId ${net.chainId})`);
  console.log(`address:   ${account.address}`);
  console.log(`cancel:    orderID ${orderID} on ${symbolName}`);
  console.log();

  // 1. accountID
  const state = await get(`${net.spotBase}/accounts/${account.address}/state`);
  if (state.code !== 0 || !state.data?.aid) throw new Error("no account state");
  const accountID = state.data.aid;
  console.log(`  accountID: ${accountID}`);

  // 2. symbolID
  const symRes = await get(`${net.spotBase}/markets/symbols`);
  const sym = symRes.data.find((s) => s.name === symbolName);
  if (!sym) throw new Error(`symbol ${symbolName} not found`);
  console.log(`  symbolID:  ${sym.id}`);
  console.log();

  // 3. Build canonical
  const req = {
    accountID,
    cancels: [
      {
        symbolID: sym.id,
        clOrdID: `vega-cancel-${Date.now()}`,
        orderID,
      },
    ],
  };
  const canonical = canonicalBatchCancelOrderRequest(req);
  const { json, hash: payloadHash } = computePayloadHash("batchCancelOrder", canonical);
  console.log(`  canonical (${json.length}B): ${json}`);
  console.log(`  payloadHash: ${payloadHash}`);

  // 4. Sign + normalize v
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
  const sig65 = normalizeV(sig65Raw);
  const wireSig = `0x01${sig65.slice(2)}`;
  console.log(`  nonce: ${nonce}`);
  console.log(`  wireSig: ${wireSig}`);
  console.log();

  if (dryRun) {
    console.log("DRY RUN — skipped DELETE.");
    return;
  }

  // 5. DELETE
  console.log("→ DELETE /trade/orders/batch…");
  const res = await fetch(`${net.spotBase}/trade/orders/batch`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Sign": wireSig,
      "X-Api-Nonce": nonce.toString(),
      "X-Api-Chain": String(net.chainId),
    },
    body: JSON.stringify(canonical),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  console.log(`  HTTP ${res.status}`);
  console.log("  body:", body);
  if (res.ok && body?.code === 0) {
    console.log();
    console.log("✓ CANCEL ACCEPTED");
    process.exit(0);
  } else {
    console.log("✗ REJECTED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("ERROR:", err.message ?? err);
  process.exit(1);
});
