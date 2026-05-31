/**
 * Pre-flight check for sending any ValueChain L1 transaction from our
 * wallet. Reports balance, nonce, chain id, latest block, and whether
 * the wallet has enough native SOSO to cover one self-transfer's gas.
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-l1-readiness.mjs
 *   node --env-file=.env.local scripts/sodex-l1-readiness.mjs --network mainnet
 *
 * Exits 0 if ready (balance > estimated gas), 1 otherwise. The script
 * never broadcasts anything itself; pair it with sodex-l1-self-transfer
 * once it reports OK.
 */

import { createPublicClient, http, formatEther, parseGwei } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const NETWORKS = {
  testnet: {
    rpc: "https://testnet-rpc.valuechain.xyz",
    chainId: 138565,
    explorer: "https://test-scan.valuechain.xyz",
    faucetHint:
      "https://testnet.sodex.com/faucet (USDC is daily; SOSO gas is earned via testnet tasks/points)",
  },
  mainnet: {
    rpc: "https://rpc.valuechain.xyz",
    chainId: 286623,
    explorer: "https://main-scan.valuechain.xyz",
    faucetHint: "(mainnet has no faucet)",
  },
};

const args = process.argv.slice(2);
const network = (() => {
  const i = args.indexOf("--network");
  return i >= 0 ? args[i + 1] : "testnet";
})();
const cfg = NETWORKS[network];
if (!cfg) {
  console.error(`Unknown network "${network}". Use testnet|mainnet.`);
  process.exit(2);
}

const raw = process.env.SODEX_TESTNET_PRIVATE_KEY;
if (!raw) {
  console.error("ERROR: Set SODEX_TESTNET_PRIVATE_KEY in .env.local");
  process.exit(2);
}
const pk = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
const account = privateKeyToAccount(pk);

const client = createPublicClient({ transport: http(cfg.rpc) });

const [chainId, blockNumber, balance, nonce, gasPrice] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
  client.getBalance({ address: account.address }),
  client.getTransactionCount({ address: account.address }),
  client.getGasPrice().catch(() => parseGwei("1")),
]);

// A bare self-transfer is 21000 gas. Add 10% headroom for client overhead.
const gasNeeded = 21000n * gasPrice;
const headroom = (gasNeeded * 110n) / 100n;
const surplus = balance - headroom;

console.log("ValueChain L1 readiness check");
console.log("──────────────────────────────");
console.log(`network:        ${network}`);
console.log(`rpc:            ${cfg.rpc}`);
console.log(`expected chain: ${cfg.chainId}`);
console.log(`reported chain: ${chainId}  ${chainId === cfg.chainId ? "✓" : "✗ MISMATCH"}`);
console.log(`latest block:   ${blockNumber}`);
console.log();
console.log(`wallet:         ${account.address}`);
console.log(`balance:        ${formatEther(balance)} SOSO  (${balance} wei)`);
console.log(`nonce (tx#):    ${nonce}`);
console.log();
console.log(`gas price:      ${formatEther(gasPrice * 1_000_000_000n)} SOSO/Mgas  (${gasPrice} wei/gas)`);
console.log(`self-tx needs:  ~${formatEther(gasNeeded)} SOSO  (21000 * gasPrice, no headroom)`);
console.log(`with 10% pad:   ~${formatEther(headroom)} SOSO`);
console.log();

if (balance === 0n) {
  console.log("✗ Wallet has zero native SOSO. Cannot broadcast any L1 transaction.");
  console.log(`  Acquire gas: ${cfg.faucetHint}`);
  process.exit(1);
}
if (surplus < 0n) {
  console.log(`✗ Balance below estimated gas cost (short ${formatEther(-surplus)} SOSO).`);
  console.log(`  Top up: ${cfg.faucetHint}`);
  process.exit(1);
}
console.log(`✓ Ready to broadcast. Surplus after self-tx ≈ ${formatEther(surplus)} SOSO.`);
console.log(`  Next: node --env-file=.env.local scripts/sodex-l1-self-transfer.mjs`);
