const BASE_URL =
  process.env.SOSOVALUE_API_BASE ?? "https://openapi.sosovalue.com";

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
      "SOSOVALUE_API_KEY is not set. Add it to .env.local — see README.",
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

export const sosovalue = {
  /** Featured news feed for a currency, e.g. BTC, ETH. */
  featuredNews: (currency: string) =>
    sosoFetch(`/api/v1/news/featured`, { query: { currency } }),
  /** Spot ETF flow / metrics aggregate. */
  etfOverview: () => sosoFetch(`/api/v1/etf/overview`),
};
