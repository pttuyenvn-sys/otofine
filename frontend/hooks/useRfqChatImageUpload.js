"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RFQ_CHAT_MAX_IMAGES_PER_MESSAGE,
  isRfqUploadMime,
  rfqUploadSizeOk,
  uploadConversationImage,
} from "@/lib/rfq/rfqConversationUpload";

function nextId() {
  return `chat-img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_CONCURRENT = 2;

/**
 * Stage conversation images before POST …/messages with attachmentIds.
 */
export function useRfqChatImageUpload({ dispatchId, headers, maxCount = RFQ_CHAT_MAX_IMAGES_PER_MESSAGE }) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  const slotsRef = useRef(0);
  const queueRef = useRef([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((clientId, data) => {
    setItems((prev) =>
      prev.map((it) => (it.clientId === clientId ? { ...it, ...data } : it)),
    );
  }, []);

  const drain = useCallback(() => {
    while (slotsRef.current < MAX_CONCURRENT && queueRef.current.length) {
      const job = queueRef.current.shift();
      if (job) void job();
    }
  }, []);

  const runUpload = useCallback(
    async (clientId, file) => {
      if (!dispatchId || !file) return;

      const run = async () => {
        patch(clientId, { status: "uploading", error: "" });
        try {
          const { attachmentId, url } = await uploadConversationImage(file, dispatchId, {
            headers,
          });
          patch(clientId, {
            status: "done",
            attachmentId,
            url,
            error: "",
          });
        } catch (e) {
          patch(clientId, {
            status: "error",
            error: e?.message || "Tải ảnh thất bại",
          });
        } finally {
          slotsRef.current = Math.max(0, slotsRef.current - 1);
          drain();
        }
      };

      if (slotsRef.current >= MAX_CONCURRENT) {
        patch(clientId, { status: "pending", error: "" });
        queueRef.current.push(run);
        return;
      }
      slotsRef.current += 1;
      await run();
    },
    [dispatchId, headers, patch, drain],
  );

  const addFiles = useCallback(
    (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length || !dispatchId) return { added: 0 };

      const current = itemsRef.current.length;
      let slots = maxCount - current;
      const toAdd = [];

      for (const file of files) {
        if (slots <= 0) break;
        if (!isRfqUploadMime(file) || !rfqUploadSizeOk(file)) continue;
        slots -= 1;
        const clientId = nextId();
        toAdd.push({
          clientId,
          file,
          previewUrl: URL.createObjectURL(file),
          attachmentId: null,
          url: "",
          status: "pending",
          error: "",
        });
      }

      if (toAdd.length) {
        setItems((prev) => [...prev, ...toAdd]);
        for (const it of toAdd) {
          void runUpload(it.clientId, it.file);
        }
      }
      return { added: toAdd.length };
    },
    [dispatchId, maxCount, runUpload],
  );

  const removeItem = useCallback((clientId) => {
    setItems((prev) => {
      const item = prev.find((x) => x.clientId === clientId);
      if (item?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((x) => x.clientId !== clientId);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((prev) => {
      for (const it of prev) {
        if (it.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
      }
      return [];
    });
  }, []);

  const retry = useCallback(
    (clientId) => {
      const item = itemsRef.current.find((x) => x.clientId === clientId);
      if (item?.file) void runUpload(clientId, item.file);
    },
    [runUpload],
  );

  const hasUploading = useCallback(() => {
    return itemsRef.current.some(
      (it) => it.status === "uploading" || it.status === "pending",
    );
  }, []);

  const hasErrors = useCallback(() => {
    return itemsRef.current.some((it) => it.status === "error");
  }, []);

  const getAttachmentIds = useCallback(() => {
    return itemsRef.current
      .filter((it) => it.status === "done" && it.attachmentId)
      .map((it) => Number(it.attachmentId));
  }, []);

  useEffect(() => {
    return () => {
      for (const it of itemsRef.current) {
        if (it.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    clearAll();
  }, [dispatchId, clearAll]);

  return {
    items,
    addFiles,
    removeItem,
    retry,
    clearAll,
    hasUploading,
    hasErrors,
    getAttachmentIds,
  };
}
