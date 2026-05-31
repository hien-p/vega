/**
 * Send a real ValueChain L1 transaction. Self-transfer of zero SOSO —
 * the simplest possible on-chain action, useful as a smoke test that
 * the wallet can sign and broadcast against the configured RPC.
 *
 * This is intentionally distinct from any SoDEX trading flow. Placing
 * an order on SoDEX touches the off-chain Spot sequencer (see
 * INTEGRATION.md §7.5); this script touches L1 directly.
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-l1-self-transfer.mjs
 *   node --env-file=.env.local scripts/sodex-l1-self-transfer.mjs --network mainnet --dry-run
 *
 * Flags:
 *   --network <net>   testnet | mainnet (default testnet)
 *   --to <addr>       send target; defaults to the wallet itself (self-transfer)
 *   --value <wei>     value in wei; default 0
 *   --dry-run         simulate (no broadcast). Returns gas estimate + signed-tx hash preview.
 *
 * Failure on insufficient gas is expected when the wallet has no native
 * SOSO — pair with sodex-l1-readiness.mjs to gate this script.
 */

import { createPublicClient, createWalletClient, http, defineChain, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const NETWORKS = {
  testnet: {
    rpc: "https://testnet-rpc.valuechain.xyz",
    chainId: 138565,
    explorer: "https://test-scan.valuechain.xyz",
    name: "ValueChain Testnet",
  },
  mainnet: {
    rpc: "https://rpc.valuechain.xyz",
    chainId: 286623,
    explorer: "https://main-scan.valuechain.xyz",
    name: "ValueChain",
  },
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const network = flag("--network", "testnet");
const toOverride = flag("--to", null);
const valueWei = BigInt(flag("--value", "0"));
const cfg = NETWORKS[network];
if (!cfg) {
  console.error(`Unknown network "${network}".`);
  process.exit(2);
}

const raw = process.env.SODEX_TESTNET_PRIVATE_KEY;
if (!raw) {
  console.error("Set SODEX_TESTNET_PRIVATE_KEY in .env.local");
  process.exit(2);
}
const pk = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
const account = privateKeyToAccount(pk);
const toAddress = toOverride ?? account.address;

const chain = defineChain({
  id: cfg.chainId,
  name: cfg.name,
  nativeCurrency: { name: "SoSoValue", symbol: "SOSO", decimals: 18 },
  rpcUrls: { default: { http: [cfg.rpc] } },
  blockExplorers: { default: { name: "Explorer", url: cfg.explorer } },
});

const publicClient = createPublicClient({ chain, transport: http(cfg.rpc) });
const wallet = createWalletClient({ account, chain, transport: http(cfg.rpc) });

const [balance, nonce, gasPrice] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.getTransactionCount({ address: account.address }),
  publicClient.getGasPrice(),
]);

console.log(`network:  ${network} (chainId ${cfg.chainId})`);
console.log(`from:     ${account.address}`);
console.log(`to:       ${toAddress}${toAddress === account.address ? "  (self)" : ""}`);
console.log(`value:    ${formatEther(valueWei)} SOSO`);
console.log(`balance:  ${formatEther(balance)} SOSO`);
console.log(`nonce:    ${nonce}`);
console.log(`gasPrice: ${gasPrice} wei`);
console.log();

if (dryRun) {
  // Estimate the call without broadcasting.
  try {
    const gas = await publicClient.estimateGas({
      account: account.address,
      to: toAddress,
      value: valueWei,
    });
    console.log(`estimated gas: ${gas}  (cost ≈ ${formatEther(gas * gasPrice)} SOSO)`);
    console.log("DRY RUN — no broadcast. Drop --dry-run to actually send.");
  } catch (err) {
    console.log("estimateGas failed:", err.shortMessage ?? err.message);
    process.exit(1);
  }
  process.exit(0);
}

if (balance === 0n) {
  console.log("✗ Cannot broadcast: wallet has 0 SOSO. See sodex-l1-readiness.mjs for the faucet hint.");
  process.exit(1);
}

try {
  console.log("→ Broadcasting…");
  const hash = await wallet.sendTransaction({ to: toAddress, value: valueWei });
  console.log(`tx hash:  ${hash}`);
  console.log(`explorer: ${cfg.explorer}/tx/${hash}`);
  console.log("→ Waiting for receipt (timeout 60s)…");
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  console.log(`status:   ${receipt.status}`);
  console.log(`block:    ${receipt.blockNumber}`);
  console.log(`gasUsed:  ${receipt.gasUsed}`);
  console.log(`effGas:   ${receipt.effectiveGasPrice} wei`);
  console.log(`feePaid:  ${formatEther(receipt.gasUsed * receipt.effectiveGasPrice)} SOSO`);
  console.log();
  console.log(receipt.status === "success"
    ? "✓ REAL L1 TRANSACTION CONFIRMED ON-CHAIN"
    : "✗ Tx reverted on chain — check receipt above");
} catch (err) {
  console.error("ERROR:", err.shortMessage ?? err.message ?? err);
  process.exit(1);
}
