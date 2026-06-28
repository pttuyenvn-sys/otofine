import { notFound } from "next/navigation";
import ShopSeoListingView from "@/components/shopsite/ShopSeoListingView";
import {
  generateShopSeoListingMetadata,
  loadShopSeoPageData,
} from "@/lib/shopsite/loadShopSeoPageData";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";

function segmentsToSubPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return SHOP_COLLECTION_PATH;
  }
  return `/${path.join("/")}`;
}

export async function generateMetadata({ params }) {
  const { slug, path } = await params;
  return generateShopSeoListingMetadata(slug, segmentsToSubPath(path));
}

export default async function ShopSeoLandingPage({ params, searchParams }) {
  const { slug, path } = await params;
  const search = (await searchParams) || {};
  const subPath = segmentsToSubPath(path);

  const data = await loadShopSeoPageData(slug, subPath, search);
  if (!data?.shop) notFound();

  return (
    <ShopSeoListingView
      {...data}
      slug={slug}
      subPath={subPath}
    />
  );
}
