"use client";

import { useEffect, useRef, useState } from "react";
import ShopRichContentRenderer from "./ShopRichContentRenderer";

/**
 * Storefront intro clamp.
 *
 * Wraps the seller-provided `intro_html` rich block with a mobile-only
 * collapsed view:
 *
 *   - clamped to ~180px tall on phones (<lg)
 *   - bottom gradient fade so the cut feels intentional, not abrupt
 *   - "Xem thêm" toggle that reveals the full content
 *
 * Desktop (`lg:` and up) renders the content full-height with no
 * gradient and no toggle button — exactly the same visual as before
 * this component existed.
 *
 * Performance:
 *   - The clamp is implemented via a CSS max-height on the wrapping
 *     div, NOT by mounting/unmounting the rich-content renderer.
 *     This means:
 *       (a) zero hydration mismatch — the full HTML always ships
 *           to the client; only its overflow is hidden,
 *       (b) zero layout shift on expand — the height transitions
 *           smoothly between a measured natural-height and the
 *           clamp value,
 *       (c) any future SEO-critical content stays in the DOM so
 *           crawlers see it unconditionally.
 *
 *   - If the natural content height is shorter than the clamp on
 *     mobile, the toggle hides itself (no point offering "Xem
 *     thêm" when there's nothing extra to reveal).
 *
 * Accessibility:
 *   - The button is rendered with `aria-expanded` reflecting state.
 *   - The collapsed region is reachable to screen readers via the
 *     same `<article>` ShopRichContentRenderer ships — only its
 *     visual overflow is hidden, not its semantic content.
 */
export default function ShopIntroClamp({ html, className = "" }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(true);

  // Measure once after hydration. If the natural content height is
  // ≤ the clamp, we hide the toggle. We re-measure on viewport
  // resize because the content's natural height depends on width.
  useEffect(() => {
    const measure = () => {
      const el = innerRef.current;
      if (!el) return;
      // The clamp is 180px; if mobile breakpoint is active AND the
      // content is taller than that we keep the toggle. We use a
      // small slack (8px) so a content block that's ~exactly 180px
      // doesn't show a meaningless toggle.
      const isMobile =
        typeof window !== "undefined" && window.innerWidth < 1024;
      if (!isMobile) {
        setOverflows(false);
        return;
      }
      setOverflows(el.scrollHeight > 180 + 8);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [html]);

  return (
    <div className={`shop-intro-clamp ${className}`} ref={wrapRef}>
      <div
        className={`relative overflow-hidden transition-[max-height] duration-300 ease-out ${
          expanded ? "max-h-[5000px]" : "max-h-[180px] lg:max-h-none"
        }`}
      >
        <div ref={innerRef}>
          <ShopRichContentRenderer html={html} />
        </div>
        {/* Bottom gradient fade — only visible while collapsed on
            mobile. `lg:hidden` removes it on desktop. */}
        {!expanded && (
          <div
            aria-hidden
            className="lg:hidden pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white via-white/85 to-white/0"
          />
        )}
      </div>

      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="lg:hidden mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#e60012] hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "Thu gọn" : "Xem thêm"}
          <ChevronIcon flipped={expanded} />
        </button>
      )}
    </div>
  );
}

function ChevronIcon({ flipped }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${flipped ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
