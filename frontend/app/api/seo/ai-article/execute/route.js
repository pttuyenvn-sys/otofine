import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const gone = () =>
  NextResponse.json(
    {
      ok: false,
      error: "removed",
      message:
        "Legacy SEO AI execute endpoint is retired. Use backend seo composer / rebuild:seo-cache.",
    },
    { status: 410 },
  );

export async function POST() {
  return gone();
}
