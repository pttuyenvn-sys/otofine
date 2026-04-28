import { NextResponse } from "next/server";

/** /product không có id → về trang chủ (tránh bị app/[slug] coi là landing SEO). */
export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname === "/product" || pathname === "/product/") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/product", "/product/"],
};
