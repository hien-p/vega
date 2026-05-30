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
 * Go's `encoding/json`. Our JSON output must be byte-identical. The
 * divergences between Go and JS JSON output (all verified against the Go
 * SDK via scripts/sodex-payload-hash-parity.mjs), and how this module
 * handles them:
 *
 *  • Key order — Go marshals in struct field declaration order. JS
 *    `JSON.stringify` preserves object literal insertion order (ES2015+
 *    for string keys). Helpers below build params objects with keys in
 *    SDK struct order, NOT alphabetical.
 *
 *  • Enums are INTEGERS — OrderSide/OrderType/TimeInForce are Go `int`
 *    types with no MarshalJSON, so encoding/json emits numbers (side:1,
 *    not "buy"). The encoder maps the friendly string union to the SDK
 *    integer codes. This is the single biggest gotcha — a string here
 *    silently breaks every signature.
 *
 *  • Decimals normalize — Go's `*decimal.Decimal` (shopspring) marshals
 *    as a JSON STRING and the server re-marshals after unmarshaling, so
 *    "2099.0" becomes "2099". Pass decimals as strings; the encoder
 *    normalizes trailing zeros to match.
 *
 *  • omitempty — Go drops nil pointer fields. JSON.stringify drops
 *    `undefined` values. Pass `undefined` (not null, not "") for fields
 *    you want omitted.
 *
 *  • HTML escaping — Go's default `json.Marshal` HTML-escapes `<`, `>`,
 *    `&`. JS `JSON.stringify` does NOT. clOrdID is pinned to ASCII
 *    alphanumerics + `-_` so the issue cannot trigger; all other string
 *    fields are server-controlled enums/decimals.
 *
 * The parity script locks three reference payloadHashes captured from a
 * `go run` against sodex-go-sdk-public. Re-run it before any real txn.
 */

import { keccak256, type Hex, type TypedData } from "viem";
import { signTypedData } from "wagmi/actions";

import { wagmiConfig } from "./wagmi";
import { getSpotBaseUrl, isTestnet } from "./sodex-public";

// ─── Domain ──────────────────────────────────────────────────────────────

const SPOT_DOMAIN_NAME = "spot";
const ZERO_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000" as const;

/** ValueChain mainnet. Testnet must be supplied explicitly by env. */
const VALUECHAIN_MAINNET_CHAIN_ID = 286623;
const SAFE_CL_ORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function getSpotDomain() {
  const chainId = getConfiguredSoDEXChainId();
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

function parseChainId(value: string | undefined, label: string): number | null {
  if (value === undefined || value.trim() === "") return null;
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`${label} must be a positive integer chain id.`);
  }
  return chainId;
}

function getConfiguredSoDEXChainId(): number {
  const explicit = parseChainId(
    process.env.NEXT_PUBLIC_SODEX_CHAIN_ID,
    "NEXT_PUBLIC_SODEX_CHAIN_ID",
  );
  if (explicit !== null) return explicit;

  if (!isTestnet()) {
    return (
      parseChainId(process.env.NEXT_PUBLIC_VALUECHAIN_ID, "NEXT_PUBLIC_VALUECHAIN_ID") ??
      VALUECHAIN_MAINNET_CHAIN_ID
    );
  }

  const testnetChainId = parseChainId(
    process.env.NEXT_PUBLIC_VALUECHAIN_TESTNET_ID,
    "NEXT_PUBLIC_VALUECHAIN_TESTNET_ID",
  );
  if (testnetChainId !== null) return testnetChainId;

  throw new Error(
    "SoDEX signed writes are configured for testnet but no EIP-712 chain id is set. " +
      "Set NEXT_PUBLIC_SODEX_CHAIN_ID or NEXT_PUBLIC_VALUECHAIN_TESTNET_ID.",
  );
}

// ─── Action request types (mirror Go SDK struct field order) ────────────

export type SoDEXOrderSide = "buy" | "sell";
export type SoDEXOrderType = "limit" | "market";
export type SoDEXTimeInForce = "gtc" | "ioc" | "fok" | "post_only";

// SoDEX enums are Go `int` types with no MarshalJSON, so encoding/json
// serializes them as NUMBERS. Verified against the Go SDK output — the
// signed payload must carry integers here, not the human-readable
// strings, or the server's recomputed payloadHash will not match.
//   common/enums/order_side.go     Buy=1  Sell=2
//   common/enums/order_type.go     Limit=1 Market=2
//   common/enums/time_in_force.go  GTC=1  FOK=2  IOC=3  GTX(post-only)=4
const ORDER_SIDE_CODE: Record<SoDEXOrderSide, number> = { buy: 1, sell: 2 };
const ORDER_TYPE_CODE: Record<SoDEXOrderType, number> = { limit: 1, market: 2 };
const TIME_IN_FORCE_CODE: Record<SoDEXTimeInForce, number> = {
  gtc: 1,
  fok: 2,
  ioc: 3,
  post_only: 4,
};

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * Normalize a decimal string the way shopspring/decimal's String() does:
 * strip trailing fractional zeros and a dangling decimal point. The server
 * unmarshals price/quantity into decimal.Decimal and re-marshals before
 * hashing, so "2099.0" becomes "2099" on its side — we must match.
 */
export function normalizeDecimalString(value: string): string {
  if (!DECIMAL_RE.test(value)) {
    throw new Error(`Invalid decimal "${value}". Expected a plain decimal number.`);
  }
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Field order must match `spot/types/batch_new_order_request.go::BatchNewOrderItem`:
 *   symbolID, clOrdID, side, type, timeInForce, price, quantity, funds.
 * Pass side/type/timeInForce as friendly strings — they are mapped to the
 * SDK integer codes here. price/quantity/funds are `*decimal.Decimal` with
 * omitempty — pass as decimal STRINGS or undefined to omit.
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
  if (!SAFE_CL_ORD_ID.test(item.clOrdID)) {
    throw new Error(
      `Invalid clOrdID "${item.clOrdID}". Use 1-64 ASCII letters, numbers, "-" or "_".`,
    );
  }

  // Build in SDK struct field order. Enums map to integer codes; decimals
  // normalize to shopspring's String() form. Trailing optional fields are
  // dropped by JSON.stringify when their value is undefined.
  const out: Record<string, unknown> = {
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
 *
 * Also normalizes the recovery byte: viem and most browser wallets follow
 * the Ethereum 27/28 convention, but the SoDEX server calls go-ethereum's
 * crypto.SigToPub which rejects 27/28 with "Invalid recovery ID". We
 * convert to the raw 0/1 form before prepending the type byte. Verified
 * end-to-end against testnet — orderID 1250224257 was the first accepted
 * txn after this normalization landed.
 */
export function toWireSignature(sig65: Hex): Hex {
  if (!sig65.startsWith("0x") || sig65.length !== 132) {
    throw new Error(`expected 65-byte hex signature, got ${sig65.length - 2} chars`);
  }
  const bytes = new Uint8Array(32 + 32 + 1);
  for (let i = 0; i < 65; i++) {
    bytes[i] = Number.parseInt(sig65.slice(2 + i * 2, 4 + i * 2), 16);
  }
  const v = bytes[64];
  if (v === 27) bytes[64] = 0;
  else if (v === 28) bytes[64] = 1;
  else if (v !== 0 && v !== 1) {
    throw new Error(`unexpected v byte: 0x${v.toString(16)}`);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const prefix = SIGNATURE_TYPE_EIP712.toString(16).padStart(2, "0");
  return `0x${prefix}${hex}` as Hex;
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
