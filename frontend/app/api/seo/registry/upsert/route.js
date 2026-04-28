import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gone = () =>
  NextResponse.json(
    {
      ok: false,
      error: "removed",
      message:
        "Legacy Next.js SEO registry upsert is retired. Use seo_routes and seo cache rebuild on the backend.",
    },
    { status: 410 },
  );

export async function POST() {
  return gone();
}
