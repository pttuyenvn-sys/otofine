"use client";

import { parseMessageTextSegments } from "@/lib/rfq/rfqSafeMessageText";

/**
 * Renders message_text as plain text + auto-linked http(s) URLs.
 * React escapes text nodes; links use rel=noopener noreferrer.
 */
export default function RfqSafeMessageText({ text, className = "" }) {
  const segments = parseMessageTextSegments(text);
  if (!segments.length) return null;

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.type === "link") {
          return (
            <a
              key={`l-${i}`}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="rfq-safe-msg__link"
            >
              {seg.label}
            </a>
          );
        }
        return <span key={`t-${i}`}>{seg.value}</span>;
      })}
    </span>
  );
}
