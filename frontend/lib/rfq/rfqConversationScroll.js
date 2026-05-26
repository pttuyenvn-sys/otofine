import { isNearScrollBottom } from "@/lib/rfq/rfqConversationMessages";

/** Threshold px — larger on mobile reduces accidental stick loss while reading. */
export const RFQ_SCROLL_BOTTOM_THRESHOLD = 96;

/**
 * Whether timeline should scroll to end after items update.
 * Conservative: only when user was at bottom AND a new tail message appeared.
 */
export function shouldScrollToEndOnUpdate({
  prevCount,
  prevLastId,
  nextCount,
  nextLastId,
  stickToBottom,
  nearBottom,
}) {
  if (!nextCount) return false;
  const grew = nextCount > prevCount;
  const tailChanged = nextLastId != null && nextLastId !== prevLastId;
  if (!grew && !tailChanged) return false;
  return Boolean(stickToBottom || nearBottom);
}

/**
 * Apply scroll position without smooth behavior (avoids poll/keyboard jumps).
 */
export function scrollToEndInstant(el) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

export function readNearBottom(el, thresholdPx = RFQ_SCROLL_BOTTOM_THRESHOLD) {
  return isNearScrollBottom(el, thresholdPx);
}
