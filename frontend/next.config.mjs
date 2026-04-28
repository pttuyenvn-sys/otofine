import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Express backend (server-side rewrite only; not exposed to the browser). */
const backendOrigin = (
  process.env.API_INTERNAL_ORIGIN ||
  process.env.API_PROXY_TARGET ||
  "http://127.0.0.1:5000"
)
  .replace(/\/$/, "")
  .replace(/\/api\/?$/i, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
        permanent: false,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [40, 64, 96, 128, 132, 160, 256],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    /** Next.js 16+: cần khai báo tất cả quality dùng trên <Image> */
    qualities: [60, 75, 80, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.otofine.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
    ],
  },
};

export default nextConfig;
