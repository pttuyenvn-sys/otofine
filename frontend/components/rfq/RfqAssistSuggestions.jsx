"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { fetchRfqAssistSuggestions } from "@/lib/rfq/rfqAssistApi";
import { trackAssistEvent } from "@/lib/rfq/rfqAssistAnalytics";

/**
 * Phase 8.2 — RFQ Assist suggestion panel.
 *
 * UX CONTRACT (read first — the entire component is built around this)
 *
 *   - Mounts on `/rfq/t/[token]` above the chat. Optional, additive.
 *   - When the backend says rollout is OFF, when the API fails, when
 *     there are zero suggestions, OR when the buyer has dismissed
 *     the panel earlier this session, the component renders NOTHING.
 *     It never shows "no matches" copy or an error banner — silence
 *     is the safe default during soft rollout.
 *   - Selection is local-state only. The buyer can toggle "Chọn"
 *     and "Bỏ chọn" on each card; we POST analytics events but DO
 *     NOT touch dispatch or the RFQ status. Dispatch continues using
 *     the existing legacy picker. Phase 8.2 is observational.
 *   - HOT/WARM/COLD chip styling is colour-coded but kept restrained
 *     (B2B aesthetic): green / amber / slate.
 *   - All copy is Vietnamese to match the rest of /rfq/.
 *
 * ACCESSIBILITY
 *
 *   - The panel is a single `<section aria-label="Shop phù hợp đề xuất">`.
 *   - Score chip is annotated with `aria-label` ("Điểm phù hợp 95/100, mức cao").
 *   - Dismiss is a button with `aria-label="Đóng đề xuất shop"`.
 *   - IntersectionObserver only fires once per shopId per session
 *     (dedup done in `rfqAssistAnalytics`); no chatty re-fires.
 */

const DISMISS_STORAGE_PREFIX = "rfq_assist_dismissed_v1::";
const IMPRESSION_OBSERVE_THRESHOLD = 0.5;

function tierLabel(tier) {
  if (tier === "hot") return "Phù hợp cao";
  if (tier === "warm") return "Phù hợp";
  return "Liên quan";
}

function tierClass(tier) {
  if (tier === "hot") return "rfq-assist-card--hot";
  if (tier === "warm") return "rfq-assist-card--warm";
  return "rfq-assist-card--cold";
}

function isDismissed(rfqId) {
  if (typeof window === "undefined") return false;
  try {
    return !!sessionStorage.getItem(DISMISS_STORAGE_PREFIX + rfqId);
  } catch {
    return false;
  }
}

function persistDismissed(rfqId) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DISMISS_STORAGE_PREFIX + rfqId, "1");
  } catch {
    /* private mode → ignore */
  }
}

function clearDismissed(rfqId) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DISMISS_STORAGE_PREFIX + rfqId);
  } catch {
    /* ignore */
  }
}

export default function RfqAssistSuggestions({ rfqId, viewerToken }) {
  const [state, setState] = useState({
    loading: true,
    rollout: null,
    suggestions: [],
    dismissed: false,
  });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!viewerToken || !rfqId) return undefined;

    // Re-mount on RFQ id change starts fresh: clear any
    // session-level dismissal so a different RFQ doesn't inherit it.
    const startedDismissed = isDismissed(rfqId);
    setState((s) => ({ ...s, loading: true, dismissed: startedDismissed }));
    if (startedDismissed) return undefined;

    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    let cancelled = false;

    (async () => {
      const data = await fetchRfqAssistSuggestions(viewerToken, {
        signal: controller?.signal,
      });
      if (cancelled || !mountedRef.current) return;
      setState({
        loading: false,
        rollout: data.rollout || null,
        suggestions: data.suggestions || [],
        dismissed: false,
      });
    })();

    return () => {
      cancelled = true;
      controller?.abort?.();
    };
  }, [viewerToken, rfqId]);

  const visibleSuggestions = state.suggestions;

  const handleSelect = useCallback(
    (s) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const wasSelected = next.has(s.shopId);
        if (wasSelected) {
          next.delete(s.shopId);
        } else {
          next.add(s.shopId);
        }
        void trackAssistEvent({
          viewerToken,
          rfqId,
          action: wasSelected ? "deselected" : "selected",
          shopId: s.shopId,
          matchScore: s.score,
          matchTier: s.tier,
          metadata: { slug: s.slug, name: s.name },
        });
        return next;
      });
    },
    [viewerToken, rfqId],
  );

  const handleStorefrontClick = useCallback(
    (s) => {
      void trackAssistEvent({
        viewerToken,
        rfqId,
        action: "click",
        shopId: s.shopId,
        matchScore: s.score,
        matchTier: s.tier,
        metadata: { slug: s.slug, name: s.name, target: "storefront" },
      });
    },
    [viewerToken, rfqId],
  );

  const handleDismiss = useCallback(() => {
    persistDismissed(rfqId);
    setState((s) => ({ ...s, dismissed: true }));
    void trackAssistEvent({
      viewerToken,
      rfqId,
      action: "dismissed",
      metadata: { suggestionsCount: state.suggestions.length },
    });
  }, [rfqId, viewerToken, state.suggestions.length]);

  // ── Hide-paths ────────────────────────────────────────────────────
  if (state.loading) return null; // never show skeleton — silence on soft rollout
  if (state.dismissed) return null;
  if (!state.rollout?.inRollout) return null;
  if (!visibleSuggestions.length) return null;

  return (
    <section
      className="rfq-assist-panel"
      aria-label="Shop phù hợp đề xuất"
      data-rollout={state.rollout.reason || "in"}
    >
      <header className="rfq-assist-head">
        <div className="rfq-assist-head__text">
          <h2 className="rfq-assist-title">Shop phù hợp đề xuất</h2>
          <p className="rfq-assist-sub">
            Dựa trên xe của bạn, phụ tùng đang cần, và uy tín shop.
          </p>
        </div>
        <button
          type="button"
          className="rfq-assist-dismiss"
          aria-label="Đóng đề xuất shop"
          onClick={handleDismiss}
        >
          ✕
        </button>
      </header>

      <div className="rfq-assist-grid">
        {visibleSuggestions.map((s, i) => (
          <AssistCard
            key={s.shopId}
            suggestion={s}
            position={i}
            rfqId={rfqId}
            viewerToken={viewerToken}
            selected={selectedIds.has(s.shopId)}
            onSelectToggle={handleSelect}
            onStorefrontClick={handleStorefrontClick}
          />
        ))}
      </div>

      <p className="rfq-assist-foot">
        Đây là gợi ý hỗ trợ. Việc gửi báo giá vẫn tự động cho các shop phù hợp khác.
      </p>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────

const AssistCard = memo(function AssistCard({
  suggestion,
  position,
  rfqId,
  viewerToken,
  selected,
  onSelectToggle,
  onStorefrontClick,
}) {
  const cardRef = useRef(null);

  // Fire ONE impression per (rfqId, shopId) per session, when the
  // card is at least 50% visible. The analytics tracker dedupes
  // module-globally so re-mounts can't double-count.
  useEffect(() => {
    if (!cardRef.current || typeof IntersectionObserver === "undefined") return undefined;
    const el = cardRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= IMPRESSION_OBSERVE_THRESHOLD) {
            void trackAssistEvent({
              viewerToken,
              rfqId,
              action: "impression",
              shopId: suggestion.shopId,
              matchScore: suggestion.score,
              matchTier: suggestion.tier,
              metadata: { slug: suggestion.slug, position },
            });
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: [IMPRESSION_OBSERVE_THRESHOLD] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rfqId, viewerToken, suggestion.shopId, suggestion.score, suggestion.tier, suggestion.slug, position]);

  const tierLabelText = tierLabel(suggestion.tier);
  const tierAriaScore = `Điểm phù hợp ${suggestion.score}/${suggestion.max}, mức ${tierLabelText}`;

  return (
    <article
      ref={cardRef}
      className={`rfq-assist-card ${tierClass(suggestion.tier)}${selected ? " rfq-assist-card--selected" : ""}`}
    >
      <div className="rfq-assist-card__head">
        <Link
          href={`/shops/${suggestion.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rfq-assist-card__name"
          onClick={() => onStorefrontClick(suggestion)}
        >
          {suggestion.name || `Shop #${suggestion.shopId}`}
        </Link>
        <span className="rfq-assist-card__score" aria-label={tierAriaScore} title={tierAriaScore}>
          <span className="rfq-assist-card__score-num">{suggestion.score}</span>
          <span className="rfq-assist-card__score-max">/{suggestion.max}</span>
          <span className="rfq-assist-card__tier">{tierLabelText}</span>
        </span>
      </div>

      <div className="rfq-assist-card__meta">
        {suggestion.storefront?.verified && (
          <span className="rfq-assist-chip rfq-assist-chip--verified" title="Shop đã xác minh">
            ✓ Đã xác minh
          </span>
        )}
        {suggestion.specialization?.slice(0, 2).map((b) => (
          <span key={b.brand} className="rfq-assist-chip rfq-assist-chip--brand">
            Chuyên {b.brand}
          </span>
        ))}
      </div>

      {suggestion.reasons?.length > 0 && (
        <ul className="rfq-assist-card__reasons">
          {suggestion.reasons.map((r) => (
            <li key={r.key} className="rfq-assist-reason">
              <span className="rfq-assist-reason__bullet" aria-hidden="true">•</span>
              <span className="rfq-assist-reason__label">{r.label}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rfq-assist-card__actions">
        <button
          type="button"
          className={`rfq-assist-toggle${selected ? " rfq-assist-toggle--on" : ""}`}
          onClick={() => onSelectToggle(suggestion)}
          aria-pressed={selected ? "true" : "false"}
        >
          {selected ? "✓ Đã chọn" : "Chọn shop này"}
        </button>
        <Link
          href={`/shops/${suggestion.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rfq-assist-storefront"
          onClick={() => onStorefrontClick(suggestion)}
        >
          Xem shop →
        </Link>
      </div>
    </article>
  );
});
