"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Newspaper, ExternalLink } from "lucide-react";
import { fetchFeaturedNews, type NewsItem } from "@/lib/sosovalue-public";

function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function pickContent(item: NewsItem) {
  const en = item.multilanguageContent?.find((c) => c.language === "en");
  return en ?? item.multilanguageContent?.[0];
}

export function LiveNewsFeed({ limit = 5 }: { limit?: number }) {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetchFeaturedNews({ pageSize: 20 })
      .then((res) => {
        if (aborted) return;
        if (res.code !== 0) {
          setError("upstream error");
          return;
        }
        setItems(res.data.list.slice(0, limit));
      })
      .catch((err) => !aborted && setError(err instanceof Error ? err.message : "fetch failed"));
    return () => {
      aborted = true;
    };
  }, [limit]);

  return (
    <section className="rounded-3xl border border-white/8 bg-card-deep/60 p-5 backdrop-blur-md sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper className="size-4 text-[#dce85d]" />
          <h3 className="text-base font-medium tracking-tight text-neutral-50">
            Live news feed
          </h3>
        </div>
        <a
          href="https://sosovalue.gitbook.io/soso-value-api-doc/6.-feeds/featured-news.md"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#dce85d] hover:underline"
        >
          SoSoValue API ↗
        </a>
      </header>

      {error && (() => {
        const isRateLimit = /429|rate limit/i.test(error);
        return (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              isRateLimit
                ? "border-[#dca204]/30 bg-[#dca204]/10 text-[#dca204]"
                : "border-[#e06c6e]/30 bg-[#e06c6e]/10 text-[#e06c6e]"
            }`}
          >
            {isRateLimit
              ? "Rate limited — SoSoValue Demo tier = 20 calls/min. Retry in ~60s."
              : error}
          </div>
        );
      })()}

      {!items && !error && (
        <ul className="space-y-3">
          {Array.from({ length: limit }).map((_, i) => (
            <li key={i} className="h-12 animate-pulse rounded-md bg-white/5" />
          ))}
        </ul>
      )}

      {items && (
        <ul className="space-y-2">
          {items.map((item, i) => {
            const c = pickContent(item);
            const tags = (item.tags ?? []).slice(0, 3);
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                className="group rounded-xl border border-transparent p-3 transition hover:border-white/8 hover:bg-white/[0.02]"
              >
                <a
                  href={item.sourceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-neutral-100 group-hover:text-white">
                      {c?.title ?? "(untitled)"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                      <span className="text-neutral-400">{item.author}</span>
                      <span>·</span>
                      <span>{timeAgo(item.releaseTime)} ago</span>
                      {tags.length > 0 && (
                        <>
                          <span>·</span>
                          <div className="flex flex-wrap gap-1">
                            {tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full border border-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-neutral-400"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="mt-1 size-3.5 shrink-0 text-neutral-500 transition group-hover:text-[#dce85d]" />
                </a>
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
