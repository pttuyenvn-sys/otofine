import { isDiscoveryCategoryBrandEnabled } from "@/lib/discovery/discoveryCategoryBrandConfig";
import { loadCategoryDiscoveryBrandLinks } from "@/lib/discovery/loadCategoryDiscoveryBrandLinks.server";

/**
 * Server-rendered brand discovery nav on pure category pages.
 * Hidden from visual layout (sr-only); crawlable <a href> for Googlebot.
 */
export default async function CategoryDiscoveryBrandNav({
  categoryName,
  canonicalSlug,
}) {
  if (!isDiscoveryCategoryBrandEnabled()) {
    return null;
  }

  const links = await loadCategoryDiscoveryBrandLinks({
    categoryName,
    canonicalSlug,
  });
  if (!links.length) {
    return null;
  }

  return (
    <nav
      className="sr-only"
      aria-label={`Thương hiệu phổ biến — ${categoryName}`}
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
