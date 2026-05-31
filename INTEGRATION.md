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
                                                  ┌────────────────────────┐
                                                  │  SoDEX SPOT SEQUENCER  │
                                                  │  internal chain        │
                                                  │  block 148M+ · 1s/blk  │
                                                  │  every order = a tx    │
                                                  │  visible at            │
                                                  │  testnet.sodex.com/    │
                                                  │  explorer              │
                                                  └────────────┬───────────┘
                                                               │ bridge
                                                               │ (deposit /
                                                               │  withdraw only)
                                                               ▼
                                                  ┌────────────────────────┐
                                                  │     VALUECHAIN L1      │
                                                  │  EVM · 286623 (main)   │
                                                  │       · 138565 (test)  │
                                                  │  Wallet pays SOSO gas  │
                                                  │  only when moving      │
                                                  │  funds across bridge.  │
                                                  └────────────────────────┘
```

Every arrow above is a real network call. Pieces with shipped code are
described in §3-7 with exact endpoints. Critically, **a placed order is
NOT an L1 transaction** — it is a signed message that the SoDEX
sequencer chain accepts. See §7.5 for the live evidence.

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

## 7.5. Off-chain orderbook, on-chain bridge — what's actually L1?

A common misread of SoSoValue's "on-chain orderbook" framing is that
every order becomes a ValueChain L1 transaction. It does not. Live
testing on testnet:

1. **Placed a real signed limit BUY** (orderID `1250224257`,
   `vBTC_vUSDC` 0.0004 @ 25217, signed via wagmi-style EIP-712) and
   **cancelled it** with a second signature. Both accepted by the
   SoDEX engine.
2. **`eth_getTransactionCount` for the wallet on ValueChain L1
   testnet returned 0**, and `eth_getBalance` returned 0 SOSO. The
   wallet has never broadcast an L1 transaction.
3. **`eth_getLogs` for ERC20 Transfer events touching the wallet
   returned 0 hits in either direction.** The faucet credit (1200
   vUSDC) reached the SoDEX engine without an L1 token transfer.
4. **The `blockHeight` field in every SoDEX response is in the
   148M range** while ValueChain L1 testnet is at ~8.5M. They are
   different chains entirely. The 148M counter is the SoDEX Spot
   sequencer's own block height, visible at
   `testnet.sodex.com/explorer?blocktype=spot`, where every order
   place / cancel is recorded as a "transaction" with its own hash.
5. **The EIP-712 `verifyingContract` is `0x0…0`**, which means the
   signature is bound to a domain (the string `"spot"` + chain id),
   not to any on-chain contract. There is no on-chain verifier
   contract to bind to — the SoDEX server verifies the signature
   off-chain.

The actual L1 boundary is the bridge that handles deposits and
withdrawals. We probed it (`apps/web/scripts/sodex-withdraw-probe.mjs`)
by signing a `transferAsset(type=EVMWithdraw)` request against the
public `POST /spot/accounts/transfers` endpoint and got
`"ToAccountID required"` — that endpoint is only for internal
account-to-account moves on the SoDEX engine, not for L1 withdrawals.
The real withdraw path lives in the closed-source UI at
`testnet.sodex.com/portfolio` and is not exposed in the public Go SDK.

**Practical consequences for an agent builder:**

- Vega does not need to budget any L1 gas for trading. The wallet
  never broadcasts a transaction; it only signs typed data that the
  SoDEX gateway accepts over HTTPS.
- "Order on chain" in a SoDEX context means **on the SoDEX Spot
  sequencer chain**, not on ValueChain L1. The agent's audit trail is
  in `/accounts/{addr}/orders/history` plus the SoDEX explorer, not
  in a ValueChain block explorer.
- Custody of the user's funds while on SoDEX is held by the SoDEX
  engine. Deposits and withdrawals are the only L1 events; everything
  else is settled in the sequencer chain. This is the same model as
  dYdX v3 / Aevo / RabbitX — `agent-friendly` ≠ `every-action-on-L1`.

If those properties are unacceptable for a given strategy, the
strategy needs to scope its risk to the sequencer's uptime + the
operator's good behaviour, not to L1 finality.

### Verifying L1 connectivity yourself

Two scripts cover the L1 side independently of any SoDEX trading:

- `apps/web/scripts/sodex-l1-readiness.mjs` — reads the wallet's native
  SOSO balance, nonce, chain id, and latest block from the configured
  RPC; estimates whether the wallet can afford a 21k-gas self-transfer.
  Exits non-zero with a hint if not. No broadcast.
- `apps/web/scripts/sodex-l1-self-transfer.mjs` — broadcasts a 0-SOSO
  self-transfer (the minimal possible L1 action). Surfaces the tx hash
  and explorer URL on success, the revert reason on failure. Use
  `--dry-run` to call `estimateGas` only.

Both read `SODEX_TESTNET_PRIVATE_KEY` from `apps/web/.env.local`
(gitignored). On a fresh wallet you will see `balance: 0 SOSO` and
the self-transfer will refuse to broadcast; that is the expected
state because **the public testnet faucet only credits vUSDC inside
the SoDEX engine — it does not drop native SOSO to L1**.

The faucet endpoint (discovered by inspecting the testnet.sodex.com
JS bundle, not in the public SDK) is:

```
POST https://testnet.sodex.dev/faucet/api/claim   { address }
```

No signature required. Rate-limited to one claim per address per day.
`apps/web/scripts/sodex-faucet-claim.mjs` wraps it: takes the wallet
address (auto-resolved from `SODEX_TESTNET_PRIVATE_KEY`), POSTs the
claim, prints the resulting L1 transaction hash, polls for the
receipt, and reports the engine balance delta. A successful claim
returns the operator's tx — e.g. our first run produced
`0x1e3b48ec…cf1` at block `8545071`, gas used 97928, four Transfer /
Approval log events from the bridge contract — and the SoDEX engine
balance moved from 1200 to 1300 vUSDC. The next call returns
`{"code":1,"msg":"Already claimed"}` with HTTP 403.

That confirms the faucet is itself an L1 actor: the operator wallet
pays gas and sends vUSDC through a bridge contract that credits the
SoDEX engine. Our wallet appears nowhere on L1 in this flow — it
just receives an off-chain credit on the engine side. Per SoSoValue
docs, native SOSO testnet gas is earned through testnet tasks /
points rather than handed out by a public faucet. Once a wallet
holds any non-zero SOSO, the self-transfer script confirms the L1
broadcast path in one command.

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
