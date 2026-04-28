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
        "Legacy nightly SEO AI cron route is retired. Run backend cache rebuild scripts or pipelines instead.",
    },
    { status: 410 },
  );

export async function GET() {
  return gone();
}
