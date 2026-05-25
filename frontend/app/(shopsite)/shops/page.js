import { Suspense } from "react";
import {
  fetchPublicShopBrandsSafe,
  fetchPublicShopDirectorySafe,
  fetchPublicShopProvincesSafe,
} from "@/services/shopPublic.service";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import ShopCard from "@/components/shopsite/ShopCard";
import ShopDirectoryFilters from "@/components/shopsite/ShopDirectoryFilters";

/**
 * Phase 7.1 — public shop directory.
 *
 * Apex route: https://otofine.com/shops
 *
 * SEO contract:
 *   - canonical: https://otofine.com/shops  (no query string — so
 *     filtered variants don't fragment search authority).
 *   - robots: index, follow (this page IS the public discovery surface;
 *     unlike storefronts, it should be indexable).
 *   - JSON-LD: ItemList with the visible cards (helps rich results).
 *
 * Performance contract:
 *   - SSR everything; the filters island is the only client component.
 *   - 3 parallel backend fetches (directory + provinces + brands),
 *     all *Safe so the page never breaks on a transient backend hiccup.
 *
 * IMPORTANT: this page is `dynamic = "force-dynamic"` because the
 * query-string filters are part of the result. Next would otherwise
 * try to statically render the unparam'd version and replay it for
 * every filter, which defeats the cache.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const sp = (await searchParams) || {};
  // We deliberately keep the canonical at /shops regardless of filters
  // so filtered views don't compete for ranking with the canonical
  // page. The page still renders the filtered list; we just tell
  // search engines "the canonical version is the unfiltered one."
  const canonical = absoluteUrl("/shops");
  const facets = [sp.brand, sp.province].filter(Boolean);
  const facetsLabel = facets.length ? ` · ${facets.join(" · ")}` : "";
  return {
    title: `Danh bạ shop phụ tùng ô tô${facetsLabel} | Otofine`,
    description:
      "Khám phá danh bạ các cửa hàng phụ tùng ô tô đáng tin cậy trên Otofine. Lọc theo hãng xe, tỉnh thành, mức độ xác minh.",
    alternates: { canonical },
    openGraph: {
      title: "Danh bạ shop phụ tùng ô tô | Otofine",
      description:
        "Tìm shop phụ tùng ô tô đúng hãng, đúng vùng — danh bạ supplier Otofine.",
      url: canonical,
      siteName: "Otofine",
      locale: "vi_VN",
      type: "website",
    },
    robots: { index: true, follow: true },
  };
}

export default async function ShopsDirectoryPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const q = typeof sp.q === "string" ? sp.q : "";
  const brand = typeof sp.brand === "string" ? sp.brand : "";
  const province =
    typeof sp.province === "string" ? sp.province : typeof sp.provinceSlug === "string" ? sp.provinceSlug : "";
  const verified = sp.verified === "true";
  const tier = typeof sp.tier === "string" ? sp.tier : "";
  const sort = typeof sp.sort === "string" ? sp.sort : "rank";
  const page = Math.max(1, Number(sp.page) || 1);

  const [directory, provincesPayload, brandsPayload] = await Promise.all([
    fetchPublicShopDirectorySafe({
      q,
      brand,
      provinceSlug: province,
      verified: verified ? "true" : "",
      tier,
      sort,
      page,
      perPage: 12,
    }),
    fetchPublicShopProvincesSafe(),
    fetchPublicShopBrandsSafe(),
  ]);

  const items = directory?.items || [];
  const total = directory?.total || 0;
  const perPage = directory?.perPage || 12;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = directory?.page || page;

  const jsonLd = buildItemListJsonLd(items);

  return (
    <div className="space-y-3">
      <header className="bg-white rounded-2xl shadow-sm p-4 sm:p-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Danh bạ shop phụ tùng ô tô
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Khám phá các cửa hàng phụ tùng ô tô đáng tin cậy trên Otofine. Lọc
          theo hãng xe, tỉnh thành, và mức độ xác minh.
        </p>
      </header>

      <Suspense fallback={<div className="bg-white rounded-2xl shadow-sm h-[160px] animate-pulse" />}>
        <ShopDirectoryFilters
          provinces={provincesPayload?.items || []}
          brands={brandsPayload?.items || []}
          total={total}
        />
      </Suspense>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <section
          aria-label="Danh sách shop"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-7"
        >
          {items.map((shop) => (
            <ShopCard
              key={shop.slug}
              shop={shop}
              listSource="directory"
              trackImpression
              showRank
            />
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <DirectoryPagination
          currentPage={currentPage}
          totalPages={totalPages}
          searchParams={sp}
        />
      )}

      {/* JSON-LD must be in the body, not <head>, when it depends on
          SSR data — Next handles the placement automatically. */}
      {items.length > 0 && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
      <div className="text-base font-semibold text-gray-800">
        Không tìm thấy shop phù hợp
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Hãy thử bỏ bớt bộ lọc hoặc tìm kiếm với từ khoá khác.
      </p>
      <a
        href="/shops"
        className="mt-4 inline-flex items-center bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-semibold px-4 py-2 rounded-xl"
      >
        Xoá bộ lọc
      </a>
    </div>
  );
}

function DirectoryPagination({ currentPage, totalPages, searchParams }) {
  // We render plain anchor links (no client JS) so SEO crawlers can
  // discover paginated pages and SSR can pre-render them per URL.
  // The filter island uses router.push for instant nav; pagination
  // is a hard nav so the SSR cache key changes cleanly.
  const buildHref = (p) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams || {})) {
      if (v == null || v === "") continue;
      // Search params may be string OR string[] in App Router; flatten.
      const val = Array.isArray(v) ? v[0] : v;
      next.set(k, String(val));
    }
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    const qs = next.toString();
    return `/shops${qs ? `?${qs}` : ""}`;
  };

  return (
    <nav
      aria-label="Phân trang"
      className="bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between gap-2"
    >
      <a
        href={currentPage > 1 ? buildHref(currentPage - 1) : "#"}
        aria-disabled={currentPage <= 1}
        className={`text-sm px-3 py-1.5 rounded-lg ${
          currentPage > 1
            ? "text-gray-700 hover:bg-gray-100"
            : "text-gray-300 pointer-events-none"
        }`}
      >
        ← Trước
      </a>
      <span className="text-sm text-gray-600 tabular-nums">
        Trang {currentPage}/{totalPages}
      </span>
      <a
        href={currentPage < totalPages ? buildHref(currentPage + 1) : "#"}
        aria-disabled={currentPage >= totalPages}
        className={`text-sm px-3 py-1.5 rounded-lg ${
          currentPage < totalPages
            ? "text-gray-700 hover:bg-gray-100"
            : "text-gray-300 pointer-events-none"
        }`}
      >
        Sau →
      </a>
    </nav>
  );
}

/**
 * JSON-LD ItemList schema for the visible cards. Helps Google show
 * a richer SERP for the directory page. Each entry points to the
 * apex `/shops/<slug>` URL.
 */
function buildItemListJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Danh bạ shop phụ tùng ô tô Otofine",
    numberOfItems: items.length,
    itemListElement: items.map((shop, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/shops/${encodeURIComponent(shop.slug)}`),
      name: shop.name,
    })),
  };
}
