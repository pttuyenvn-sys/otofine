/**
 * Server component that emits a single
 * `<script type="application/ld+json">` block holding the storefront's
 * AutoPartsStore / LocalBusiness / Organization @graph.
 *
 * Stays a server component — pure markup, no client state. Mounted
 * Mounted per landing page so `url` / `@id` match page canonical.
 *
 * Safety:
 *   - JSON.stringify drops `undefined` keys so empty fields don't
 *     emit broken schema
 *   - input is computed by `buildShopJsonLd()`, which already strips
 *     dangerous characters via JSON encoding
 */
export default function ShopJsonLd({ payload }) {
  if (!payload) return null;
  const json = JSON.stringify(payload);
  return (
    <script
      type="application/ld+json"
      // The payload is server-built from sanitized DTO fields; JSON
      // encoding handles HTML-character escaping.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
