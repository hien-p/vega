import { NextRequest, NextResponse } from "next/server";
import { sosovalue, SoSoValueError } from "@/lib/sosovalue";

export async function GET(req: NextRequest) {
  const pageNum = Number(
    req.nextUrl.searchParams.get("pageNum") ??
      req.nextUrl.searchParams.get("page") ??
      "1",
  );
  const pageSize = Number(
    req.nextUrl.searchParams.get("pageSize") ??
      req.nextUrl.searchParams.get("page_size") ??
      "20",
  );
  const language = req.nextUrl.searchParams.get("language") ?? undefined;

  try {
    const data = await sosovalue.featuredNews({ pageNum, pageSize, language });
    return NextResponse.json(data);
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
