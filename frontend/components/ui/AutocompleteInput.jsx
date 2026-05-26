"use client";

/**
 * AutocompleteInput — lightweight, mobile-friendly text input with a
 * keyboard-navigable suggestion dropdown.
 *
 * Designed for the seller product create/edit form ("Tên sản phẩm",
 * "Xuất xứ"). It is NOT a generic combobox — to keep the bundle
 * small and the UX predictable we deliberately:
 *
 *   - debounce queries (default 180ms)
 *   - cache responses in-memory by (sourceKey, query)
 *   - short-circuit when the query is shorter than `minChars` (no API hit)
 *   - close on outside click + Escape, mark items selectable with
 *     arrow keys + Enter / Tab, and tap on mobile
 *   - never block typing — the input value is owned by the parent
 *
 * Props:
 *   - value, onChange, placeholder, className, id, maxLength
 *   - fetchSuggestions(query): Promise<Array<{ value, label?, hint? }>>
 *   - sourceKey: cache namespace (e.g. "partName", "origin")
 *   - minChars: short-circuit threshold (default 1)
 *   - debounceMs: default 180
 *   - onPick(item): optional, fired in addition to onChange(item.value)
 *
 * No backend changes. Failures (network / 4xx) silently collapse the
 * dropdown — typing is never blocked.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

// Module-scoped LRU-ish cache. Keyed by `${sourceKey}::${q}` so two
// fields can share the same key when their datasets are equivalent.
const SUGGESTION_CACHE = new Map();
const SUGGESTION_CACHE_MAX = 200;

function readCache(key) {
  if (!SUGGESTION_CACHE.has(key)) return null;
  // Refresh recency by re-inserting.
  const v = SUGGESTION_CACHE.get(key);
  SUGGESTION_CACHE.delete(key);
  SUGGESTION_CACHE.set(key, v);
  return v;
}

function writeCache(key, value) {
  SUGGESTION_CACHE.set(key, value);
  if (SUGGESTION_CACHE.size > SUGGESTION_CACHE_MAX) {
    const first = SUGGESTION_CACHE.keys().next().value;
    SUGGESTION_CACHE.delete(first);
  }
}

export default function AutocompleteInput({
  value,
  onChange,
  onPick,
  fetchSuggestions,
  sourceKey,
  placeholder,
  className = "",
  id,
  maxLength,
  minChars = 1,
  debounceMs = 180,
  ariaLabel,
}) {
  const inputId = useId();
  const reactId = id || inputId;
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const lastQueryRef = useRef("");

  const cacheKey = useCallback(
    (q) => `${sourceKey}::${q.toLowerCase()}`,
    [sourceKey],
  );

  // Debounced fetch. The trailing query wins; in-flight stale
  // responses are dropped by comparing against `lastQueryRef`.
  useEffect(() => {
    const q = String(value || "").trim();
    if (q.length < minChars) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }

    const cached = readCache(cacheKey(q));
    if (cached) {
      setSuggestions(cached);
      lastQueryRef.current = q;
      return undefined;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      lastQueryRef.current = q;
      setLoading(true);
      try {
        const list = await fetchSuggestions(q);
        if (cancelled || lastQueryRef.current !== q) return;
        const arr = Array.isArray(list) ? list.slice(0, 8) : [];
        writeCache(cacheKey(q), arr);
        setSuggestions(arr);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, fetchSuggestions, cacheKey, minChars, debounceMs]);

  // Reset highlight whenever suggestions change.
  useEffect(() => {
    setHighlight(-1);
  }, [suggestions]);

  // Outside-click and Escape — close the dropdown but keep the input
  // value (typing is never destructive).
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(ev) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(ev.target)) setOpen(false);
    }
    function onKey(ev) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickItem(item) {
    onChange(item.value);
    if (onPick) onPick(item);
    setOpen(false);
    setHighlight(-1);
    // Re-focus the input so the seller can keep typing if needed.
    requestAnimationFrame(() => {
      try {
        inputRef.current?.focus();
      } catch {
        /* noop */
      }
    });
  }

  function handleKeyDown(ev) {
    if (!open || suggestions.length === 0) return;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
    } else if (ev.key === "Enter" || ev.key === "Tab") {
      if (highlight >= 0 && highlight < suggestions.length) {
        ev.preventDefault();
        pickItem(suggestions[highlight]);
      }
    }
  }

  const showDropdown = useMemo(() => {
    if (!open) return false;
    return suggestions.length > 0 || loading;
  }, [open, suggestions.length, loading]);

  return (
    <div className={`relative ${className}`.trim()} ref={wrapperRef}>
      <input
        ref={inputRef}
        id={reactId}
        type="text"
        value={value || ""}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-controls={`${reactId}-list`}
        aria-label={ariaLabel}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
      />
      {showDropdown ? (
        <ul
          id={`${reactId}-list`}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-gray-500 text-sm">Đang tìm…</li>
          ) : null}
          {suggestions.map((item, i) => {
            const active = i === highlight;
            const label = item.label || item.value;
            return (
              <li
                key={`${item.value}-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  // Prevent the input losing focus before the click
                  // handler runs (otherwise the dropdown closes first
                  // via the outside-click listener).
                  e.preventDefault();
                  pickItem(item);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={
                  "px-3 py-2 cursor-pointer flex items-start gap-2 " +
                  (active ? "bg-emerald-50 text-emerald-900" : "text-gray-800")
                }
              >
                <span className="flex-1 min-w-0 truncate">{label}</span>
                {item.hint ? (
                  <span className="text-[11px] text-gray-400 shrink-0">{item.hint}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
