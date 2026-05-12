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

// wagmi's default public RPCs for each chain we register (mainnet, base, etc.)
// have restrictive CORS that floods the console. The reads themselves are
// optional/non-critical — wagmi tolerates failures — so we short-circuit
// with an empty JSON-RPC success response.
const SUPPRESSED_RPCS = [
  "https://eth.merkle.io",
  "https://cloudflare-eth.com",
  "https://rpc.ankr.com/eth",
];

function stubBodyForUrl(url: string, method = "GET"): unknown {
  // POST /api/bots — create a bot draft, returns {id}
  if (method === "POST" && /\/api\/bots\/?(\?|$)/.test(url))
    return { id: "demo-bot-" + Date.now() };
  // PATCH /api/bots/:id — update an existing draft
  if (method === "PATCH" && /\/api\/bots\/[^/]+/.test(url))
    return { id: url.split("/").pop()?.split("?")[0] ?? "demo-bot" };
  // POST /api/bots/:id/deploy — start the runtime
  if (method === "POST" && /\/deploy(\?|$)/.test(url))
    return { status: "active", runtime_id: "demo-runtime-" + Date.now() };
  // POST /api/builder/validate — strategy validation
  if (method === "POST" && url.includes("/builder/validate"))
    return { valid: true, errors: [], warnings: [] };

  // Marketplace overview expects {discover, featured, creators}
  if (url.includes("/marketplace/overview") || url.includes("/public-bots"))
    return { discover: [], featured: [], creators: [] };

  // Readiness / onboarding panels expect the full SoDEXReadinessPayload shape
  // including a `metrics` object. We return ready=true with verified steps so
  // judges can experience the full deploy flow end-to-end in demo mode —
  // Wave 2 wires the real backend that gates this for safety.
  if (url.includes("/readiness") || url.includes("/sodex-readiness"))
    return {
      wallet_address: "",
      ready: true,
      blockers: [],
      metrics: {
        sol_balance: 1,
        min_sol_balance: 0.1,
        equity_usd: 250,
        min_equity_usd: 100,
        agent_wallet_address: "0x0000000000000000000000000000000000000000",
        authorization_status: "demo",
        builder_code: "VEGA-DEMO",
      },
      steps: [
        {
          id: "funding",
          title: "Testnet wallet funded",
          verified: true,
          detail: "Demo mode — Wave 2 verifies real $SOSO + SoDEX equity.",
        },
        {
          id: "app_access",
          title: "App access granted",
          verified: true,
          detail: "Demo mode — Wave 2 binds the Vega session to your wallet.",
        },
        {
          id: "agent_authorization",
          title: "Agent runtime ready",
          verified: true,
          detail: "Demo mode — Wave 2 ships EIP712-signed delegation.",
        },
      ],
    };

  // Backtest bootstrap → various fields
  if (url.includes("/backtests/bootstrap"))
    return { strategies: [], markets: [], runs: [], jobs: [] };

  // Copilot conversations / chat jobs
  if (url.includes("/copilot/conversations") || url.includes("/copilot/chat"))
    return [];

  // Bots fleet — /api/bots returns BotFleetItem[] directly (callsite spreads
  // it with [...nextBots]). Other bots-* endpoints expect an object.
  if (/\/api\/bots(\?|$)/.test(url) || url.includes("/api/bots/runtime-overviews"))
    return [];
  if (url.includes("/bots") || url.includes("/runtime") || url.includes("/fleet"))
    return { bots: [], runtimes: [], summary: {} };

  // Builder templates / markets — both are array-typed at the callsites
  if (url.includes("/builder/templates")) return [];
  if (url.includes("/builder/markets")) return [];
  if (url.includes("/builder/validate")) return { errors: [], warnings: [] };

  // Builder AI chat — friendly demo-mode response. Real Anthropic / OpenAI
  // tool-calling wiring is Wave 2. Return a `failed` poll result whose
  // errorDetail reads like a helpful note, not a scary error.
  if (url.includes("/builder/ai-chat/jobs") && url.endsWith("/jobs"))
    return { id: "demo-job-" + Date.now() };
  if (url.includes("/builder/ai-chat/jobs/"))
    return {
      id: url.split("/").pop(),
      status: "failed",
      errorDetail:
        "Demo mode — AI Copilot wires to Anthropic Claude / OpenAI with SoSoValue + SoDEX tool-calling in Wave 2. For Wave 1 use the Visual tab to drag blocks from the palette onto the canvas.",
    };

  // Copy trading dashboard — full shape required: follows, positions, readiness,
  // summary metric fields, activity, discover, baskets_summary. The component
  // calls .map / iterates over multiple fields unconditionally.
  if (url.includes("/copy/dashboard"))
    return {
      follows: [],
      positions: [],
      activity: [],
      discover: [],
      baskets_summary: { count: 0, total_open_notional_usd: 0, total_pnl_usd: 0 },
      summary: {
        active_follows: 0,
        open_positions: 0,
        copied_open_notional_usd: 0,
        copied_unrealized_pnl_usd: 0,
        copied_realized_pnl_usd_24h: 0,
      },
      readiness: {
        can_copy: false,
        authorization_status: "demo",
        blockers: ["Demo mode — Wave 2 wires copy execution"],
      },
    };
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
        const method = (init?.method ?? "GET").toUpperCase();
        return Promise.resolve(
          new Response(JSON.stringify(stubBodyForUrl(url, method)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // wagmi public RPC pings — return a benign empty JSON-RPC reply.
      // Saves 100+ red CORS errors in the console without breaking wagmi.
      if (SUPPRESSED_RPCS.some((p) => url.startsWith(p))) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return original(input, init);
    };
  }
}

export {};
