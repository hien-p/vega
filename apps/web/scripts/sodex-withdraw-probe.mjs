/**
 * Research probe (not a production script): can the public SDK's
 * `transferAsset` endpoint be coaxed into an L1 withdraw?
 *
 *   Sign transferAsset(EVMWithdraw) → POST /spot/accounts/transfers
 *
 * Live finding (May 2026, testnet): both EVMWithdraw (type=2) and
 * SpotWithdraw (type=5) are rejected with
 *   "invalid request body: 'TransferAssetParams.ToAccountID' required"
 *
 * That confirms `POST /spot/accounts/transfers` is for SoDEX-internal
 * account ↔ account moves only; L1 withdrawals run through a separate,
 * undocumented endpoint that the closed-source testnet.sodex.com UI
 * uses after wallet connect. See INTEGRATION.md §7.5 for the broader
 * off-chain-orderbook / on-chain-bridge architecture this fits into.
 *
 * Schema (from SDK TransferAssetRequest):
 *   { id, fromAccountID, toAccountID, coinID, amount, type }
 *   type ∈ {0:EVMDeposit, 1:PerpsDeposit, 2:EVMWithdraw, 3:PerpsWithdraw,
 *           4:Internal, 5:SpotWithdraw, 6:SpotDeposit}
 *   Amount is decimal.Decimal — NO omitempty, so it appears as JSON
 *   string even for zero. Field order: id, fromAccountID, toAccountID,
 *   coinID, amount, type.
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-withdraw-probe.mjs
 */

import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const SPOT_BASE = "https://testnet-gw.sodex.dev/api/v1/spot";
const CHAIN_ID = 138565;

function normalizeDecimalString(v) {
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new Error(`bad decimal: ${v}`);
  if (!v.includes(".")) return v;
  return v.replace(/0+$/, "").replace(/\.$/, "");
}

function canonicalTransferAsset(req) {
  return {
    id: req.id,
    fromAccountID: req.fromAccountID,
    toAccountID: req.toAccountID,
    coinID: req.coinID,
    amount: normalizeDecimalString(req.amount),
    type: req.type, // int enum
  };
}

function payloadHash(actionName, params) {
  const json = JSON.stringify({ type: actionName, params });
  return { json, hash: keccak256(new TextEncoder().encode(json)) };
}

function normalizeV(sig65Hex) {
  const bytes = Buffer.from(sig65Hex.slice(2), "hex");
  const v = bytes[64];
  if (v === 27) bytes[64] = 0;
  else if (v === 28) bytes[64] = 1;
  return "0x" + bytes.toString("hex");
}

let lastNonce = 0n;
const nextNonce = () => {
  const t = BigInt(Date.now());
  const n = t > lastNonce ? t : lastNonce + 1n;
  lastNonce = n;
  return n;
};

async function attempt(typeCode, label) {
  const pk = ("0x" + process.env.SODEX_TESTNET_PRIVATE_KEY).toLowerCase();
  const account = privateKeyToAccount(pk);

  // get accountID
  const state = await fetch(`${SPOT_BASE}/accounts/${account.address}/state`).then((r) => r.json());
  const accountID = state.data.aid;

  const req = {
    id: Date.now(),                 // idempotency key
    fromAccountID: accountID,
    toAccountID: 0,                 // unused for EVM withdraw (engine reads from accountID's bound EVM address)
    coinID: 0,                      // vUSDC
    amount: "5",                    // 5 vUSDC — small, exercises minNotional + L1 send
    type: typeCode,
  };
  const canon = canonicalTransferAsset(req);
  const { json, hash } = payloadHash("transferAsset", canon);
  const nonce = nextNonce();
  console.log(`── ${label}  (type=${typeCode}) ──`);
  console.log(`  json: ${json}`);
  console.log(`  hash: ${hash}`);

  const sig65 = normalizeV(
    await account.signTypedData({
      domain: {
        name: "spot",
        version: "1",
        chainId: CHAIN_ID,
        verifyingContract: "0x0000000000000000000000000000000000000000",
      },
      types: {
        ExchangeAction: [
          { name: "payloadHash", type: "bytes32" },
          { name: "nonce", type: "uint64" },
        ],
      },
      primaryType: "ExchangeAction",
      message: { payloadHash: hash, nonce },
    }),
  );
  const wireSig = `0x01${sig65.slice(2)}`;

  const res = await fetch(`${SPOT_BASE}/accounts/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Api-Sign": wireSig,
      "X-Api-Nonce": nonce.toString(),
      "X-Api-Chain": String(CHAIN_ID),
    },
    body: JSON.stringify(canon),
  });
  const text = await res.text();
  console.log(`  HTTP ${res.status}: ${text}\n`);
  return { status: res.status, body: text };
}

// Probe each candidate withdraw type. The server should accept one and
// reject the others, telling us which enum value triggers an actual L1
// withdraw vs internal account moves.
await attempt(2, "EVMWithdraw (type=2)");
await attempt(5, "SpotWithdraw (type=5)");
