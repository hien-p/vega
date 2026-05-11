import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// `defineCloudflareConfig` strips top-level fields like `buildCommand` —
// we re-attach it so OpenNext invokes the webpack build script. Turbopack
// has a root-inference bug in monorepo + standalone mode (Next 16).
const base = defineCloudflareConfig({});

export default {
  ...base,
  buildCommand: "pnpm build:cf",
};
