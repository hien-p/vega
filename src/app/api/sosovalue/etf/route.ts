import { NextResponse } from "next/server";
import { sosovalue, SoSoValueError } from "@/lib/sosovalue";

export async function GET() {
  try {
    const data = await sosovalue.etfOverview();
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
