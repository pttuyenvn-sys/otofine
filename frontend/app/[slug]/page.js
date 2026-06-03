import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { notFound, permanentRedirect } from "next/navigation";

import { getVehicleSeoPage } from "@/lib/seo/getVehicleSeoPage";
import { getProductDetailCached } from "@/lib/product/getProductDetailCached";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import {
  buildProductSeoUrl,
  extractProductIdFromSeoSlug,
  looksLikeProductSlug,
} from "@/lib/seo/productSeoUrl";
import { isMarketplaceListingSlug } from "@/lib/marketplace/isMarketplaceListingSlug";
import { buildServerCanonicalProductPath } from "@/lib/marketplace/serverCanonicalSlug";

import ProductDetail from "@/components/pages/ProductDetail";
import ProductJsonLd from "@/components/seo/ProductJsonLd";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const homeLoading = (
  <div
    className="home-page-loading"
    aria-busy="true"
    aria-label="Đang tải"
  >
    <div className="home-page-loading__bar" />

    <div className="home-page-loading__bar home-page-loading__bar--short" />

    <div className="home-page-loading__grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="home-page-loading__card"
        />
      ))}
    </div>
  </div>
);

const Home = nextDynamic(
  () => import("@/components/pages/Home"),
  {
    ssr: true,
    loading: () => homeLoading,
  }
);

/* ─────────────────────────────────────────────────────────────────
 * Product-detail branch
 *
 * The apex `[slug]` route is shared with category SEO pages, vehicle
 * SEO landings, CMS slugs, etc. Product detail URLs (root-level
 * canonical /<slug>-<productId>) get a deterministic two-step
 * detection here:
 *
 *   1. Fast pure-string discriminator (`looksLikeProductSlug`)
 *      rejects obvious SEO landings BEFORE any DB call so existing
 *      vehicle / category pages stay zero-overhead.
 *
 *   2. If the discriminator passes, attempt a product fetch by the
 *      trailing numeric id. If the product exists, render it (with
 *      canonical-enforcement redirect). If it doesn't, fall through
 *      to the existing SEO landing logic — false positives self-heal
 *      with a single failed cached fetch, then normal SEO render.
 *
 * No backend / API contract change. The fetch is the same cached
 * `/api/product/:id` call the previous `/phu-tung/[slug]` page used.
 * ───────────────────────────────────────────────────────────────── */

async function tryRenderProduct(slug) {
  if (!looksLikeProductSlug(slug)) return null;
  const id = extractProductIdFromSeoSlug(slug);
  if (id == null) return null;
  const data = await getProductDetailCached(id);
  if (!data?.product) return null;
  return { id, data };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;

  // Marketplace listing URLs must never enter product lookup / canonical logic.
  if (!isMarketplaceListingSlug(slug)) {
    // Product first — only when the discriminator + DB lookup confirm
    // the slug is a real product. Otherwise fall through to the
    // existing vehicle-SEO metadata path.
    const productMatch = await tryRenderProduct(slug);
    if (productMatch) {
      const p = productMatch.data.product;
      const cars = productMatch.data.cars;
      const titleBase = stripHtml(p.shortDescription || p.partName) || "Sản phẩm";
      const title = `${titleBase} | Otofine`;
      const desc = `Mua ${titleBase} — mã ${p.partNumber || ""}. Xem giá và liên hệ cửa hàng trên Otofine.`;
      const canonical = absoluteUrl(buildProductSeoUrl({ ...p, cars }));
      return {
        title,
        description: desc.slice(0, 320),
        alternates: { canonical },
        robots: { index: true, follow: true },
        openGraph: {
          title,
          description: desc.slice(0, 200),
          url: canonical,
          siteName: "Otofine",
          locale: "vi_VN",
          type: "website",
          images: p.image ? [{ url: p.image }] : [{ url: "/logo.png" }],
        },
      };
    }
  }

  const vehicleSeo = await getVehicleSeoPage(slug);
  if (!vehicleSeo) {
    return {};
  }

  const title =
    vehicleSeo?.seoContent?.custom_title ||
    `${vehicleSeo.parsed.brand} ${vehicleSeo.parsed.model}`;

  const description =
    vehicleSeo?.seoContent?.custom_intro
      ?.replace(/<[^>]+>/g, "")
      ?.slice(0, 160) || title;

  return {
    title,

    description,

    alternates: {
      canonical: `https://otofine.com/${slug}`,
    },

    openGraph: {
      title,
      description,
      url: `https://otofine.com/${slug}`,
    },
  };
}

function stripHtml(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function SlugHomePage({
  params,
  searchParams,
}) {
  const { slug } = await params;
  const query = await searchParams;

  // Marketplace listing URLs must reach Home.jsx / parseUrlState() untouched.
  if (!isMarketplaceListingSlug(slug)) {
    // ─── Product-detail branch ──────────────────────────────────────
    const productMatch = await tryRenderProduct(slug);
    if (productMatch) {
      const canonicalPath = buildServerCanonicalProductPath(
        productMatch.data.product,
        productMatch.data.cars,
        query,
      );
      const requestedPath = `/${slug}`;
      if (requestedPath !== canonicalPath.split("?")[0]) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[CanonicalRedirect]", {
            productId: productMatch.data.product.id,
            requestedPath,
            canonicalPath,
            marketplaceQuery: query || null,
          });
        }
        permanentRedirect(canonicalPath);
      }
      return (
        <>
          <ProductJsonLd data={productMatch.data} />
          <Suspense fallback={homeLoading}>
            <ProductDetail productId={productMatch.data.product.id} />
          </Suspense>
        </>
      );
    }
  }

  // ─── Existing SEO / vehicle landing branch (unchanged) ──────────
  const vehicleSeo = await getVehicleSeoPage(slug);

  return (
    <Suspense fallback={homeLoading}>
      <Home
        premiumArticle={
          vehicleSeo
            ? {
              route: {
                h1:
                  vehicleSeo?.seoContent?.custom_h1 ||
                  `Phụ tùng ${vehicleSeo?.parsed?.brand || ""} ${vehicleSeo?.parsed?.model || ""} ${vehicleSeo?.parsed?.year || ""} ${vehicleSeo?.parsed?.locationName ? `tại ${vehicleSeo.parsed.locationName}` : ""}`.trim(),
              },

              seoContent:
                vehicleSeo?.seoContent || {},
              products:
                vehicleSeo?.products || [],

              faq_json:
                vehicleSeo?.seoContent?.custom_faq_json || null,

              context: {
                parsed:
                  vehicleSeo?.parsed || null,

                carModel:
                  vehicleSeo?.carModel || null,

                specs:
                  vehicleSeo?.specs || null,

                faults:
                  vehicleSeo?.faults || [],

                maintenance:
                  vehicleSeo?.maintenance || [],

                relatedCars:
                  vehicleSeo?.relatedCars || [],
              },
            }
            : null
        }

        initialVehicleFilter={vehicleSeo}
      />
    </Suspense>
  );
}
