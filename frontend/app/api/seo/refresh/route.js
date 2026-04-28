import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gone = () =>
  NextResponse.json(
    {
      ok: false,
      error: "removed",
      message:
        "Legacy template SEO file cache refresh is retired. SEO HTML lives in seo_page_cache (MySQL).",
    },
    { status: 410 },
  );

export async function POST() {
  return gone();
}
