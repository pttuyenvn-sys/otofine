import { isDiscoveryCategoryBrandVehicleEnabled } from "@/lib/discovery/discoveryCategoryBrandVehicleConfig";
import { loadCategoryBrandDiscoveryVehicleLinks } from "@/lib/discovery/loadCategoryBrandDiscoveryVehicleLinks.server";

/**
 * Server-rendered vehicle discovery nav on category × brand pages.
 * Hidden from visual layout (sr-only); crawlable <a href> for Googlebot.
 */
export default async function CategoryBrandDiscoveryVehicleNav({
  categoryName,
  canonicalSlug,
  brand,
}) {
  if (!isDiscoveryCategoryBrandVehicleEnabled()) {
    return null;
  }

  const links = await loadCategoryBrandDiscoveryVehicleLinks({
    categoryName,
    canonicalSlug,
    brand,
  });
  if (!links.length) {
    return null;
  }

  return (
    <nav
      className="sr-only"
      aria-label={`Dòng xe phổ biến — ${categoryName} ${brand}`}
    >
      <ul>
        {links.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
