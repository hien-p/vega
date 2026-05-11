import { NextRequest, NextResponse } from "next/server";
import { sosovalue, SoSoValueError } from "@/lib/sosovalue";

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "BTC").toUpperCase();
  const countryCode = (
    req.nextUrl.searchParams.get("country_code") ?? "US"
  ).toUpperCase();

  try {
    const [etfs, summaryHistory] = await Promise.all([
      sosovalue.etfs({ symbol, countryCode }).catch((err) => {
        console.error("[sosovalue.etfs]", err);
        return null;
      }),
      sosovalue.etfSummaryHistory({ symbol, countryCode }).catch((err) => {
        console.error("[sosovalue.etfSummaryHistory]", err);
        return null;
      }),
    ]);
    return NextResponse.json({ symbol, countryCode, etfs, summaryHistory });
  } catch (err) {
    if (err instanceof SoSoValueError) {
      return NextResponse.json(
        { error: err.message, body: err.body },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
