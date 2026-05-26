import {
  deriveShopResponseScore,
  RESPONSE_SCORE_TONES,
} from "@/lib/shopsite/responseSpeedScore";

/**
 * Compact "⚡ Tốc độ phản hồi" chip, intended to live inside the
 * trust strip / live-activity row.
 *
 * Returns `null` when there's no signal to render — never falsely
 * claims "Rất nhanh" because the only available data was a phone
 * number. See `deriveShopResponseScore` for the tier rules.
 *
 * Pure server component — derives from existing public DTO fields,
 * no client JS.
 */
export default function ShopResponseScoreChip({ shop, className = "" }) {
  const score = deriveShopResponseScore(shop);
  if (!score) return null;
  const tone = RESPONSE_SCORE_TONES[score.tone] || RESPONSE_SCORE_TONES.gray;
  return (
    <span
      title={score.title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap ${tone} ${className}`}
    >
      <span aria-hidden>{score.glyph}</span>
      Phản hồi · {score.label}
    </span>
  );
}
