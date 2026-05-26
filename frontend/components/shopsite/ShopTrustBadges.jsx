/**
 * Compact storefront trust badges.
 *
 * Renders 0..N small chips immediately under the cover. Designed to
 * *reinforce* the shop brand rather than compete with it:
 *   - sub-13px typography
 *   - subtle white-on-black-overlay or red-tinted palettes per kind
 *   - mobile: horizontal scroll with momentum (`overflow-x-auto`)
 *   - desktop: wraps to fit
 *
 * Server component — no client-side state needed. Accepts the badge
 * array directly (computed by `deriveShopTrustBadges`) so the layout
 * can pass either the live list or null without an extra check.
 */
export default function ShopTrustBadges({ badges, className = "" }) {
  if (!Array.isArray(badges) || badges.length === 0) return null;
  return (
    <div
      className={`-mt-1 flex items-center gap-2 overflow-x-auto sm:flex-wrap no-scrollbar ${className}`}
      role="list"
      aria-label="Đặc điểm shop"
    >
      {badges.map((b) => (
        <Badge key={`${b.kind}:${b.label}`} kind={b.kind} title={b.title}>
          {b.label}
        </Badge>
      ))}
    </div>
  );
}

const KIND_STYLES = {
  verified: "bg-blue-50 text-blue-700 ring-blue-200",
  response: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  tenure:   "bg-amber-50 text-amber-700 ring-amber-200",
  brand:    "bg-gray-100 text-gray-700 ring-gray-200",
  catalog:  "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

function Badge({ kind, title, children }) {
  const palette = KIND_STYLES[kind] || KIND_STYLES.brand;
  return (
    <span
      role="listitem"
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium ring-1 shrink-0 ${palette}`}
    >
      <Dot kind={kind} />
      {children}
    </span>
  );
}

function Dot({ kind }) {
  const color = {
    verified: "bg-blue-500",
    response: "bg-emerald-500",
    tenure:   "bg-amber-500",
    brand:    "bg-gray-400",
    catalog:  "bg-indigo-500",
  }[kind] || "bg-gray-400";
  return <span aria-hidden className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}
