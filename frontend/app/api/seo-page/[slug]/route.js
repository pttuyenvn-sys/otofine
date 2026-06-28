import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function internalApiBase() {
  const origin = (
    process.env.API_INTERNAL_ORIGIN ||
    process.env.API_PROXY_TARGET ||
    "http://127.0.0.1:5000"
  )
    .replace(/\/$/, "")
    .replace(/\/api\/?$/i, "");
  return `${origin}/api`;
}

/**
 * Same-origin shim for client seo-page lookup.
 * Missing CMS articles return 200 { found: false } so the browser
 * does not log cross-origin 404 noise; Home keeps dynamic fallback.
 */
export async function GET(_request, { params }) {
  const { slug } = await params;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  const url = `${internalApiBase()}/seo-page/${encodeURIComponent(s)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) {
      return NextResponse.json({ found: false }, { status: 200 });
    }
    if (!res.ok) {
      return NextResponse.json({ found: false }, { status: 200 });
    }
    const data = await res.json();
    const hasArticle = Boolean(
      data?.article_html || data?.seoContent?.articleHtml,
    );
    if (!hasArticle) {
      return NextResponse.json({ found: false }, { status: 200 });
    }
    return NextResponse.json({ found: true, data });
  } catch {
    return NextResponse.json({ found: false }, { status: 200 });
  }
}
