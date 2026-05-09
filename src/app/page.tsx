import { ConnectWallet } from "@/components/connect-wallet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sosodex</h1>
          <p className="text-muted-foreground text-sm">
            On-chain finance, one person.
          </p>
        </div>
        <ConnectWallet />
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SoSoValue API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Server proxies live at{" "}
              <code className="rounded bg-muted px-1">/api/sosovalue/*</code>.
            </p>
            <div className="flex gap-2">
              <Badge variant="secondary">/etf</Badge>
              <Badge variant="secondary">/news?currency=BTC</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wallet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            wagmi + viem + RainbowKit, multi-chain (Mainnet, Base, Arbitrum,
            Optimism, Polygon).
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next steps</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add SOSOVALUE_API_KEY to <code>.env.local</code>, then build the
            feature set the hackathon judges want to see.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
