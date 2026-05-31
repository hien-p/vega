"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, BarChart3, LayoutDashboard, Box, Home, X, ShoppingBag,
  Trophy, Menu, FlaskConical, Bot, Send
} from "lucide-react";
import { clsx } from "clsx";

import { PrivyAuthButton } from "@/components/auth/privy-auth-button";
import { VegaLogo } from "@/components/vega-logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  // wave2 = route depends on a stubbed backend endpoint that has no real
  // upstream wired yet. When NEXT_PUBLIC_DEMO_MODE=0, the route still
  // navigates but a badge marks it as work-in-progress so demos honestly
  // show what is shipped vs planned. /dashboard is the zero-mock vertical:
  // it pulls real SoSoValue ETF flows + real SoDEX tickers + real news.
  const navSections: Array<{
    label: string;
    items: Array<{ href: string; label: string; icon: typeof Activity; wave2?: boolean }>;
  }> = [
    {
      label: 'Overview',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: Activity },
        { href: '/analytics', label: 'Analytics', icon: BarChart3, wave2: true },
        { href: '/telegram', label: 'Telegram', icon: Send, wave2: true },
      ]
    },
    {
      label: 'Discover',
      items: [
        { href: '/marketplace', label: 'Marketplace', icon: Trophy, wave2: true },
        { href: '/copy', label: 'Copy Trading', icon: ShoppingBag, wave2: true },
      ]
    },
    {
      label: 'Studio',
      items: [
        { href: '/builder', label: 'Builder Studio', icon: Box, wave2: true },
        { href: '/copilot', label: 'Copilot', icon: Bot, wave2: true },
        { href: '/bots', label: 'My Bots', icon: LayoutDashboard, wave2: true },
        { href: '/backtests', label: 'Backtests', icon: FlaskConical, wave2: true },
      ]
    }
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const sidebarContent = (
    <div className="w-72 h-full flex-shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-secondary flex flex-col">
      {/* Logo Area */}
      <div className="h-16 p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group pl-2">
          <VegaLogo className="w-7 h-7 text-neutral-50 group-hover:rotate-12 transition-transform duration-300" />
          <div className="flex items-baseline font-black tracking-tighter text-xl uppercase mb-[2px]">
            <span className="text-neutral-50">Ve</span>
            <span className="text-[#dce85d] ml-[1px]">ga</span>
          </div>
        </Link>
        <button
          onClick={() => setIsMobileSidebarOpen(false)}
          className="lg:hidden p-2 hover:bg-neutral-900 rounded-md transition-colors text-neutral-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 flex flex-col gap-8">
        {navSections.map((section) => (
          <div key={section.label} className="space-y-1">
            <h3 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest px-4 mb-3">
              {section.label}
            </h3>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative',
                      active
                        ? 'text-[#dce85d] bg-[#dce85d]/10'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-white/5'
                    )}
                  >
                    {active && (
                      <motion.div 
                        layoutId="activeNavTab"
                        className="absolute left-0 w-1 h-1/2 top-1/4 bg-[#dce85d] rounded-r-full"
                      />
                    )}
                    <Icon className={clsx("w-[18px] h-[18px] transition-colors", active ? "text-[#dce85d]" : "text-neutral-500 group-hover:text-neutral-200")} strokeWidth={active ? 2.5 : 2} />
                    <span>{item.label}</span>
                    {item.wave2 && (
                      <span
                        title="Wave 2 — still uses stub data; UI is shipped but backend wiring is in progress"
                        className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 group-hover:text-neutral-300"
                      >
                        W2
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Back to Home Link */}
      <div className="p-4 border-t border-[rgba(255,255,255,0.06)] flex flex-col gap-3 pb-6">
        <Link
          href="/"
          className="flex items-center py-2.5 px-4 rounded-xl text-sm font-medium text-neutral-400 hover:text-neutral-50 hover:bg-white/5 transition-all group"
        >
          <Home className="w-[18px] h-[18px] text-neutral-500 group-hover:text-neutral-200 mr-3 transition-colors" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-app overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-full">
        {sidebarContent}
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.div
              initial={{ x: -288 }}
              animate={{ x: 0 }}
              exit={{ x: -288 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 z-50 lg:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* App Header */}
        <motion.header
          initial={{ y: -10 }}
          animate={{ y: 0 }}
          className="h-16 flex-shrink-0 border-b border-[rgba(255,255,255,0.06)] bg-secondary/95 backdrop-blur-sm relative z-10"
        >
          <div className="h-full px-6 flex items-center justify-between lg:justify-end">
             <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-neutral-900 rounded-md transition-colors text-neutral-400"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div data-tour="wallet-connect">
              <PrivyAuthButton />
            </div>
          </div>
        </motion.header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
