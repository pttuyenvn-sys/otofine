import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gone = () =>
  NextResponse.json(
    {
      ok: false,
      error: "removed",
      message:
        "Legacy Next.js SEO registry endpoints are retired. Use MySQL seo_routes / seo_page_cache and backend GET /api/seo-page/:slug.",
    },
    { status: 410 },
  );

export async function GET() {
  return gone();
}
