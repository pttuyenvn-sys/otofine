import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { notFound, permanentRedirect } from "next/navigation";

import { resolveSeoEntity } from "@/lib/seo/resolveSeoEntity";
import { resolveCategoryOwnerPath } from "@/lib/seo/buildCategoryOwnerPath";
import { resolveVehicleOwnerPath } from "@/lib/seo/buildVehicleOwnerPath";
import { absoluteUrl } from "@/lib/seo/siteUrl";
import { resolveProductJsonLdUrl } from "@/lib/seo/resolveProductJsonLdUrl";
import {
  buildProductSeoSlug,
} from "@/lib/seo/productSeoUrl";
import { buildPageTitle } from "@/components/pages/home/services/listingSeoState";
import { seoIdentityFromMarketplaceEntity } from "@/lib/listing/adapters/seoIdentityFromMarketplaceEntity";
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "@/lib/identity/buildProductIdentity";
import { buildListingRobotsMetadata } from "@/lib/seo/listingGovernanceRobots.server";
import { resolveListingYearRangeLinks } from "@/lib/seo/buildListingYearRangeLinks.server";

import CategoryBrandDiscoveryVehicleNav from "@/components/discovery/CategoryBrandDiscoveryVehicleNav.server";
import CategoryDiscoveryBrandNav from "@/components/discovery/CategoryDiscoveryBrandNav.server";
import ProductDetail from "@/components/pages/ProductDetail";
import ProductJsonLd from "@/components/seo/ProductJsonLd";
import { isCategoryBrandDiscoveryPage } from "@/lib/discovery/isCategoryBrandDiscoveryPage";
import { isPureCategoryDiscoveryPage } from "@/lib/discovery/isPureCategoryDiscoveryPage";

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

function listingTitleFromEntity(entity) {
  const requestSlug = String(entity?.requestSlug || "").trim().toLowerCase();
  const locationIndex = requestSlug.lastIndexOf("-tai-");
  const requestLocationSlug =
    locationIndex >= 0 ? requestSlug.slice(locationIndex + "-tai-".length) : "";
  const normalizeLocation = (name) => {
    const raw = String(name || "").trim();
    if (!raw) return "";
    if (requestLocationSlug.startsWith("tp-")) {
      return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
    }
    if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
    if (/^TP\s+/i.test(raw)) return raw.replace(/^TP\s+/i, "").trim();
    return raw;
  };

  if (entity?.kind === "vehicle") {
    const parsed = entity?.vehicleSeo?.parsed || {};
    const filters = entity?.landing?.filters || {};
    return buildPageTitle({
      categoryName: "",
      hasCategory: false,
      brand: parsed.brand || filters.brand || "",
      model: parsed.model || filters.model || "",
      year: parsed.year || filters.year || "",
      location: normalizeLocation(parsed.locationName || filters.location || ""),
    });
  }

  if (entity?.kind === "category") {
    const meta = entity?.categoryMeta || {};
    const filters = entity?.landing?.filters || {};
    const categoryName =
      meta.canonicalName ||
      meta.categoryName ||
      filters.category ||
      "";
    return buildPageTitle({
      categoryName,
      hasCategory: Boolean(String(categoryName || "").trim()),
      brand: meta.cbmBrand || filters.brand || "",
      model: meta.cbmModel || filters.model || "",
      year: meta.cbmYear || filters.year || "",
      location: normalizeLocation(meta.cbmLocation || filters.location || ""),
    });
  }

  return "";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entity = await resolveSeoEntity(slug);
  const listingEntity = { ...entity, requestSlug: slug };

  if (entity.kind === "product_not_found") {
    notFound();
  }

  if (entity.kind === "unknown") {
    return {
      robots: { index: false, follow: false },
    };
  }

  if (entity.kind === "product" && entity.productMatch) {
    const productData = entity.productMatch.data;
    const p = productData.product;
    const identity =
      productData.productIdentity ||
      buildProductIdentity(p, pickPrimaryFitment(productData.cars || []));
    const titleBase = identity.h1 || "Sản phẩm";
    const title = identity.seoTitle || `${titleBase} | Otofine`;
    const desc = `Mua ${titleBase} — mã ${p.partNumber || ""}. Xem giá và liên hệ cửa hàng trên Otofine.`;
    const canonical = identity.canonicalUrl || resolveProductJsonLdUrl(productData);
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

  if (entity.kind === "vehicle") {
    const seo = seoIdentityFromMarketplaceEntity(listingEntity, {
      siteName: "Otofine",
    });
    if (seo) {
      const canonical = absoluteUrl(seo.canonicalPath);
      const { robots } = await buildListingRobotsMetadata(listingEntity, slug);
      return {
        title: seo.title,
        description: seo.description,
        alternates: { canonical },
        robots,
        openGraph: {
          title: seo.title,
          description: seo.description,
          url: canonical,
        },
      };
    }
  }

  if (entity.kind === "category") {
    const seo = seoIdentityFromMarketplaceEntity(listingEntity, {
      siteName: "Otofine",
    });
    if (seo) {
      const canonical = absoluteUrl(seo.canonicalPath);
      const { robots } = await buildListingRobotsMetadata(listingEntity, slug);
      return {
        title: seo.title,
        description: seo.description,
        alternates: { canonical },
        robots,
        openGraph: {
          title: seo.title,
          description: seo.description,
          url: canonical,
        },
      };
    }
  }

  return {};
}

export default async function SlugHomePage({
  params,
}) {
  const { slug } = await params;
  const entity = await resolveSeoEntity(slug);

  if (entity.kind === "product_not_found" || entity.kind === "unknown") {
    notFound();
  }

  if (entity.kind === "product" && entity.productMatch) {
    const productData = entity.productMatch.data;
    const identity =
      productData.productIdentity ||
      buildProductIdentity(
        productData.product,
        pickPrimaryFitment(productData.cars || []),
      );
    const canonicalSlug = buildProductSeoSlug({
      id: productData.product.id,
      partName: productData.product.partName,
      partNumber: productData.product.partNumber,
      ...(pickPrimaryFitment(productData.cars || []) || {}),
    });
    const canonicalPath =
      identity.canonicalPath ||
      (canonicalSlug
        ? `/${canonicalSlug}-${productData.product.id}`
        : `/p/${productData.product.id}`);
    const requestedPath = `/${slug}`;
    if (requestedPath !== canonicalPath) {
      permanentRedirect(canonicalPath);
    }
    return (
      <>
        <ProductJsonLd data={entity.productMatch.data} />
        <ProductDetail productId={entity.productMatch.data.product.id} />
      </>
    );
  }

  if (entity.kind === "vehicle") {
    const requestedPath = `/${slug}`;
    const listingEntity = { ...entity, requestSlug: slug };
    const seo = seoIdentityFromMarketplaceEntity(listingEntity);
    if (seo?.canonicalPath && requestedPath !== seo.canonicalPath) {
      permanentRedirect(seo.canonicalPath);
    }
  }

  if (entity.kind === "category") {
    const requestedPath = `/${slug}`;
    const listingEntity = { ...entity, requestSlug: slug };
    const seo = seoIdentityFromMarketplaceEntity(listingEntity);
    if (seo?.canonicalPath && requestedPath !== seo.canonicalPath) {
      permanentRedirect(seo.canonicalPath);
    }
  }

  const vehicleSeo = entity.kind === "vehicle" ? entity.vehicleSeo : null;
  let initialListingFilters = entity?.landing?.filters || null;
  if (!initialListingFilters && entity.kind === "category" && entity.categoryMeta) {
    const meta = entity.categoryMeta;
    const categoryName = meta.canonicalName || meta.categoryName || "";
    initialListingFilters = {
      category: categoryName,
      brand: meta.cbmBrand || "",
      model: meta.cbmModel || "",
      year: meta.cbmYear || "",
      location: meta.cbmLocation || "",
    };
  }
  if (!initialListingFilters && entity.kind === "vehicle" && vehicleSeo?.parsed) {
    const parsed = vehicleSeo.parsed;
    const requestLocationSlug = String(slug || "")
      .trim()
      .toLowerCase()
      .split("-tai-")[1] || "";
    const normalizeLocation = (name = "") => {
      const raw = String(name || "").trim();
      if (!raw) return "";
      if (requestLocationSlug.startsWith("tp-")) {
        return /^TP Hồ Chí Minh$/i.test(raw) ? "TP Hồ Chí Minh" : raw;
      }
      if (/^TP Hồ Chí Minh$/i.test(raw)) return "TP Hồ Chí Minh";
      if (/^TP\\s+/i.test(raw)) return raw.replace(/^TP\\s+/i, "").trim();
      return raw;
    };
    initialListingFilters = {
      brand: parsed.brand || "",
      model: parsed.model || "",
      year: parsed.year || "",
      location: normalizeLocation(parsed.locationName || ""),
    };
  }

  const yearRangeLinks = await resolveListingYearRangeLinks(
    { ...entity, requestSlug: slug },
    slug,
  );

  const pureCategoryDiscovery = isPureCategoryDiscoveryPage(entity);
  const categoryBrandDiscovery = isCategoryBrandDiscoveryPage(entity);
  const categoryMeta = entity?.categoryMeta;

  return (
    <>
      {pureCategoryDiscovery && categoryMeta ? (
        <CategoryDiscoveryBrandNav
          categoryName={
            categoryMeta.canonicalName || categoryMeta.categoryName || ""
          }
          canonicalSlug={categoryMeta.canonicalSlug || ""}
        />
      ) : null}
      {categoryBrandDiscovery && categoryMeta ? (
        <CategoryBrandDiscoveryVehicleNav
          categoryName={
            categoryMeta.canonicalName || categoryMeta.categoryName || ""
          }
          canonicalSlug={categoryMeta.canonicalSlug || ""}
          brand={String(categoryMeta.cbmBrand || "").trim()}
        />
      ) : null}
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
        initialListingFilters={initialListingFilters}
        yearRangeLinks={yearRangeLinks}
      />
      </Suspense>
    </>
  );
}
