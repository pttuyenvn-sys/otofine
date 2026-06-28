/**
 * ARCH-07.2 — Shared data loader for shop SEO listing pages.
 */

import { notFound } from "next/navigation";
import {
  fetchPublicShop,
  fetchPublicShopCategoriesSafe,
  fetchPublicShopFitmentsSafe,
  getShopBasePath,
  getShopSeoContext,
} from "@/services/shopPublic.service";
import { buildShopSeoPageMetadata } from "@/lib/shopseo/buildShopSeoMetadata.js";
import { buildShopSeoH1 } from "@/lib/shopseo/buildShopSeoH1.js";
import { normalizeShopCategorySlug } from "@/lib/shopseo/buildShopSeoPath.js";
import { normalizeSubPath } from "@/lib/shopseo/isShopSeoRewritePath.js";
import { resolveShopSeoEntity } from "@/lib/shopseo/resolveShopSeoEntity.js";
import { resolveStrictCountForEntity } from "@/lib/shopsite/resolveStrictCountForEntity.js";

const PER_PAGE = 20;

/**
 * @param {string} slug
 * @param {string} subPath
 * @param {Record<string, string | string[] | undefined>} [searchParams]
 */
export async function loadShopSeoPageData(slug, subPath, searchParams = {}) {
  const publicPath = normalizeSubPath(subPath);
  const page = Number(searchParams.page) > 0 ? Number(searchParams.page) : 1;

  const [shop, categoriesPayload, fitments] = await Promise.all([
    fetchPublicShop(slug),
    fetchPublicShopCategoriesSafe(slug),
    fetchPublicShopFitmentsSafe(slug),
  ]);

  if (!shop) notFound();

  const categories = (categoriesPayload?.items || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: normalizeShopCategorySlug(c.slug || c.name || String(c.id)),
    productCount: Number(c.productCount) || 0,
  })).filter((row) => Boolean(row.slug));

  const resolved = resolveShopSeoEntity({
    shopSlug: slug,
    subPath: publicPath,
    categories,
    fitments,
  });

  if (!resolved.entity) notFound();

  const productsPage = await resolveStrictCountForEntity({
    slug,
    entity: resolved.entity,
    page,
    perPage: PER_PAGE,
    q: searchParams.q || undefined,
    sort: searchParams.sort || "newest",
  });

  const total = Number(productsPage?.productCount) || 0;
  const entity = { ...resolved.entity, productCount: total };
  const h1 = buildShopSeoH1(entity);

  const basePath = await getShopBasePath(shop.slug);
  const categoriesBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  return {
    shop,
    slug,
    publicPath,
    entity,
    h1,
    basePath,
    categories,
    categoriesBySlug,
    fitments,
    productsPage,
    page,
    total,
    totalPages: productsPage?.totalPages || 1,
    items: productsPage?.products || [],
  };
}

/**
 * @param {string} slug
 * @param {string} subPath
 */
export async function generateShopSeoListingMetadata(slug, subPath) {
  const publicPath = normalizeSubPath(subPath);
  const [shop, categoriesPayload, fitments, seo] = await Promise.all([
    fetchPublicShop(slug).catch(() => null),
    fetchPublicShopCategoriesSafe(slug),
    fetchPublicShopFitmentsSafe(slug),
    getShopSeoContext(slug, publicPath.replace(/^\//, "")),
  ]);

  if (!shop) {
    return {
      title: "Shop không tồn tại — Otofine",
      robots: { index: false, follow: false },
    };
  }

  const categories = (categoriesPayload?.items || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: normalizeShopCategorySlug(c.slug || c.name || String(c.id)),
  })).filter((row) => Boolean(row.slug));

  const resolved = resolveShopSeoEntity({
    shopSlug: slug,
    subPath: publicPath,
    categories,
    fitments,
  });

  if (!resolved.entity) {
    return {
      title: "Không tìm thấy — Otofine Shop",
      robots: { index: false, follow: false },
    };
  }

  const counts = await resolveStrictCountForEntity({
    slug,
    entity: resolved.entity,
    page: 1,
    perPage: 1,
  });
  const productCount = counts.productCount;

  return buildShopSeoPageMetadata({
    shop,
    entity: { ...resolved.entity, productCount },
    canonical: seo.canonical,
    apexDiscoveryMirror: seo.apexDiscoveryMirror,
    shopName: shop.name,
  });
}
