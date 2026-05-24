"use client";

import { useMemo } from "react";
import { computeShopCompletion } from "@/lib/shopsite/shopCompletion";

/**
 * Storefront completion panel — friendly nudge, never blocking.
 *
 * Computed entirely on the client from the current form state so the
 * score updates live as the seller fills in missing fields. No
 * extra API call.
 *
 * Visual contract:
 *   - large numeric score + progress bar
 *   - friendly headline that adapts to the score range
 *   - missing-item list grouped by section, with anchor links that
 *     scroll the seller to the relevant SectionCard
 *   - hides itself when complete (100%) so it doesn't nag
 */
export default function ShopCompletionPanel({ basic, pub }) {
  const { score, items, missing } = useMemo(
    () => computeShopCompletion({ basic, pub }),
    [basic, pub],
  );

  const tone = scoreTone(score);
  const headline = scoreHeadline(score);

  return (
    <section
      id="completion"
      className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-4 mb-4"
      aria-label="Mức độ hoàn thiện storefront"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            Hồ sơ shop hoàn thiện {score}%
          </h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{headline}</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center justify-center min-w-[3rem] h-10 px-2 rounded-xl text-base font-bold ${tone.pill}`}
        >
          {score}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
          style={{ width: `${score}%` }}
          aria-hidden
        />
      </div>

      {missing.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Còn {missing.length} mục để hoàn thiện
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {missing.map((m) => (
              <li key={m.key}>
                <a
                  href={anchorFor(m.key)}
                  className="flex items-center gap-2 text-xs text-gray-700 hover:text-[#e60012] hover:underline"
                >
                  <span
                    aria-hidden
                    className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                  />
                  {m.label}
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-400">{m.group}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">
          Tuyệt vời! Hồ sơ shop đã đầy đủ — sẵn sàng tăng tỷ lệ chuyển đổi.
        </p>
      )}
    </section>
  );
}

function scoreTone(s) {
  if (s >= 85) return { pill: "bg-emerald-50 text-emerald-700",  bar: "bg-emerald-500" };
  if (s >= 60) return { pill: "bg-amber-50  text-amber-700",     bar: "bg-amber-500"   };
  return         { pill: "bg-red-50    text-red-700",       bar: "bg-red-500"     };
}

function scoreHeadline(s) {
  if (s >= 95) return "Shop của bạn đã sẵn sàng đón khách hàng!";
  if (s >= 80) return "Còn vài chi tiết nhỏ để hoàn thiện trang shop.";
  if (s >= 50) return "Bổ sung thêm thông tin sẽ tăng độ tin cậy của shop.";
  return "Hoàn thiện hồ sơ để tăng tỷ lệ khách hàng tin tưởng và liên hệ.";
}

/**
 * Map a completion-item key to the anchor of its SectionCard in
 * `/shop/settings`. Keys not mapped fall back to "#basic".
 */
function anchorFor(key) {
  switch (key) {
    case "name":
    case "phone":
      return "#basic";
    case "slug":
    case "publicStatus":
      return "#public";
    case "avatar":
    case "cover":
      return "#branding";
    case "bio":
    case "intro":
      return "#intro";
    case "zaloPhone":
    case "facebookUrl":
    case "workingHours":
    case "addressDetail":
    case "mapEmbed":
      return "#contact";
    case "salePolicy":
    case "warrantyPolicy":
      return "#policies";
    default:
      return "#basic";
  }
}
