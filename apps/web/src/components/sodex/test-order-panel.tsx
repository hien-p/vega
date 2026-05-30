"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Loader2, Wallet, Zap, X } from "lucide-react";

import {
  fetchAccountState,
  fetchSymbols,
  fetchOrderbook,
  type SoDEXSymbol,
} from "@/lib/sodex-public";
import {
  placeBatchNewOrder,
  cancelBatchOrder,
  SoDEXTradeError,
} from "@/lib/sodex-trade";

type PlacedOrder = {
  orderID: number;
  clOrdID: string;
  symbol: string;
  symbolID: number;
  side: "buy";
  price: string;
  quantity: string;
  notional: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "running"; step: string }
  | { kind: "placed"; order: PlacedOrder }
  | { kind: "cancelled"; orderID: number }
  | { kind: "error"; message: string };

const FALLBACK_SYMBOL = "vBTC_vUSDC";

// Order construction mirrors scripts/sodex-place-testnet-order.mjs: 50%
// of best bid, qty ceil-rounded to clear 2× minNotional, capped to never
// go below the symbol's own minPrice/minQuantity.
function planOrder(sym: SoDEXSymbol, bestBid: number) {
  const tick = Number(sym.tickSize);
  const tickDecs = (sym.tickSize.split(".")[1] ?? "").length;
  const stepDecs = (sym.stepSize.split(".")[1] ?? "").length;

  const minPriceFloor = Math.max(Number(sym.minPrice || 0), tick);
  const priceNum = Math.max(bestBid * 0.5, minPriceFloor);
  const priceTicked = Math.floor(priceNum / tick) * tick;
  const price = priceTicked.toFixed(tickDecs);

  const minNotional = Number(
    (sym as SoDEXSymbol & { minNotional?: string }).minNotional ?? "5",
  );
  const targetNotional = Math.max(minNotional * 2, 5);
  const rawQty = targetNotional / Number(price);
  const step = Number(sym.stepSize);
  const ceiled = Math.ceil(rawQty / step - 1e-12) * step;
  const qtyChosen = Math.max(ceiled, Number(sym.minQuantity));
  const quantity = qtyChosen.toFixed(stepDecs);

  const notional = (Number(price) * Number(quantity)).toFixed(4);
  return { price, quantity, notional };
}

export function TestOrderPanel() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  async function runSmokeTest() {
    if (!address) return;
    setStatus({ kind: "running", step: "resolving accountID" });
    try {
      const stateRes = await fetchAccountState(address);
      if (stateRes.code !== 0 || !stateRes.data?.aid) {
        throw new Error(
          "No SoDEX account for this wallet. Visit testnet.sodex.com and connect once, then claim the faucet.",
        );
      }
      const accountID = stateRes.data.aid;

      setStatus({ kind: "running", step: "resolving symbol metadata" });
      const symRes = await fetchSymbols();
      const sym = symRes.data.find((s) => s.name === FALLBACK_SYMBOL);
      if (!sym) throw new Error(`Symbol ${FALLBACK_SYMBOL} not found on this network`);

      setStatus({ kind: "running", step: "reading orderbook" });
      const obRes = await fetchOrderbook(FALLBACK_SYMBOL, 1);
      const bestBid = Number(obRes.data?.bids?.[0]?.[0] ?? 0);
      if (!bestBid) throw new Error("Orderbook empty — cannot anchor a safe price");

      const { price, quantity, notional } = planOrder(sym, bestBid);
      const clOrdID = `vega-ui-${Date.now()}`;

      setStatus({ kind: "running", step: "waiting for wallet signature" });
      const res = await placeBatchNewOrder({
        accountID,
        orders: [
          {
            symbolID: sym.id,
            clOrdID,
            side: "buy",
            type: "limit",
            timeInForce: "gtc",
            price,
            quantity,
          },
        ],
      });
      const data = Array.isArray(res.data) ? res.data[0] : null;
      const orderID = Number((data as { orderID?: number } | null)?.orderID ?? 0);
      if (!orderID) throw new Error("Server accepted but returned no orderID");

      const placedNow: PlacedOrder = {
        orderID,
        clOrdID,
        symbol: FALLBACK_SYMBOL,
        symbolID: sym.id,
        side: "buy",
        price,
        quantity,
        notional,
      };
      setPlaced(placedNow);
      setStatus({ kind: "placed", order: placedNow });
    } catch (err) {
      setStatus({ kind: "error", message: formatErr(err) });
    }
  }

  async function cancelLast() {
    if (!placed) return;
    setStatus({ kind: "running", step: "waiting for wallet signature (cancel)" });
    try {
      // Re-resolve accountID — never trust stale state for a write.
      const stateRes = await fetchAccountState(address!);
      const accountID = stateRes.data?.aid;
      if (!accountID) throw new Error("Lost account state mid-flow");

      await cancelBatchOrder({
        accountID,
        cancels: [
          {
            symbolID: placed.symbolID,
            clOrdID: `vega-ui-cancel-${Date.now()}`,
            orderID: placed.orderID,
          },
        ],
      });
      setStatus({ kind: "cancelled", orderID: placed.orderID });
      setPlaced(null);
    } catch (err) {
      setStatus({ kind: "error", message: formatErr(err) });
    }
  }

  return (
    <section className="rounded-3xl border border-white/8 bg-card-deep/60 p-5 backdrop-blur-md sm:p-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-[#dce85d]" />
          <h3 className="text-base font-medium tracking-tight text-neutral-50">
            EIP-712 signed-order smoke test
          </h3>
          <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-neutral-400">
            testnet
          </span>
        </div>
      </header>

      <p className="mb-4 text-xs leading-relaxed text-neutral-400">
        Places one tiny vBTC_vUSDC limit BUY at ~50% of best bid via the connected
        wallet — verifies the full signing pipeline end-to-end. The order
        sits resting on the testnet book; click Cancel to release the margin.
      </p>

      {!isConnected && (
        <button
          onClick={() => openConnectModal?.()}
          className="inline-flex items-center gap-2 rounded-full bg-[#dce85d] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#090a0a] transition hover:bg-[#e4ef6e]"
        >
          <Wallet className="size-3.5" /> Connect wallet
        </button>
      )}

      {isConnected && status.kind === "idle" && (
        <button
          onClick={runSmokeTest}
          className="inline-flex items-center gap-2 rounded-full bg-[#dce85d] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#090a0a] transition hover:bg-[#e4ef6e]"
        >
          <Zap className="size-3.5" /> Run signed-order smoke test
        </button>
      )}

      {status.kind === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300">
          <Loader2 className="size-3.5 animate-spin" />
          {status.step}…
        </div>
      )}

      {status.kind === "placed" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-start gap-2 rounded-md border border-[#74b97f]/30 bg-[#74b97f]/10 px-3 py-2 text-xs text-[#9ee0a8]">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold uppercase tracking-wide">
                Signed order accepted
              </div>
              <div className="mt-1 font-mono text-[11px] text-neutral-300">
                orderID {status.order.orderID} · {status.order.symbol} BUY @
                {status.order.price} qty {status.order.quantity} · margin{" "}
                {status.order.notional} vUSDC
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={cancelLast}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-200 hover:bg-white/10"
            >
              <X className="size-3" /> Cancel order
            </button>
            <button
              onClick={runSmokeTest}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-200 hover:bg-white/10"
            >
              <Zap className="size-3" /> Run again
            </button>
          </div>
        </motion.div>
      )}

      {status.kind === "cancelled" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-neutral-300"
        >
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#9ee0a8]" />
          <div>
            <div className="font-semibold uppercase tracking-wide">
              Cancel accepted
            </div>
            <div className="mt-1 font-mono text-[11px] text-neutral-400">
              orderID {status.orderID} released — margin returned.
            </div>
            <button
              onClick={runSmokeTest}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-white/10"
            >
              <Zap className="size-3" /> Run again
            </button>
          </div>
        </motion.div>
      )}

      {status.kind === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-md border border-[#e06c6e]/30 bg-[#e06c6e]/10 px-3 py-2 text-xs text-[#e06c6e]"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold uppercase tracking-wide">Failed</div>
            <div className="mt-1 break-all font-mono text-[11px]">
              {status.message}
            </div>
            <button
              onClick={() => setStatus({ kind: "idle" })}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-300 hover:bg-white/10"
            >
              Reset
            </button>
          </div>
        </motion.div>
      )}
    </section>
  );
}

function formatErr(err: unknown): string {
  if (err instanceof SoDEXTradeError) {
    return `${err.message} (code ${err.code ?? "?"})`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
