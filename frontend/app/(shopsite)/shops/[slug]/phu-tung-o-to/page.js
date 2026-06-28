import { notFound } from "next/navigation";
import ShopSeoListingView from "@/components/shopsite/ShopSeoListingView";
import {
  generateShopSeoListingMetadata,
  loadShopSeoPageData,
} from "@/lib/shopsite/loadShopSeoPageData";
import { SHOP_COLLECTION_PATH } from "@/lib/shopseo/namespace.js";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return generateShopSeoListingMetadata(slug, SHOP_COLLECTION_PATH);
}

export default async function ShopCollectionPage({ params, searchParams }) {
  const { slug } = await params;
  const search = (await searchParams) || {};
  const data = await loadShopSeoPageData(slug, SHOP_COLLECTION_PATH, search);
  if (!data?.shop) notFound();

  return (
    <ShopSeoListingView
      {...data}
      slug={slug}
      subPath={SHOP_COLLECTION_PATH}
    />
  );
}
