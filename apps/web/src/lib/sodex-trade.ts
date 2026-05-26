/**
 * SoDEX signed-write client (spot engine, Spark domain).
 *
 * Implements the two-layer EIP-712 signing pipeline documented in
 * `sodex-tech/sodex-go-sdk-public/common/types/eip712.go`:
 *
 *   1. ActionPayload{type, params} ─ JSON-encode ─▶ keccak256 ─▶ payloadHash
 *   2. ExchangeAction{payloadHash, nonce} ─ EIP-712 ─▶ digest ─▶ ECDSA sign
 *   3. Wire format: [0x01 SignatureTypeEIP712] ‖ 65-byte ECDSA = 66 bytes
 *
 * Wire signature is attached as the `X-Api-Sign` request header (hex with
 * 0x prefix), with the nonce in `X-Api-Nonce` and the chain ID in
 * `X-Api-Chain`. The unsigned JSON body is the same bytes that were
 * keccak256-hashed to produce payloadHash — byte parity is mandatory or
 * the server will reject the signature.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * JSON canonicalization risk
 * ─────────────────────────────────────────────────────────────────────────
 * The server recomputes payloadHash by JSON-marshaling its own struct via
 * Go's `encoding/json`. Our JSON output must be byte-identical. The known
 * divergences between Go and JS JSON output, and how this module handles
 * them:
 *
 *  • Key order — Go marshals in struct field declaration order. JS
 *    `JSON.stringify` preserves object literal insertion order (ES2015+
 *    for string keys). Helpers below build params objects with keys in
 *    SDK struct order, NOT alphabetical.
 *
 *  • Decimal numbers — Go's `*decimal.Decimal` (shopspring) marshals as a
 *    JSON STRING. Price/quantity/funds must be passed as strings here
 *    (`"50000"`, not `50000`).
 *
 *  • omitempty — Go drops nil pointer fields. JSON.stringify drops
 *    `undefined` values. Pass `undefined` (not null, not "") for fields
 *    you want omitted.
 *
 *  • HTML escaping — Go's default `json.Marshal` HTML-escapes `<`, `>`,
 *    `&` to `<>&`. JS `JSON.stringify` does NOT.
 *    For Wave 1, restrict `clOrdID` to ASCII alphanumerics + `-_` so the
 *    issue cannot trigger. A future Go-compatible escape helper would
 *    fix the general case.
 *
 *  • U+2028 / U+2029 — Go escapes these; modern JS does not in
 *    JSON.stringify. Same Wave 1 mitigation (ASCII clOrdID).
 *
 * The `tests/sodex-payload-hash.test.ts` fixture catches regressions in
 * field order and decimal handling against a hash captured from the Go
 * SDK. Run it before any real txn attempt.
 */

import { keccak256, type Hex, type TypedData } from "viem";
import { signTypedData } from "wagmi/actions";

import { wagmiConfig } from "./wagmi";
import { getSpotBaseUrl } from "./sodex-public";

// ─── Domain ──────────────────────────────────────────────────────────────

const SPOT_DOMAIN_NAME = "spot";
const ZERO_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000" as const;

/** ValueChain mainnet. Override with NEXT_PUBLIC_SODEX_CHAIN_ID for testnet. */
const DEFAULT_CHAIN_ID = 286623;

export function getSpotDomain() {
  const chainId = Number(
    process.env.NEXT_PUBLIC_SODEX_CHAIN_ID ?? DEFAULT_CHAIN_ID,
  );
  return {
    name: SPOT_DOMAIN_NAME,
    version: "1",
    chainId,
    verifyingContract: ZERO_VERIFYING_CONTRACT,
  } as const;
}

const EXCHANGE_ACTION_TYPES = {
  ExchangeAction: [
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
} as const satisfies TypedData;

// ─── Action request types (mirror Go SDK struct field order) ────────────

export type SoDEXOrderSide = "buy" | "sell";
export type SoDEXOrderType = "limit" | "market" | "stop_limit" | "stop_market";
export type SoDEXTimeInForce = "gtc" | "ioc" | "fok" | "post_only";

/**
 * Field order must match `spot/types/batch_new_order_request.go::BatchNewOrderItem`:
 *   symbolID, clOrdID, side, type, timeInForce, price, quantity, funds.
 * price/quantity/funds use `*decimal.Decimal` with omitempty — pass as
 * decimal STRINGS or undefined to omit.
 */
export interface BatchNewOrderItem {
  symbolID: number;
  clOrdID: string;
  side: SoDEXOrderSide;
  type: SoDEXOrderType;
  timeInForce: SoDEXTimeInForce;
  price?: string;
  quantity?: string;
  funds?: string;
}

/**
 * Field order matches `spot/types/batch_new_order_request.go::BatchNewOrderRequest`:
 *   accountID, orders.
 */
export interface BatchNewOrderRequest {
  accountID: number;
  orders: BatchNewOrderItem[];
}

export const ACTION_NAME_BATCH_NEW_ORDER = "batchNewOrder";

// ─── Canonical JSON encoders ─────────────────────────────────────────────

function canonicalBatchNewOrderItem(item: BatchNewOrderItem): Record<string, unknown> {
  // Build in SDK struct field order. Trailing optional fields are dropped
  // by JSON.stringify when their value is undefined.
  const out: Record<string, unknown> = {
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

function canonicalBatchNewOrderRequest(req: BatchNewOrderRequest): Record<string, unknown> {
  return {
    accountID: req.accountID,
    orders: req.orders.map(canonicalBatchNewOrderItem),
  };
}

/**
 * Build the bytes that get keccak256-hashed for payloadHash.
 * Exposed for the parity test — production callers should use payloadHash().
 */
export function actionPayloadJSON(actionName: string, params: unknown): string {
  return JSON.stringify({ type: actionName, params });
}

/**
 * payloadHash = keccak256(actionPayloadJSON). Must byte-match the server's
 * own Go `encoding/json` output for the equivalent struct.
 */
export function computePayloadHash(actionName: string, params: unknown): Hex {
  const json = actionPayloadJSON(actionName, params);
  return keccak256(new TextEncoder().encode(json));
}

// ─── Nonce ───────────────────────────────────────────────────────────────

let lastNonce = 0n;

/**
 * Monotonic ms-timestamp nonce. The server accepts values in a
 * (now - 2 days, now + 1 day) window and rejects duplicates.
 */
export function nextNonce(): bigint {
  const ts = BigInt(Date.now());
  const next = ts > lastNonce ? ts : lastNonce + 1n;
  lastNonce = next;
  return next;
}

// ─── Wire signature ──────────────────────────────────────────────────────

const SIGNATURE_TYPE_EIP712 = 0x01;

/**
 * Wrap a 65-byte ECDSA signature with the 1-byte type prefix to produce
 * the 66-byte wire signature the server expects.
 */
export function toWireSignature(sig65: Hex): Hex {
  if (!sig65.startsWith("0x") || sig65.length !== 132) {
    throw new Error(`expected 65-byte hex signature, got ${sig65.length - 2} chars`);
  }
  const prefix = SIGNATURE_TYPE_EIP712.toString(16).padStart(2, "0");
  return `0x${prefix}${sig65.slice(2)}` as Hex;
}

// ─── Signing + POST helpers ──────────────────────────────────────────────

export interface SignedAction {
  /** Wire signature: 0x + 132 hex chars = 66 bytes. */
  wireSig: Hex;
  /** Nonce that was signed. */
  nonce: bigint;
  /** Canonical request body — these are the exact bytes to POST. */
  body: Record<string, unknown>;
  /** payloadHash that was bound into the EIP-712 message. */
  payloadHash: Hex;
}

/**
 * Sign a batch-new-order request with the connected wallet.
 * Triggers the wallet's signTypedData prompt (eth_signTypedData_v4).
 */
export async function signBatchNewOrder(
  req: BatchNewOrderRequest,
  opts: { account?: `0x${string}` } = {},
): Promise<SignedAction> {
  const body = canonicalBatchNewOrderRequest(req);
  const payloadHash = computePayloadHash(ACTION_NAME_BATCH_NEW_ORDER, body);
  const nonce = nextNonce();
  const domain = getSpotDomain();

  const sig65 = await signTypedData(wagmiConfig, {
    account: opts.account,
    domain,
    types: EXCHANGE_ACTION_TYPES,
    primaryType: "ExchangeAction",
    message: {
      payloadHash,
      nonce,
    },
  });

  return {
    wireSig: toWireSignature(sig65),
    nonce,
    body,
    payloadHash,
  };
}

export class SoDEXTradeError extends Error {
  constructor(public status: number, public code: number | null, public bodyText: string) {
    super(`SoDEX trade error ${status}${code !== null ? ` (code ${code})` : ""}: ${bodyText}`);
  }
}

interface PlaceOrderResponse {
  code: number;
  timestamp?: number;
  data?: unknown;
  error?: string;
}

/**
 * POST a signed action to a SoDEX endpoint with the standard headers.
 * Throws SoDEXTradeError if the HTTP response is not 200 or the API code
 * is non-zero.
 */
export async function postSigned(
  endpointPath: string,
  signed: SignedAction,
): Promise<PlaceOrderResponse> {
  const url = `${getSpotBaseUrl()}${endpointPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Sign": signed.wireSig,
    "X-Api-Nonce": signed.nonce.toString(),
    "X-Api-Chain": String(getSpotDomain().chainId),
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    // Re-stringify the same body shape we hashed. JSON.stringify on a
    // pure object is deterministic for the inputs we control here.
    body: JSON.stringify(signed.body),
  });

  const text = await res.text();
  let parsed: PlaceOrderResponse | null = null;
  try {
    parsed = text ? (JSON.parse(text) as PlaceOrderResponse) : null;
  } catch {
    /* fall through */
  }

  if (!res.ok || !parsed || parsed.code !== 0) {
    throw new SoDEXTradeError(res.status, parsed?.code ?? null, text);
  }
  return parsed;
}

/**
 * Convenience: sign + submit a batch new order in one call.
 */
export async function placeBatchNewOrder(
  req: BatchNewOrderRequest,
  opts: { account?: `0x${string}` } = {},
) {
  const signed = await signBatchNewOrder(req, opts);
  return postSigned("/trade/orders/batch", signed);
}
