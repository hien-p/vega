"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Workflow, Sparkles, Bot } from "lucide-react";

import { useVegaAuth } from "@/lib/vega-auth";
import { LiveEtfFlow } from "@/components/sosovalue/live-etf-flow";
import { LiveNewsFeed } from "@/components/sosovalue/live-news-feed";
import { LiveSoDEXMarkets } from "@/components/sodex/live-markets";

const QUICK_LINKS = [
  {
    href: "/builder",
    icon: Workflow,
    title: "Visual Strategy Builder",
    body: "Compose trigger → filter → action graphs on a canvas. Save and backtest.",
  },
  {
    href: "/copilot",
    icon: Sparkles,
    title: "AI Copilot",
    body: "Describe a thesis in English; get a strategy draft + relevant SoSoValue data.",
  },
  {
    href: "/bots",
    icon: Bot,
    title: "Autonomous Agents",
    body: "Deploy strategies as EIP712-signed agents executing on SoDEX.",
  },
];

export default function DashboardRoute() {
  const { walletAddress } = useVegaAuth();

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="font-mono text-3xl font-bold uppercase tracking-tight text-neutral-50">
            Dashboard
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-neutral-400">
            Live signals from SoSoValue + SoDEX, ready to feed an agent.
            {walletAddress ? (
              <>
                {" "}
                Connected as{" "}
                <span className="font-mono text-neutral-200">
                  {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
                .
              </>
            ) : null}
          </p>
        </div>
        <Link
          href="/builder"
          className="group inline-flex items-center gap-2 rounded-full bg-[#dce85d] px-5 py-2.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#090a0a] transition hover:bg-[#e4ef6e]"
        >
          New agent
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      </motion.header>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <LiveEtfFlow symbol="BTC" />
        <LiveEtfFlow symbol="ETH" />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <LiveSoDEXMarkets limit={6} />
        <LiveNewsFeed limit={5} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {QUICK_LINKS.map(({ href, icon: Icon, title, body }, i) => (
          <motion.div
            key={href}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
          >
            <Link
              href={href}
              className="group flex h-full flex-col justify-between rounded-3xl border border-white/8 bg-card-deep/60 p-5 backdrop-blur-md transition hover:border-[#dce85d]/40 hover:bg-card-deep/80"
            >
              <div>
                <Icon className="size-5 text-[#dce85d]" />
                <h3 className="mt-3 text-base font-medium text-neutral-50">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
                  {body}
                </p>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#dce85d] transition group-hover:gap-2.5">
                Open
                <ArrowRight className="size-3" />
              </div>
            </Link>
          </motion.div>
        ))}
      </section>

      <footer className="mt-10 text-center text-[10px] uppercase tracking-[0.18em] text-neutral-500">
        Live data: SoSoValue + SoDEX testnet · Refreshes on every page load
      </footer>
    </main>
  );
}
