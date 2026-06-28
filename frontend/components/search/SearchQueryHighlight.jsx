"use client";

import { useMemo } from "react";
import { buildSearchHighlightParts } from "@/lib/search/highlightSearchQuery";

/**
 * Renders text with matched query tokens wrapped in <mark> (HTML-safe).
 */
export default function SearchQueryHighlight({ text, query, className, as: Tag = "span" }) {
  const parts = useMemo(
    () => buildSearchHighlightParts(text, query),
    [text, query],
  );

  return (
    <Tag className={className}>
      {parts.map((part, index) =>
        part.highlight ? (
          <mark key={index} className="search-suggest-highlight">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </Tag>
  );
}
