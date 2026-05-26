"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isRfqUploadMime,
  rfqUploadSizeOk,
  uploadRfqImage,
} from "@/lib/rfq/rfqUploadImage";

export const RFQ_IMAGE_SECTION_KEYS = ["part", "registration", "vehicle"];

const EMPTY_SECTIONS = () => ({
  part: [],
  registration: [],
  vehicle: [],
});

function nextId() {
  return `rfq-img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Per-file upload state for RFQ create (3 UI sections → flat imageUrls on submit).
 * Server upload requires pending_otp publicId — call ensurePublicId before upload runs.
 */
/** Limit parallel RFQ uploads — reduces CPU/memory spikes on mobile + single-core VPS. */
const MAX_CONCURRENT_UPLOADS = 2;

export function useRfqImageUpload({
  ensurePublicId,
  maxPerSection = 6,
  maxTotal = 10,
} = {}) {
  const [sections, setSections] = useState(EMPTY_SECTIONS);
  const sectionsRef = useRef(sections);
  const ensureRef = useRef(ensurePublicId);
  const inflightRef = useRef(new Set());
  const uploadSlotsRef = useRef(0);
  const waitQueueRef = useRef([]);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  useEffect(() => {
    ensureRef.current = ensurePublicId;
  }, [ensurePublicId]);

  const patchItem = useCallback((sectionKey, clientId, patch) => {
    setSections((prev) => ({
      ...prev,
      [sectionKey]: prev[sectionKey].map((it) =>
        it.clientId === clientId ? { ...it, ...patch } : it,
      ),
    }));
  }, []);

  const drainUploadQueue = useCallback(() => {
    while (
      uploadSlotsRef.current < MAX_CONCURRENT_UPLOADS &&
      waitQueueRef.current.length > 0
    ) {
      const job = waitQueueRef.current.shift();
      if (job) void job();
    }
  }, []);

  const runUpload = useCallback(
    async (sectionKey, clientId, itemOverride = null) => {
      if (inflightRef.current.has(clientId)) return;
      const item =
        itemOverride ??
        sectionsRef.current[sectionKey]?.find((x) => x.clientId === clientId);
      if (!item?.file) {
        patchItem(sectionKey, clientId, {
          status: "error",
          error: "Không đọc được file — thử chọn lại.",
        });
        return;
      }

      const execute = async () => {
        inflightRef.current.add(clientId);
        patchItem(sectionKey, clientId, { status: "uploading", error: "" });

        try {
          const ensure = ensureRef.current;
          if (!ensure) throw new Error("MISSING_DRAFT_HANDLER");
          const publicId = await ensure();
          if (!publicId) throw new Error("MISSING_PUBLIC_ID");

          const { url } = await uploadRfqImage(item.file, publicId);
          patchItem(sectionKey, clientId, {
            status: "done",
            url,
            error: "",
          });
          if (item.previewUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(item.previewUrl);
          }
        } catch (e) {
          let message = e?.message || "Tải ảnh thất bại";
          if (
            message === "NEED_PHONE_DESCRIPTION" ||
            message === "NEED_VALID_FORM"
          ) {
            message = "Nhập SĐT, mô tả (≥8 ký tự) và chọn đủ xe trước khi tải ảnh.";
          } else if (message === "MISSING_PUBLIC_ID" || message === "NO_PUBLIC_ID") {
            message = "Chưa tạo được yêu cầu — thử lại sau.";
          } else if (
            message === "UPLOAD_TOO_LARGE" ||
            e?.code === "UPLOAD_TOO_LARGE" ||
            e?.status === 413
          ) {
            message = "Ảnh quá lớn (tối đa 5MB trước khi nén).";
          } else if (e?.name === "TimeoutError" || message.includes("timeout")) {
            message = "Tải ảnh quá lâu — kiểm tra mạng và thử lại.";
          }
          patchItem(sectionKey, clientId, {
            status: "error",
            error: message,
          });
        } finally {
          inflightRef.current.delete(clientId);
          uploadSlotsRef.current = Math.max(0, uploadSlotsRef.current - 1);
          drainUploadQueue();
        }
      };

      if (uploadSlotsRef.current >= MAX_CONCURRENT_UPLOADS) {
        patchItem(sectionKey, clientId, { status: "pending", error: "" });
        waitQueueRef.current.push(execute);
        return;
      }

      uploadSlotsRef.current += 1;
      await execute();
    },
    [patchItem, drainUploadQueue],
  );

  const queueUpload = useCallback(
    (sectionKey, clientId, itemOverride = null) => {
      void runUpload(sectionKey, clientId, itemOverride);
    },
    [runUpload],
  );

  const addFiles = useCallback(
    (sectionKey, fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return { added: 0, rejected: [] };

      const rejected = [];
      const toAdd = [];
      const current = sectionsRef.current[sectionKey] || [];
      const totalNow = RFQ_IMAGE_SECTION_KEYS.reduce(
        (n, k) => n + (sectionsRef.current[k]?.length || 0),
        0,
      );
      let slotsSection = maxPerSection - current.length;
      let slotsTotal = maxTotal - totalNow;

      for (const file of files) {
        if (slotsTotal <= 0) {
          rejected.push({ file, reason: "max_total" });
          continue;
        }
        if (slotsSection <= 0) {
          rejected.push({ file, reason: "max_section" });
          continue;
        }
        if (!isRfqUploadMime(file)) {
          rejected.push({ file, reason: "type" });
          continue;
        }
        if (!rfqUploadSizeOk(file)) {
          rejected.push({ file, reason: "size" });
          continue;
        }
        slotsSection -= 1;
        slotsTotal -= 1;
        const clientId = nextId();
        toAdd.push({
          clientId,
          file,
          previewUrl: URL.createObjectURL(file),
          url: "",
          status: "pending",
          error: "",
        });
      }

      if (toAdd.length) {
        setSections((prev) => {
          const next = {
            ...prev,
            [sectionKey]: [...(prev[sectionKey] || []), ...toAdd],
          };
          sectionsRef.current = next;
          return next;
        });
        for (const item of toAdd) {
          queueUpload(sectionKey, item.clientId, item);
        }
      }

      return { added: toAdd.length, rejected };
    },
    [maxPerSection, maxTotal, queueUpload],
  );

  const countItems = useCallback(() => {
    return RFQ_IMAGE_SECTION_KEYS.reduce(
      (n, k) => n + (sectionsRef.current[k]?.length || 0),
      0,
    );
  }, []);

  const removeItem = useCallback((sectionKey, clientId) => {
    setSections((prev) => {
      const item = prev[sectionKey]?.find((x) => x.clientId === clientId);
      if (item?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return {
        ...prev,
        [sectionKey]: prev[sectionKey].filter((x) => x.clientId !== clientId),
      };
    });
    inflightRef.current.delete(clientId);
  }, []);

  const retryUpload = useCallback(
    (sectionKey, clientId) => {
      const item = sectionsRef.current[sectionKey]?.find((x) => x.clientId === clientId);
      if (!item?.file) return;
      queueUpload(sectionKey, clientId, item);
    },
    [queueUpload],
  );

  const getUploadedUrls = useCallback(() => {
    const urls = [];
    const seen = new Set();
    for (const key of RFQ_IMAGE_SECTION_KEYS) {
      for (const it of sectionsRef.current[key] || []) {
        if (it.status !== "done" || !it.url) continue;
        const u = String(it.url).trim();
        if (!u || seen.has(u)) continue;
        seen.add(u);
        urls.push(u);
      }
    }
    return urls;
  }, []);

  /** Reactive upload gate — use `uploadStatus` for submit button (not ref-only callbacks). */
  const uploadStatus = computeUploadStatus(sections, inflightRef.current);

  const hasUploading = useCallback(() => {
    const s = computeUploadStatus(sectionsRef.current, inflightRef.current);
    return s.hasUploading;
  }, [sections]);

  const hasErrors = useCallback(() => {
    return computeUploadStatus(sectionsRef.current, inflightRef.current).hasErrors;
  }, [sections]);

  /** After final create, upload any items that were waiting for publicId. */
  const flushPending = useCallback(async () => {
    const tasks = [];
    for (const key of RFQ_IMAGE_SECTION_KEYS) {
      for (const it of sectionsRef.current[key] || []) {
        if (it.file && it.status !== "done") {
          tasks.push(runUpload(key, it.clientId));
        }
      }
    }
    await Promise.all(tasks);
  }, [runUpload]);

  useEffect(() => {
    return () => {
      for (const key of RFQ_IMAGE_SECTION_KEYS) {
        for (const it of sectionsRef.current[key] || []) {
          if (it.previewUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(it.previewUrl);
          }
        }
      }
    };
  }, []);

  return {
    sections,
    uploadStatus,
    addFiles,
    removeItem,
    retryUpload,
    getUploadedUrls,
    hasUploading,
    hasErrors,
    flushPending,
    countItems,
  };
}

/** Derived from React state — safe for render-time submit gating. */
export function computeUploadStatus(sections, inflightSize = 0) {
  let pending = 0;
  let uploading = 0;
  let errors = 0;
  let done = 0;
  for (const key of RFQ_IMAGE_SECTION_KEYS) {
    for (const it of sections[key] || []) {
      if (it.status === "pending") pending += 1;
      else if (it.status === "uploading") uploading += 1;
      else if (it.status === "error") errors += 1;
      else if (it.status === "done") done += 1;
    }
  }
  const inflight = Number(inflightSize) || 0;
  return {
    pending,
    uploading,
    errors,
    done,
    hasUploading: pending > 0 || uploading > 0 || inflight > 0,
    hasErrors: errors > 0,
  };
}
