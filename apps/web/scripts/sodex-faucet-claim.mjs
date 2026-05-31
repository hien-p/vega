/**
 * Claim daily vUSDC from the SoDEX testnet faucet, programmatically.
 *
 * Discovered by inspecting the testnet.sodex.com JS bundle:
 *   POST https://testnet.sodex.dev/faucet/api/claim   body: { address }
 *
 * No wallet signature required for this endpoint — only the EVM address.
 * The operator broadcasts the actual L1 transaction itself (we observed
 * tx 0x1e3b48ec…cf1 at block 8545071 the first time we called it, with
 * a Transfer event from the operator wallet through a bridge contract to
 * credit our SoDEX account inside the engine). 100 vUSDC per call,
 * once per address per day. Second call returns
 *   {"code":1,"msg":"Already claimed","data":null}  with HTTP 403.
 *
 * Critically this does NOT drop native SOSO to our wallet on L1, so it
 * does not unblock the L1 self-transfer script. Per SoSoValue docs,
 * native SOSO testnet gas is earned through tasks/points on
 * testnet.sodex.com, not via this public faucet.
 *
 * Usage from apps/web/:
 *   node --env-file=.env.local scripts/sodex-faucet-claim.mjs
 *   node --env-file=.env.local scripts/sodex-faucet-claim.mjs --address 0x…
 */

import { privateKeyToAccount } from "viem/accounts";

const FAUCET_URL = "https://testnet.sodex.dev/faucet/api/claim";
const SPOT_BASE = "https://testnet-gw.sodex.dev/api/v1/spot";
const L1_RPC = "https://testnet-rpc.valuechain.xyz";
const L1_EXPLORER = "https://test-scan.valuechain.xyz";

const args = process.argv.slice(2);
const explicitAddr = (() => {
  const i = args.indexOf("--address");
  return i >= 0 ? args[i + 1] : null;
})();

let address = explicitAddr;
if (!address) {
  const raw = process.env.SODEX_TESTNET_PRIVATE_KEY;
  if (!raw) throw new Error("Set SODEX_TESTNET_PRIVATE_KEY in .env.local, or pass --address");
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`).toLowerCase();
  address = privateKeyToAccount(pk).address;
}

console.log(`address: ${address}`);
console.log();

// Before snapshot
const before = await (await fetch(`${SPOT_BASE}/accounts/${address}/state`)).json();
const beforeUsdc = before?.data?.B?.find((b) => b.a === "vUSDC")?.t ?? "0";
console.log(`engine vUSDC before: ${beforeUsdc}`);

// Claim
console.log("→ POST /faucet/api/claim …");
const res = await fetch(FAUCET_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ address }),
});
const body = await res.json().catch(() => null);
console.log(`  HTTP ${res.status}: ${JSON.stringify(body)}`);

if (res.ok && body?.code === 0 && typeof body.data === "string") {
  const txHash = body.data;
  console.log(`  L1 tx hash: ${txHash}`);
  console.log(`  explorer:   ${L1_EXPLORER}/tx/${txHash}`);

  // Confirm on L1
  console.log("→ confirming on L1 …");
  for (let i = 0; i < 6; i++) {
    const r = await fetch(L1_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [txHash],
        id: 1,
      }),
    });
    const rj = await r.json();
    if (rj.result) {
      const r2 = rj.result;
      console.log(`  block ${Number(r2.blockNumber)} · status ${r2.status} · gas ${Number(r2.gasUsed)} · logs ${r2.logs.length}`);
      break;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
} else if (body?.msg === "Already claimed") {
  console.log("  (already claimed today — engine balance unchanged)");
} else {
  console.log("  unexpected response — see body above");
  process.exit(1);
}

console.log();
const after = await (await fetch(`${SPOT_BASE}/accounts/${address}/state`)).json();
const afterUsdc = after?.data?.B?.find((b) => b.a === "vUSDC")?.t ?? "0";
console.log(`engine vUSDC after:  ${afterUsdc}  (delta ${Number(afterUsdc) - Number(beforeUsdc)})`);
console.log();
console.log("Note: this faucet credits SoDEX engine vUSDC only.");
console.log("Native SOSO testnet gas is task-gated (testnet.sodex.com → Points).");
