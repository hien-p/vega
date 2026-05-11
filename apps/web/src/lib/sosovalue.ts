/**
 * SoSoValue REST client (server-side only).
 * Docs: https://sosovalue.gitbook.io/soso-value-api-doc
 *
 * Auth: x-soso-api-key header.
 * Base: https://openapi.sosovalue.com/openapi/v1
 */
const BASE_URL =
  process.env.SOSOVALUE_API_BASE ?? "https://openapi.sosovalue.com/openapi/v1";

type FetchOpts = {
  query?: Record<string, string | number | undefined>;
  init?: RequestInit;
};

export class SoSoValueError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `SoSoValue API error ${status}`);
  }
}

function requireKey(): string {
  const key = process.env.SOSOVALUE_API_KEY;
  if (!key) {
    throw new SoSoValueError(
      500,
      null,
      "SOSOVALUE_API_KEY is not set. Add it to .env.local.",
    );
  }
  return key;
}

export async function sosoFetch<T = unknown>(
  path: string,
  { query, init }: FetchOpts = {},
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-soso-api-key": requireKey(),
      ...(init?.headers ?? {}),
    },
    next: { revalidate: 30 },
  });

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new SoSoValueError(res.status, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type EtfQuery = { symbol?: string; countryCode?: string };

export const sosovalue = {
  /** Featured news feed. pageSize in [20,100]. */
  featuredNews: (opts: { pageNum?: number; pageSize?: number; language?: string } = {}) =>
    sosoFetch(`/news/featured`, {
      query: {
        pageNum: opts.pageNum ?? 1,
        pageSize: opts.pageSize ?? 20,
        language: opts.language,
      },
    }),
  /** ETF aggregate daily history (net inflow, AUM, etc.) for a market. */
  etfSummaryHistory: ({ symbol = "BTC", countryCode = "US" }: EtfQuery = {}) =>
    sosoFetch(`/etfs/summary-history`, {
      query: { symbol, country_code: countryCode },
    }),
  /** List of ETFs for a market. */
  etfs: ({ symbol = "BTC", countryCode = "US" }: EtfQuery = {}) =>
    sosoFetch(`/etfs`, { query: { symbol, country_code: countryCode } }),
  /** Market snapshot for one ETF ticker. */
  etfSnapshot: (ticker: string) =>
    sosoFetch(`/etfs/${encodeURIComponent(ticker)}/market-snapshot`),
};
