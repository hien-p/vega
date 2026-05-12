"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import {
  fetchEtfSummaryHistory,
  type EtfFlowRow,
} from "@/lib/sosovalue-public";

function formatUSD(n: number, opts: { signed?: boolean; compact?: boolean } = {}) {
  const sign = opts.signed && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (opts.compact) {
    const fmt = new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
      style: "currency",
      currency: "USD",
    });
    return `${sign}${fmt.format(n)}`;
  }
  return `${sign}${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(abs * Math.sign(n || 1))}`;
}

function dedupeByDate(rows: EtfFlowRow[]): EtfFlowRow[] {
  const seen = new Map<string, EtfFlowRow>();
  for (const r of rows) {
    if (!seen.has(r.date)) seen.set(r.date, r);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

function Sparkline({ rows }: { rows: EtfFlowRow[] }) {
  if (rows.length < 2) return null;
  const inflows = rows.slice(-30).map((r) => r.total_net_inflow);
  const min = Math.min(...inflows, 0);
  const max = Math.max(...inflows, 0);
  const range = max - min || 1;
  const w = 240;
  const h = 56;
  const step = w / (inflows.length - 1);
  const points = inflows
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  const lastV = inflows[inflows.length - 1];
  const zeroY = h - ((0 - min) / range) * h;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <line x1={0} x2={w} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeDasharray="2 4" />
      <polyline
        points={points}
        fill="none"
        stroke={lastV >= 0 ? "#74b97f" : "#e06c6e"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LiveEtfFlow({
  symbol = "BTC",
  className = "",
}: {
  symbol?: "BTC" | "ETH";
  className?: string;
}) {
  const [rows, setRows] = useState<EtfFlowRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetchEtfSummaryHistory({ symbol })
      .then((res) => {
        if (aborted) return;
        if (res.code !== 0 || !Array.isArray(res.data)) {
          setError("Empty response");
          return;
        }
        setRows(dedupeByDate(res.data));
      })
      .catch((err) => {
        if (!aborted) setError(err instanceof Error ? err.message : "fetch failed");
      });
    return () => {
      aborted = true;
    };
  }, [symbol]);

  if (error) {
    const isRateLimit = /429|rate limit/i.test(error);
    return (
      <div
        className={`rounded-2xl border border-[rgba(255,255,255,0.08)] bg-black/40 p-4 backdrop-blur-md ${className}`}
      >
        <div
          className={`text-[0.62rem] font-semibold uppercase tracking-[0.18em] ${
            isRateLimit ? "text-[#dca204]" : "text-[#e06c6e]"
          }`}
        >
          {symbol} ETF flow · {isRateLimit ? "rate limited" : "offline"}
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          {isRateLimit
            ? "SoSoValue Demo tier = 20 calls/min. Retry in ~60s, or apply for higher limits via the Buildathon access form."
            : error}
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-[rgba(255,255,255,0.08)] bg-black/40 p-4 backdrop-blur-md ${className}`}
      >
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#dce85d]">
          {symbol} ETF flow · loading
        </div>
        <div className="mt-3 h-14 w-full animate-pulse rounded-md bg-white/5" />
      </div>
    );
  }

  const latest = rows[rows.length - 1];
  const isUp = latest.total_net_inflow >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border border-[rgba(255,255,255,0.08)] bg-black/55 p-4 backdrop-blur-md ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-3 text-[#dce85d]" />
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#dce85d]">
            {symbol} ETF flow · live
          </span>
        </div>
        <span className="text-[10px] text-neutral-500">
          {new Date(latest.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">
            24h net inflow
          </div>
          <div
            className={`mt-0.5 flex items-center gap-1 font-mono text-2xl font-medium ${
              isUp ? "text-[#74b97f]" : "text-[#e06c6e]"
            }`}
          >
            {isUp ? (
              <ArrowUpRight className="size-5" />
            ) : (
              <ArrowDownRight className="size-5" />
            )}
            {formatUSD(latest.total_net_inflow, { compact: true, signed: true })}
          </div>
        </div>
        <Sparkline rows={rows} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 text-[10px]">
        <div>
          <div className="uppercase tracking-[0.14em] text-neutral-500">Cum. inflow</div>
          <div className="mt-0.5 font-mono text-neutral-100">
            {formatUSD(latest.cum_net_inflow, { compact: true })}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-[0.14em] text-neutral-500">Total AUM</div>
          <div className="mt-0.5 font-mono text-neutral-100">
            {formatUSD(latest.total_net_assets, { compact: true })}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-neutral-500">
        Source: SoSoValue API ·{" "}
        <a
          href="https://sosovalue.gitbook.io/soso-value-api-doc"
          target="_blank"
          rel="noreferrer"
          className="text-[#dce85d] hover:underline"
        >
          docs
        </a>
      </div>
    </motion.div>
  );
}
