/**
 * Text chat validation + normalization — websocket/moderation deferred.
 * Keep RFQ_MESSAGE_TEXT_MAX in sync with frontend rfqConversationConstants.js
 */

export const RFQ_MESSAGE_TEXT_MAX = 2000;

/** Max consecutive identical characters (spam). */
export const RFQ_MESSAGE_MAX_CHAR_RUN = 40;

/** Max consecutive blank lines preserved (paragraph break). */
export const RFQ_MESSAGE_MAX_BLANK_LINES = 2;

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;
const UNICODE_SPACE_RE = /[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g;
const CHAR_RUN_RE = new RegExp(`(.)\\1{${RFQ_MESSAGE_MAX_CHAR_RUN - 1},}`, "u");
const URL_COUNT_RE = /https?:\/\//gi;

/**
 * Normalize message text for storage/display.
 * @returns {string}
 */
export function normalizeMessageText(raw) {
  let text = String(raw ?? "");
  text = text.replace(ZERO_WIDTH_RE, "");
  text = text.replace(UNICODE_SPACE_RE, " ");
  text = text.replace(/\r\n?/g, "\n");
  text = text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trimEnd())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n".repeat(RFQ_MESSAGE_MAX_BLANK_LINES));
  return text.trim();
}

/** True if only whitespace / invisible unicode. */
export function isEffectivelyEmpty(text) {
  const stripped = String(text ?? "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(UNICODE_SPACE_RE, " ");
  return stripped.trim().length === 0;
}

function hasExcessiveCharRepeat(text) {
  return CHAR_RUN_RE.test(text);
}

function hasSpamSignals(text) {
  const urls = text.match(URL_COUNT_RE);
  if (urls && urls.length > 8) return true;
  if (/(.{1,12}\n){25,}/.test(text)) return true;
  const nonSpace = text.replace(/\s/g, "");
  if (nonSpace.length >= 80) {
    const unique = new Set(nonSpace).size;
    if (unique <= 2) return true;
  }
  return false;
}

/**
 * Validate + normalize. Throws Error with .status = 400 and message = code.
 */
export function validateMessageText(raw) {
  const normalized = normalizeMessageText(raw);

  if (isEffectivelyEmpty(normalized)) {
    throw Object.assign(new Error("EMPTY_MESSAGE"), { status: 400 });
  }
  if (normalized.length > RFQ_MESSAGE_TEXT_MAX) {
    throw Object.assign(new Error("MESSAGE_TOO_LONG"), { status: 400 });
  }
  if (hasExcessiveCharRepeat(normalized)) {
    throw Object.assign(new Error("MESSAGE_SPAM"), { status: 400 });
  }
  if (hasSpamSignals(normalized)) {
    throw Object.assign(new Error("MESSAGE_SPAM"), { status: 400 });
  }

  return normalized;
}
