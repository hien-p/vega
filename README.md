# Sosodex

Hackathon entry for **Build Your One-Person On-Chain Finance Business with SoSoValue**
([Akindo Wave Hack](https://app.akindo.io/wave-hacks/JBEQXgN4Zi2jA3wA?tab=overview)).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- wagmi v2 + viem v2 + RainbowKit v2 + TanStack Query
- shadcn/ui (Radix) components
- SoSoValue REST API, proxied server-side so the API key never touches the client

## Setup

```bash
pnpm install
cp .env.example .env.local
# fill in SOSOVALUE_API_KEY and NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
pnpm dev
```

Open http://localhost:3000.

## Environment

| Var                                    | Where                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `SOSOVALUE_API_KEY`                    | Server-only. Request at https://sosovalue.com/developer. Beta plan = 20 calls/min.               |
| `SOSOVALUE_API_BASE`                   | Optional override. Defaults to `https://openapi.sosovalue.com` — verify against the latest docs. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | https://cloud.walletconnect.com                                                                  |

## Layout

```
src/
  app/
    api/sosovalue/        ← server proxies for SoSoValue endpoints
    layout.tsx            ← wraps children in <Providers>
    providers.tsx         ← Wagmi + Query + RainbowKit
    page.tsx              ← starter dashboard
  components/
    connect-wallet.tsx    ← RainbowKit ConnectButton
    ui/                   ← shadcn components
  lib/
    sosovalue.ts          ← typed client + error class
    wagmi.ts              ← chains + RainbowKit config
```

## SoSoValue API notes

- Docs: https://sosovalue.gitbook.io/soso-value-api-doc
- The auth header name and exact endpoint paths in `src/lib/sosovalue.ts` are starting
  guesses — confirm against the docs once your API key is provisioned and adjust.
- Always call SoSoValue from a server route handler. Never expose the key to the
  browser bundle.
