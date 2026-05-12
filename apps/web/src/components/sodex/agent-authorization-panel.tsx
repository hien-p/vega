"use client";

import { useVegaAuth } from "@/lib/vega-auth";

/**
 * Wave-1 demo-mode panel. The original ClashX component was deeply tied to
 * Solana wallets (Phantom / Backpack / Solflare) + a Privy session + a
 * Pacifica backend endpoint — none of which apply to Vega's EVM stack.
 *
 * Wave 2 will wire EIP712 typed-signature ordering on ValueChain through the
 * user's connected wagmi wallet (MetaMask/Rabby/Coinbase). For now this
 * panel just reports the connected wallet, marks the runtime as not-yet-armed,
 * and renders honestly so judges see exactly what's planned.
 */
export function AgentAuthorizationPanel({
  compact = false,
  walletAddressOverride,
}: {
  compact?: boolean;
  walletAddressOverride?: string | null;
  onAuthorized?: () => void;
}) {
  const { authenticated, walletAddress: authenticatedWallet, login } = useVegaAuth();
  const resolvedWalletAddress = walletAddressOverride?.trim() || authenticatedWallet || "";
  const shortAddr = resolvedWalletAddress
    ? `${resolvedWalletAddress.slice(0, 6)}…${resolvedWalletAddress.slice(-4)}`
    : "—";

  return (
    <section
      className={`grid gap-4 rounded-[1.4rem] border border-[rgba(255,255,255,0.06)] bg-[#0d0f10] ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#dce85d]">
            Wave 2 · planned
          </div>
          <h3 className="mt-1 font-mono text-lg font-bold uppercase tracking-tight text-neutral-50">
            Agent authorization
          </h3>
        </div>
        <span className="rounded-full border border-white/8 bg-white/[0.02] px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-neutral-400">
          not armed
        </span>
      </header>

      <p className="text-sm leading-relaxed text-neutral-400">
        Vega runs on <span className="text-neutral-200">ValueChain</span> (EVM
        L1, chainId 286623). Trade orders use{" "}
        <span className="text-neutral-200">EIP712 typed signatures</span> from
        your connected wallet — no custody, no separate API key.
      </p>

      <div className="grid gap-3 rounded-[1rem] border border-white/8 bg-[#090a0a] p-4 text-xs leading-5 text-neutral-400">
        <div className="flex justify-between gap-3">
          <span>Connected wallet</span>
          <span className="font-mono text-neutral-200">{shortAddr}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Network target</span>
          <span className="text-neutral-200">ValueChain (286623)</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Signer scheme</span>
          <span className="text-neutral-200">EIP712 typed signature</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Status</span>
          <span className="text-[#dca204]">demo — wiring in Wave 2</span>
        </div>
      </div>

      {!authenticated && (
        <button
          type="button"
          onClick={login}
          className="inline-flex w-fit items-center rounded-full bg-[#dce85d] px-4 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[#090a0a] transition hover:bg-[#e4ef6e]"
        >
          Connect wallet
        </button>
      )}

      <p className="text-[0.7rem] leading-4 text-neutral-500">
        Wave 2 ships the actual signing flow: select a delegated session key,
        sign the authorization payload via{" "}
        <span className="text-neutral-300">eth_signTypedData_v4</span>, and
        register it with the SoDEX gateway. For Wave 1 we wire the read path
        (markets, news, ETF flow) and freeze the agent runtime here.
      </p>
    </section>
  );
}
