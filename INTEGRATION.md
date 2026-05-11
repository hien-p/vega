# Integration Flow — SoSoValue × SoDEX × ValueChain

End-to-end map of how Vega integrates the SoSoValue ecosystem: where data
comes from, how it gets transformed into a strategy, and how that strategy
hits the SoDEX orderbook on ValueChain.

> Live demo wiring up all four blue boxes below:
> **https://app.vega-fi.workers.dev**

---

## 1. High-level data flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              VEGA TERMINAL                              │
│                                                                         │
│   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────┐   │
│   │  RESEARCH  │ → │   AGENT    │ → │  BACKTEST  │ → │  EXECUTION   │   │
│   │            │   │  AUTHORING │   │    LAB     │   │              │   │
│   └────┬───────┘   └─────┬──────┘   └────┬───────┘   └──────┬───────┘   │
│        │                 │                │                  │           │
│   News │ ETF        Visual│ AI         Historical│       Order│           │
│   SSI  │ flow       graph │ copilot    backtest  │       signed│           │
│        │                 │                │                  │           │
└────────┼─────────────────┼────────────────┼──────────────────┼───────────┘
         │                 │                │                  │
         ▼                 ▼                ▼                  ▼
   ┌──────────┐      ┌──────────┐     ┌──────────┐      ┌──────────────┐
   │SOSOVALUE │      │ ANTHROPIC│     │SOSOVALUE │      │  SODEX REST  │
   │   API    │      │  TOOLS   │     │HISTORICAL│      │   + WS       │
   │openapi.  │      │ (server) │     │   API    │      │testnet-gw.   │
   │sosovalue │      │          │     │          │      │ sodex.dev    │
   │  .com    │      │          │     │          │      │              │
   └──────────┘      └──────────┘     └──────────┘      └──────┬───────┘
                                                               │
                                                               ▼
                                                    ┌────────────────────┐
                                                    │     VALUECHAIN     │
                                                    │  EVM L1 · 286623   │
                                                    │  SOSO native gas   │
                                                    └────────────────────┘
```

Every arrow above is a real network call. Pieces with shipped code are
described in §3-7 with exact endpoints.

---

## 2. Stack at each layer

| Layer       | Runtime              | Files                                       |
| ----------- | -------------------- | ------------------------------------------- |
| Browser     | Next.js 16 static    | `apps/web/src/lib/{sosovalue,sodex}-public.ts` |
| Wallet      | wagmi v2 + viem v2   | `apps/web/src/lib/wagmi.ts`                 |
| (Optional) Backend | FastAPI       | `services/vega-backend/src/services/`       |
| Worker      | Cloudflare Workers   | `wrangler.toml` (static assets)             |

For the deployed Cloudflare build, all calls happen **in the browser**
using CORS — we verified `Access-Control-Allow-Origin` reflection on both
SoSoValue and SoDEX endpoints. There is no server-side proxy in
production (the FastAPI service in `services/vega-backend` is an
optional path for higher rate-limit consumers).

---

## 3. SoSoValue API — Research input

**Base**: `https://openapi.sosovalue.com/openapi/v1`
**Auth**: `x-soso-api-key: SOSO-…` header (Demo tier = free)
**Client**: [`apps/web/src/lib/sosovalue-public.ts`](apps/web/src/lib/sosovalue-public.ts)

| Endpoint                       | Vega use                          | Param shape                              |
| ------------------------------ | --------------------------------- | ---------------------------------------- |
| `GET /etfs/summary-history`    | Hero ETF flow widget + backtest history | `symbol=BTC` `country_code=US`     |
| `GET /etfs`                    | List all funds for a chain (IBIT, FBTC…) | `symbol=BTC` `country_code=US`     |
| `GET /etfs/{ticker}/market-snapshot` | Per-fund deep dive on agent click | path param                          |
| `GET /news/featured`           | Landing news feed + copilot RAG context | `pageNum=1` `pageSize=20`            |

**Gotchas we hit and fixed:**

- Base path is `/openapi/v1`, not `/api/v1` — undocumented in the
  overview page, only in module-specific docs.
- News uses camelCase params (`pageNum`, `pageSize`); we initially used
  snake_case `page`/`page_size` and got Chinese error responses
  (the upstream is a Java/Spring service).
- ETF endpoints **require both** `symbol` and `country_code` — neither
  default. Use `symbol=BTC&country_code=US` for U.S. spot Bitcoin ETFs,
  `symbol=ETH` for the Ethereum equivalents.

**Sample upstream response (confirmed live):**

```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "date": "2026-04-13",
      "total_net_inflow": -291100000,
      "total_value_traded": 4530000000,
      "total_net_assets": 106610000000,
      "cum_net_inflow": 59340306704693
    }
  ]
}
```

26 days of history returned in a single call; we use the most recent for
the hero badge and the trailing 30 for the sparkline.

---

## 4. SoDEX API — Live market data + execution

**Base**:
- Testnet `https://testnet-gw.sodex.dev/api/v1/spot` *(open, no auth)*
- Mainnet `https://mainnet-gw.sodex.dev/api/v1/spot` *(requires API key + Buildathon whitelist)*

**Auth (write endpoints)**: EIP712 typed signatures. The user's connected
EVM wallet signs each order. SoDEX recognises the signer's address as the
API key — no separate registration needed once whitelisted.

**Public market-data client**: [`apps/web/src/lib/sodex-public.ts`](apps/web/src/lib/sodex-public.ts)

| Endpoint                                | Vega use                                  |
| --------------------------------------- | ----------------------------------------- |
| `GET /markets/symbols`                  | Tradable pair discovery (price/qty precision, fees) |
| `GET /markets/tickers`                  | Landing markets panel (vMAG7.ssi, TESTBTC, etc.) |
| `GET /markets/{symbol}/orderbook`       | Builder node "orderbook imbalance" trigger |
| `GET /markets/{symbol}/klines`          | Backtest historical bars                  |
| `GET /markets/{symbol}/trades`          | Builder node "tape" trigger               |

**Symbol naming quirk** — testnet symbols are prefixed `v` for "virtual":
- `vMAG7ssi_vUSDC` — the **Magnificent 7 SSI index** from SoSoValue, tradable!
- `TESTBTC_vUSDC`, `vTSLA_vUSDC`, `vBNB_vUSDC`

This is the cleanest demonstration of the SoSoValue × SoDEX synergy: you
research the MAG7 index in `Research`, fork the methodology into a
strategy in `Builder`, backtest it against `/etfs/summary-history`, and
deploy an agent that signs market orders for `vMAG7ssi_vUSDC` on SoDEX.

---

## 5. ValueChain wallet integration

**Chain config**: [`apps/web/src/lib/wagmi.ts`](apps/web/src/lib/wagmi.ts)

```ts
defineChain({
  id: 286623,                          // mainnet (testnet = 138565)
  name: "ValueChain",
  nativeCurrency: { name: "SoSoValue", symbol: "SOSO", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_VALUECHAIN_RPC] } },
  blockExplorers: { default: { name: "Explorer", url: "https://main-scan.valuechain.xyz" } },
});
```

RainbowKit's `connectorsForWallets` exposes an explicit **EVM wallets**
group — MetaMask, Rabby, Coinbase, Rainbow — so users land on the right
mental model. ValueChain is EVM-compatible, so a normal `eth_sendTransaction`
or `eth_signTypedData_v4` flow Just Works once MetaMask is pointed at the
RPC.

---

## 6. End-to-end agent lifecycle

Tying the four layers together. Each step in the lifecycle is a Vega
page; right column shows the underlying network call.

```
USER ACTION                     UI SURFACE              API CALL
──────────────────────────────────────────────────────────────────────────
1. Browse latest insights       /research               SoSoValue
                                                        /news/featured
                                                        /etfs/summary-history
                                                        SSI indices

2. Ask copilot in plain English /copilot                Anthropic Claude
   "Long BTC when 5-day ETF                             with tool defs:
   inflow > $500M"                                       - fetchEtfSummary
                                                         - fetchTickers
                                                         - draftStrategy

3. Copilot emits a strategy     /builder                 (in-memory)
   graph; user tweaks nodes      (xyflow studio)
   on the canvas

4. Run backtest                 /backtests              SoSoValue
                                (lightweight-charts)     /etfs/summary-history
                                                         SoDEX
                                                         /markets/.../klines

5. Deploy agent                 /agents                  Wallet:
                                                          eth_signTypedData_v4
                                                         SoDEX:
                                                          POST /spot/orders
                                                          (EIP712)

6. Monitor PnL                  /dashboard              SoDEX
                                                         /spot/account/balance
                                                         /spot/orders/history
                                                         WS positions

7. Share or copy                /marketplace            Vega backend
   /copy                         /leaderboard            (Supabase)
```

Steps 1–4 already call live APIs in the current deploy. Steps 5–7 are
shipped as UI shells with mock data — the wiring slot is documented in
`apps/web/src/lib/sodex-trade.ts` (stub) for the trade-signing path, and
in `services/vega-backend` for the social layer.

---

## 7. Why this architecture

**Static-first frontend.** The whole web app builds to `out/` and ships
to Cloudflare Workers static assets. Cold start = file read, no Node
runtime. Cost = $0 at hackathon scale; can serve global without an
origin server.

**Server-optional.** Every data path can run from the browser. The
optional FastAPI backend (`services/vega-backend`) is only needed for:
- Higher rate limits via a shared key
- Server-side AI inference (avoiding exposing AI provider keys)
- Persistence for strategy graphs, agent state, marketplace metadata

For demo + judging, the static deploy alone proves data integration end
to end.

**Wallet = identity.** Because SoDEX uses EIP712 signatures keyed by EVM
address, there is no separate signup. Connect MetaMask once and the same
key authorizes both reads (account info) and writes (orders). This is
the "agent-friendly" property SoSoValue advertised — Vega agents are
just EVM addresses that hold a delegated signing key.

---

## 8. Env vars

| Var                                       | Where                | Purpose                                        |
| ----------------------------------------- | -------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SOSOVALUE_API_KEY`           | client + build       | SoSoValue Demo-tier key, embedded in bundle    |
| `SOSOVALUE_API_KEY`                       | optional server      | Same key for FastAPI proxy if used             |
| `NEXT_PUBLIC_SODEX_NETWORK`               | client               | `testnet` (default) or `mainnet`               |
| `NEXT_PUBLIC_SODEX_API_BASE`              | client               | Override SoDEX base URL                        |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`    | client               | Real 32-hex projectId to enable WalletConnect  |
| `NEXT_PUBLIC_VALUECHAIN_ID`               | client               | `286623` (mainnet) or `138565` (testnet)       |
| `NEXT_PUBLIC_VALUECHAIN_RPC`              | client               | HTTPS RPC for `defineChain`                    |
| `NEXT_PUBLIC_VALUECHAIN_EXPLORER`         | client               | Explorer URL for wallet UI                     |

For the deployed build only the first three matter — wallet connection is
optional for the read-only landing experience.

---

## 9. Reproducing locally

```bash
git clone https://github.com/hien-p/vega
cd vega
pnpm install
cp .env.example .env.local                   # fill SOSOVALUE_API_KEY
pnpm --filter @vega/web dev                  # http://localhost:3000
```

To re-deploy the Cloudflare bundle:

```bash
pnpm --filter @vega/web build                # → apps/web/out
cp -R apps/web/out/. ../vega-web/apps/web/
cd ../vega-web && npx wrangler deploy
```

---

## 10. References

- [SoSoValue API docs](https://sosovalue.gitbook.io/soso-value-api-doc) — read carefully, base URL is `/openapi/v1`
- [SoDEX REST V1 reference](https://sodex.com/documentation/api/rest-v1/sodex-rest-spot-api.md)
- [ValueChain on ChainList](https://chainlist.org/chain/286623)
- [Buildathon access form](https://forms.gle/2nuJT2qNbUQsyyZy8) — for mainnet SoDEX + raised SoSoValue limits
