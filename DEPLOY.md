# Cloudflare Deploy Guide

This repo deploys to **Cloudflare Workers** via `@opennextjs/cloudflare`.
The Cloudflare dashboard's Workers Builds runner handles the OpenNext build
on their servers (which sidesteps a local-only esbuild + pnpm symlink bug
we hit on this machine).

## Steps

1. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create**
2. Click **Import a repository**
3. Connect your GitHub account (`hien-p`) and select **`hien-p/vega`**
4. Configure the project:

   | Field                  | Value                                          |
   | ---------------------- | ---------------------------------------------- |
   | Project name           | `vega`                                         |
   | Production branch      | `main`                                         |
   | Framework preset       | **Next.js (OpenNext)**                         |
   | Root directory         | `apps/web`                                     |
   | Build command          | `pnpm install && pnpm build:cf && npx opennextjs-cloudflare build` |
   | Deploy command         | `npx wrangler deploy`                          |
   | Build output directory | `.open-next`                                   |
   | Node version           | `22`                                           |

5. Add **Environment Variables** (Settings → Variables → Production):

   | Name                                       | Type   | Value                                  |
   | ------------------------------------------ | ------ | -------------------------------------- |
   | `SOSOVALUE_API_KEY`                        | Secret | _(your SoSoValue Buildathon key)_      |
   | `SODEX_API_KEY`                            | Secret | _(your SoDEX key, optional)_           |
   | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`     | Plain  | _(WalletConnect Cloud projectId, 32 hex chars)_ |
   | `NEXT_PUBLIC_VALUECHAIN_ID`                | Plain  | `286623`                               |
   | `NEXT_PUBLIC_VALUECHAIN_RPC`               | Plain  | _(get from ChainList.org/chain/286623)_|
   | `NEXT_PUBLIC_VALUECHAIN_EXPLORER`          | Plain  | `https://main-scan.valuechain.xyz`     |
   | `REACTBITS_LICENSE_KEY`                    | Secret | _(only needed if you re-run shadcn add at build time; not required at runtime)_ |

6. Click **Save and deploy**.

The first deploy takes ~3–5 minutes. Subsequent pushes to `main`
auto-deploy in ~90 seconds.

## What you get

- A live Workers URL: `https://vega.<your-account>.workers.dev`
- HTTPS + global edge
- Auto-deploys on every `git push`

## Local notes

- `apps/web/wrangler.jsonc` is the Worker config (compat date 2026-04-15,
  `nodejs_compat` flag).
- `apps/web/open-next.config.ts` overrides OpenNext's build command to
  `pnpm build:cf` (which is `next build --webpack`) because Next 16's
  Turbopack has a workspace-root inference bug in pnpm monorepos under
  standalone-build mode.
- `apps/web/.gitignore` excludes `.open-next/` and `.wrangler/` artifacts.

## Why dashboard, not local CLI?

Local CLI deploy works through 3 of 4 OpenNext compat issues; the 4th
(esbuild can't resolve Next 16 internals through pnpm symlinks during
the server-bundle stage) is fixed in newer adapter releases that
Cloudflare's build runner pulls in automatically. If you need a local
deploy later, switch to npm + flat node_modules or wait for
`@opennextjs/cloudflare` >1.20 with the symlink fix.
