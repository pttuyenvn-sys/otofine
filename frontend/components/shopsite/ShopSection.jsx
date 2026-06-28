/**
 * Section wrapper — title left, optional "See all" link right,
 * red accent underline.
 */
export default function ShopSection({
  title,
  titleTag = "h2",
  rightHref,
  rightLabel = "Xem tất cả",
  children,
  className = "",
  bodyClassName = "",
}) {
  const TitleTag = titleTag;
  return (
    <section className={`bg-white rounded-2xl shadow-sm ${className}`}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <TitleTag className="text-base sm:text-lg font-bold uppercase tracking-wide text-[#e60012]">
          {title}
        </TitleTag>
        {rightHref && (
          <a
            href={rightHref}
            className="text-sm text-gray-600 hover:text-[#e60012] inline-flex items-center gap-1"
          >
            {rightLabel}
            <span aria-hidden>›</span>
          </a>
        )}
      </div>
      <div className={`p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
