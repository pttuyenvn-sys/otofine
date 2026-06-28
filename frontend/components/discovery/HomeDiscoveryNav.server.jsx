import { isDiscoveryNavEnabled } from "@/lib/discovery/discoveryNavConfig";
import { loadTopDiscoveryCategoryLinks } from "@/lib/discovery/loadTopDiscoveryCategoryLinks.server";

/**
 * Server-rendered homepage discovery nav (categories only).
 * Hidden from visual layout (sr-only); crawlable <a href> for Googlebot.
 */
export default async function HomeDiscoveryNav() {
  if (!isDiscoveryNavEnabled()) {
    return null;
  }

  const links = await loadTopDiscoveryCategoryLinks();
  if (!links.length) {
    return null;
  }

  return (
    <nav className="sr-only" aria-label="Danh mục phụ tùng phổ biến">
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
