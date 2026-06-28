import { NextResponse } from "next/server";

/**
 * Hard 404 for unregistered / invalid wildcard storefront hosts.
 * Emits both HTML robots meta and X-Robots-Tag for crawlers.
 */
export function buildUnknownStorefrontResponse() {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="robots" content="noindex,nofollow" />
  <title>404 — Otofine</title>
</head>
<body>
  <h1>Không tìm thấy cửa hàng</h1>
</body>
</html>`;

  return new NextResponse(html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
    },
  });
}
