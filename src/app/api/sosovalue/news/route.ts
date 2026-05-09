import { NextRequest, NextResponse } from "next/server";
import { sosovalue, SoSoValueError } from "@/lib/sosovalue";

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? "BTC";
  try {
    const data = await sosovalue.featuredNews(currency);
    return NextResponse.json({ data });
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
