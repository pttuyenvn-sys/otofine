const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:5000/api";

export async function getVehicleSeoPage(slug) {
    let apiSlug = slug;

    // 🔥 strip prefix public SEO
    if (apiSlug.startsWith("phu-tung-")) {
        apiSlug = apiSlug.replace(
            /^phu-tung-/,
            ""
        );
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