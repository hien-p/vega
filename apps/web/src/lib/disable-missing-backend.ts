/**
 * Module-level fetch interceptor for the static Cloudflare deploy.
 *
 * Cloned ClashX (app) pages call `http://localhost:8000/api/...` (Pacifica
 * FastAPI backend) which doesn't exist in production. Without this patch
 * each page flashes a red "Failed to fetch" banner. We return shape-aware
 * empty stubs so components see "no data" and render their empty states
 * cleanly. Real upstreams (sosovalue.com, sodex.dev, our worker, wallet
 * RPCs) pass through untouched.
 */

const DISABLED_PREFIXES = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8001",
];

function stubBodyForUrl(url: string): unknown {
  // Marketplace overview expects {discover, featured, creators}
  if (url.includes("/marketplace/overview") || url.includes("/public-bots"))
    return { discover: [], featured: [], creators: [] };

  // Readiness / onboarding panels expect the full SoDEXReadinessPayload shape
  // including a `metrics` object — missing it crashes the React tree because
  // the onboarding page reads readiness.metrics.sol_balance unconditionally.
  if (url.includes("/readiness") || url.includes("/sodex-readiness"))
    return {
      wallet_address: "",
      ready: false,
      blockers: ["Demo mode — backend not deployed"],
      metrics: {
        sol_balance: 0,
        min_sol_balance: 0.1,
        equity_usd: null,
        min_equity_usd: 100,
        agent_wallet_address: null,
        authorization_status: "inactive",
        builder_code: null,
      },
      steps: [
        {
          id: "funding",
          title: "Fund testnet wallet",
          verified: false,
          detail: "Demo mode — wallet funding tracked in real backend.",
        },
        {
          id: "app_access",
          title: "App access",
          verified: false,
          detail: "Demo mode — backend not deployed.",
        },
        {
          id: "agent_authorization",
          title: "Agent authorization",
          verified: false,
          detail: "Demo mode — EIP712 signing wired in Wave 2.",
        },
      ],
    };

  // Backtest bootstrap → various fields
  if (url.includes("/backtests/bootstrap"))
    return { strategies: [], markets: [], runs: [], jobs: [] };

  // Copilot conversations / chat jobs
  if (url.includes("/copilot/conversations") || url.includes("/copilot/chat"))
    return [];

  // Bots fleet / runtime
  if (url.includes("/bots") || url.includes("/runtime") || url.includes("/fleet"))
    return { bots: [], runtimes: [], summary: {} };

  // Builder templates / markets — both are array-typed at the callsites
  if (url.includes("/builder/templates")) return [];
  if (url.includes("/builder/markets")) return [];
  if (url.includes("/builder/validate")) return { errors: [], warnings: [] };

  // Copy trading
  if (url.includes("/copy/dashboard"))
    return { mirrors: [], clones: [], summary: {} };
  if (url.includes("/copy/portfolios"))
    return { portfolios: [], summary: {} };

  // Telegram
  if (url.includes("/telegram")) return { linked: false, username: null };

  // Default: empty array (works for most generic list endpoints)
  return [];
}

if (typeof window !== "undefined") {
  const win = window as Window & { __vegaFetchPatched?: boolean };
  if (!win.__vegaFetchPatched) {
    win.__vegaFetchPatched = true;
    const original = window.fetch.bind(window);

    window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (DISABLED_PREFIXES.some((p) => url.startsWith(p))) {
        return Promise.resolve(
          new Response(JSON.stringify(stubBodyForUrl(url)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return original(input, init);
    };
  }
}

export {};
