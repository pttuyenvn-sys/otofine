import { Suspense } from "react";
import nextDynamic from "next/dynamic";

import { getVehicleSeoPage } from "@/lib/seo/getVehicleSeoPage";

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

export async function generateMetadata({
  params,
}) {
  const { slug } = await params;

  const vehicleSeo =
    await getVehicleSeoPage(slug);

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

export default async function SlugHomePage({
  params,
}) {
  const { slug } = await params;

  const vehicleSeo =
    await getVehicleSeoPage(slug);

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