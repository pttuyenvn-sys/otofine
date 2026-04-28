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
        "Legacy SEO AI factory queue on Next.js is retired. Content is composed server-side into seo_page_cache.",
    },
    { status: 410 },
  );

export async function POST() {
  return gone();
}
