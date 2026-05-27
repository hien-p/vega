/**
 * Browser-side SoDEX spot client.
 *
 * All endpoints here are public read-only — no auth headers, no signing.
 * For account endpoints the wallet's public address goes in the URL path
 * (matches the edgework reference implementation and the Go SDK).
 * Signed write endpoints (place / cancel / replace orders) live in
 * `sodex-trade.ts` and use EIP-712 via the connected wallet.
 *
 * Verified live against mainnet-gw.sodex.dev — CORS reflects `*` and
 * allows `X-Api-Sign,X-Api-Nonce,X-Api-Chain` so signed writes work
 * directly from the browser without a proxy.
 */

const TESTNET = "https://testnet-gw.sodex.dev/api/v1/spot";
const MAINNET = "https://mainnet-gw.sodex.dev/api/v1/spot";

const BASE_URL =
  process.env.NEXT_PUBLIC_SODEX_API_BASE ??
  (process.env.NEXT_PUBLIC_SODEX_NETWORK === "mainnet" ? MAINNET : TESTNET);

async function get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`SoDEX ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// --- Types -----------------------------------------------------------------

export type SoDEXTicker = {
  symbol: string;
  lastPx: string;
  openPx: string;
  highPx: string;
  lowPx: string;
  volume: string;
  quoteVolume: string;
  change: string;
  changePct: number;
  askPx: string;
  askSz: string;
  bidPx: string;
  bidSz: string;
  openTime: number;
  closeTime: number;
};

export type SoDEXSymbol = {
  id: number;
  name: string;
  displayName: string;
  baseCoin: string;
  baseCoinID: number;
  baseCoinPrecision: number;
  quoteCoin: string;
  quoteCoinID: number;
  quoteCoinPrecision: number;
  pricePrecision: number;
  tickSize: string;
  minPrice: string;
  maxPrice: string;
  quantityPrecision: number;
  stepSize: string;
  minQuantity: string;
  maxQuantity: string;
  status: string;
};

export type SoDEXCandle = {
  /** Candle open time, unix ms. */
  t: number;
  /** Open, high, low, close, volume, quote volume. */
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  q: string;
};

export type SoDEXAccountState = {
  user: string;
  /** Account ID — needed for any signed write (BatchNewOrderRequest.accountID). */
  aid: number;
  uid: number;
  /** Balances (compact array form from the API). */
  B: SoDEXCompactBalance[];
  /** Open orders (compact array form from the API). */
  O: unknown[] | null;
};

export type SoDEXCompactBalance = {
  /** Coin ID. */
  i: number;
  /** Coin symbol. */
  a: string;
  /** Total balance. */
  t: string;
  /** Locked balance. */
  l: string;
};

export type SoDEXBalance = {
  coin: string;
  available: string;
  locked: string;
  total: string;
};

export type SoDEXOrder = {
  orderID: string;
  clOrdID: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  status: string;
  price: string;
  origQty: string;
  executedQty: string;
  createdAt: number;
  updatedAt: number;
};

export type SoDEXUserTrade = {
  tradeID: string;
  orderID: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: string;
  qty: string;
  fee: string;
  feeCoin: string;
  isMaker: boolean;
  timestamp: number;
};

export type SoDEXOrderbookLevel = [price: string, size: string];

export type SoDEXOrderbook = {
  blockTime: number;
  blockHeight: number;
  updateID: number;
  bids: SoDEXOrderbookLevel[];
  asks: SoDEXOrderbookLevel[];
};

// --- Endpoints -------------------------------------------------------------

export function fetchTickers() {
  return get<{ code: number; timestamp: number; data: SoDEXTicker[] }>(
    "/markets/tickers",
  );
}

export function fetchSymbols() {
  return get<{ code: number; timestamp: number; data: SoDEXSymbol[] }>(
    "/markets/symbols",
  );
}

export function fetchOrderbook(symbol: string, limit = 10) {
  return get<{ code: number; timestamp: number; data: SoDEXOrderbook }>(
    `/markets/${symbol}/orderbook`,
    { limit },
  );
}

export function fetchRecentTrades(symbol: string, limit = 50) {
  return get<{ code: number; timestamp: number; data: unknown[] }>(
    `/markets/${symbol}/trades`,
    { limit },
  );
}

/**
 * Historical OHLCV candles. interval ∈ 1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1D|3D|1W|1M.
 * Defaults: limit=500, max 1500. startTime/endTime are unix ms.
 */
export function fetchKlines(
  symbol: string,
  opts: { interval?: string; startTime?: number; endTime?: number; limit?: number } = {},
) {
  return get<{ code: number; timestamp: number; data: SoDEXCandle[] }>(
    `/markets/${symbol}/klines`,
    {
      interval: opts.interval ?? "1h",
      startTime: opts.startTime,
      endTime: opts.endTime,
      limit: opts.limit ?? 500,
    },
  );
}

/**
 * Account state — returns the SoDEX accountID (`aid`) for the given EVM
 * address along with balances and open orders. `aid` is required to sign
 * any write (it is part of BatchNewOrderRequest).
 */
export function fetchAccountState(address: string) {
  return get<{ code: number; timestamp: number; data: SoDEXAccountState }>(
    `/accounts/${address}/state`,
  );
}

export function fetchAccountBalances(address: string) {
  return get<{ code: number; timestamp: number; data: { balances?: SoDEXBalance[] } }>(
    `/accounts/${address}/balances`,
  );
}

export function fetchAccountOpenOrders(address: string) {
  return get<{ code: number; timestamp: number; data: { orders?: SoDEXOrder[] } }>(
    `/accounts/${address}/orders`,
  );
}

export function fetchAccountOrderHistory(
  address: string,
  opts: { symbol?: string; startTime?: number; endTime?: number; limit?: number } = {},
) {
  return get<{ code: number; timestamp: number; data: SoDEXOrder[] }>(
    `/accounts/${address}/orders/history`,
    {
      symbol: opts.symbol,
      startTime: opts.startTime,
      endTime: opts.endTime,
      limit: opts.limit ?? 500,
    },
  );
}

export function fetchAccountUserTrades(
  address: string,
  opts: { symbol?: string; orderID?: string; startTime?: number; endTime?: number; limit?: number } = {},
) {
  return get<{ code: number; timestamp: number; data: SoDEXUserTrade[] }>(
    `/accounts/${address}/trades`,
    {
      symbol: opts.symbol,
      orderID: opts.orderID,
      startTime: opts.startTime,
      endTime: opts.endTime,
      limit: opts.limit ?? 500,
    },
  );
}

export function isTestnet() {
  return !BASE_URL.includes("mainnet");
}

/** Base URL (spot). Exported so sodex-trade.ts can reuse the same root. */
export function getSpotBaseUrl() {
  return BASE_URL;
}
