const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:5000/api";

export async function getVehicleSeoPage(slug) {
    let apiSlug = slug;

    // Strip public SEO prefixes → apex API slug (toyota-vios)
    if (apiSlug.startsWith("phu-tung-o-to-")) {
        apiSlug = apiSlug.slice("phu-tung-o-to-".length);
    } else if (apiSlug.startsWith("phu-tung-")) {
        apiSlug = apiSlug.slice("phu-tung-".length);
    }

    const res = await fetch(
        `${API_BASE}/vehicle-seo/${encodeURIComponent(apiSlug)}`,
        {
            next: {
                revalidate: 3600,
            },
        }
    );

    if (!res.ok) {
        return null;
    }

    return res.json();
}