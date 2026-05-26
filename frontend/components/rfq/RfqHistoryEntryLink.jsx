"use client";

import Link from "next/link";
import { useRfqHistorySummary } from "@/hooks/useRfqHistorySummary";
import { trackRfqHistoryOpened } from "@/lib/rfq/rfqHistoryAnalytics";

/**
 * Buyer history entry — badge when session has unread RFQs.
 */
export default function RfqHistoryEntryLink({
  className = "",
  variant = "secondary",
  sticky = false,
  source = "entry",
}) {
  const { totalUnread, hasRecentActivity, hasSession, rfqCount } = useRfqHistorySummary();
  const showBadge = totalUnread > 0;
  const showDot = !showBadge && hasRecentActivity && hasSession;

  const classes = [
    "rfq-history-entry",
    variant === "primary" ? "rfq-history-entry--primary" : "rfq-history-entry--secondary",
    sticky ? "rfq-history-entry--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href="/rfq/history"
      className={classes}
      onClick={() => trackRfqHistoryOpened(source)}
    >
      <span className="rfq-history-entry__icon" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </span>
      <span className="rfq-history-entry__label">Xem lịch sử hỏi giá</span>
      {showBadge ? (
        <span className="rfq-history-entry__badge" aria-label={`${totalUnread} tin chưa đọc`}>
          {totalUnread > 99 ? "99+" : totalUnread}
        </span>
      ) : showDot ? (
        <span className="rfq-history-entry__dot" aria-label="Có hoạt động gần đây" />
      ) : hasSession && rfqCount > 0 ? (
        <span className="rfq-history-entry__count muted">{rfqCount}</span>
      ) : null}
    </Link>
  );
}
