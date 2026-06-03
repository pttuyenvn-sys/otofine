"use client";

/**
 * useProductDraftAutosave
 *
 * Tiny localStorage-backed autosave for the seller product form. The
 * hook is deliberately UI-shape-agnostic: it just takes a plain
 * snapshot of the form state and persists it under a stable key.
 *
 * Behaviour:
 *   - Writes are debounced (default 700ms) so rapid typing doesn't
 *     hammer localStorage.
 *   - The first read on mount returns the previously saved draft (if
 *     any) so the caller can offer "Khôi phục bản nháp?".
 *   - `clear()` is invoked after a successful save to wipe the draft.
 *   - On SSR / disabled storage the hook becomes a no-op.
 *
 * Scope:
 *   - New product: key = "otofine.draft.new"
 *   - Existing product: key = `otofine.draft.${productId}`
 *
 * Storage shape:
 *   {
 *     savedAt: <ISO timestamp>,
 *     data: <whatever the caller passed in>
 *   }
 *
 * Versioning: the wrapper carries a `v` field so we can bump it the
 * day we change the snapshot schema without crashing on stale drafts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  normalizeSellerDraftSnapshot,
  sellerMediaContext,
} from "@/lib/media/sellerProductMedia";

const DRAFT_VERSION = 1;
const STORAGE_PREFIX = "otofine.draft.";
const STORAGE_INDEX_KEY = "otofine.draft.__index";

function storageKeyFor(productId) {
  return STORAGE_PREFIX + (productId ? String(productId) : "new");
}

function safeReadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== DRAFT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteJSON(key, payload) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ v: DRAFT_VERSION, savedAt: new Date().toISOString(), data: payload }),
    );
    return true;
  } catch {
    // Storage full / private mode — silently degrade.
    return false;
  }
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} options
 * @param {number|string|null} options.productId  Stable scope key.
 * @param {object} options.data                   Current form state.
 * @param {boolean} [options.enabled=true]        Skip the hook (e.g. while modal is closing).
 * @param {number}  [options.debounceMs=700]
 * @param {(meta: { savedAt: string }) => void} [options.onSaved] fires after a write.
 *
 * @returns {{
 *   savedAt: string|null,         // ISO timestamp of last persisted draft
 *   restored: object|null,        // payload read on mount (null if no draft)
 *   clear: () => void             // remove the draft (call after successful save)
 * }}
 */
export default function useProductDraftAutosave({
  productId = null,
  data,
  enabled = true,
  debounceMs = 700,
  onSaved,
}) {
  const key = storageKeyFor(productId);
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  // One-time read at mount. Components decide whether to offer the
  // user "Khôi phục bản nháp" or apply it implicitly.
  const [restored, setRestored] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const initialReadRef = useRef(false);

  useEffect(() => {
    if (initialReadRef.current) return;
    initialReadRef.current = true;
    if (typeof window === "undefined") return;
    const stored = safeReadJSON(key);
    if (stored) {
      const normalized = normalizeSellerDraftSnapshot(
        stored.data,
        sellerMediaContext(null, stored.data),
      );
      setRestored(normalized);
      setSavedAt(stored.savedAt);
    }
  }, [key]);

  // Debounced write loop. We snapshot the latest `data` value via a
  // ref so the timeout always reads the freshest state when it fires
  // (avoids stale-closure bugs on rapid edits).
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined") return undefined;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const snapshot = normalizeSellerDraftSnapshot(
        dataRef.current,
        sellerMediaContext(null, dataRef.current),
      );
      if (!snapshot || typeof snapshot !== "object") return;
      // Quick skip: empty new-product form (nothing meaningful entered)
      // → don't bother writing a draft.
      if (!productId && isEmptySnapshot(snapshot)) return;

      const ok = safeWriteJSON(key, snapshot);
      if (ok) {
        const stamp = new Date().toISOString();
        setSavedAt(stamp);
        // Track which drafts exist so the seller can in the future see
        // a "Bản nháp đang lưu" badge. Kept lightweight on purpose.
        try {
          const idx = JSON.parse(localStorage.getItem(STORAGE_INDEX_KEY) || "[]");
          if (!idx.includes(key)) {
            localStorage.setItem(
              STORAGE_INDEX_KEY,
              JSON.stringify([...idx, key].slice(-20)),
            );
          }
        } catch {
          /* ignore */
        }
        onSavedRef.current?.({ savedAt: stamp });
      }
    }, debounceMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [data, enabled, key, debounceMs, productId]);

  const clear = useCallback(() => {
    safeRemove(key);
    setSavedAt(null);
    setRestored(null);
  }, [key]);

  return { savedAt, restored, clear };
}

/** Empty enough that we shouldn't waste a draft slot. */
function isEmptySnapshot(s) {
  if (!s || typeof s !== "object") return true;
  const text = [s.partNumber, s.partName, s.origin, s.shortDescription, s.description]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .join("");
  if (text) return false;
  if (Number(s.price) > 0) return false;
  if (Number(s.stock) > 0) return false;
  if (Array.isArray(s.cars) && s.cars.some((c) => c?.carModelId || c?.brand)) return false;
  if (Array.isArray(s.existingImages) && s.existingImages.length) return false;
  return true;
}
