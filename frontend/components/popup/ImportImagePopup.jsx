"use client";

import { useState, useRef, useEffect } from "react";
import axiosClient from "@/api/axiosClient";
import "./ImportImagePopup.css";

const SUCCESS_RESET_MS = 2000;

export default function ImportImagePopup({ show, onClose }) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [success, setSuccess] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const fileInputRef = useRef(null);
  const uploadAbortRef = useRef(null);
  const resetTimeoutRef = useRef(null);
  const hadSuccessRef = useRef(false);

  const resetPopup = () => {
    console.log("BEFORE_RESET");

    setFiles([]);
    setUploading(false);
    setProgress(0);
    setSuccess(false);
    setStatusText("");
    setUploadedCount(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cancelScheduledReset = () => {
    if (resetTimeoutRef.current != null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelScheduledReset();
      try {
        uploadAbortRef.current?.abort?.();
      } catch {}
      uploadAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (show) return;
    cancelScheduledReset();
    resetPopup();
  }, [show]);

  useEffect(() => {
    if (success) {
      hadSuccessRef.current = true;
    }

    if (
      hadSuccessRef.current &&
      !success &&
      !uploading &&
      files.length === 0 &&
      progress === 0
    ) {
      console.log("AFTER_RESET", {
        filesLength: files.length,
        uploading,
        success,
        progress,
      });
      hadSuccessRef.current = false;
    }
  }, [success, uploading, files.length, progress]);

  const handleSelect = (e) => {
    if (uploading || success) return;

    const selectedFiles = [...e.target.files];

    if (selectedFiles.length > 200) {
      alert("Mỗi lần chỉ được tải tối đa 200 ảnh.");
      e.target.value = "";
      return;
    }

    setFiles(selectedFiles);
    setProgress(0);
    setStatusText("");
  };

  const handleUpload = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (uploading || success) return;

    if (files.length === 0) {
      alert("Chưa chọn ảnh!");
      return;
    }

    cancelScheduledReset();

    const form = new FormData();
    files.forEach((f) => form.append("images", f));

    setUploading(true);
    setSuccess(false);
    setProgress(0);
    setStatusText("Đang tải ảnh...");

    const controller = new AbortController();
    uploadAbortRef.current = controller;

    try {
      const res = await axiosClient.post("/products/images/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
          setStatusText(
            percent < 100
              ? "Đang tải ảnh..."
              : "Đang xử lý ảnh trên server...",
          );
        },
        signal: controller.signal,
        timeout: 0,
      });

      const imported = Number(res.data?.imported) || 0;
      const ok = res.data?.success === true && imported > 0;

      if (!ok) {
        const detail =
          res.data?.failed?.[0]?.reason ||
          res.data?.message ||
          "Import thất bại";
        alert(`Lỗi khi upload ảnh: ${detail}`);
        setUploading(false);
        return;
      }

      setUploading(false);
      setProgress(100);
      setUploadedCount(imported);
      setStatusText("Đã tải xong ảnh thành công");
      setSuccess(true);

      window.dispatchEvent(new Event("reload-products"));

      resetTimeoutRef.current = window.setTimeout(() => {
        resetTimeoutRef.current = null;
        console.log("RUN_RESET");
        resetPopup();
      }, SUCCESS_RESET_MS);
    } catch (err) {
      if (axiosClient.isCancel?.(err) || err.name === "CanceledError") {
        // aborted
      } else {
        console.error("Upload error:", err);
        alert("Lỗi khi upload ảnh");
      }
      setUploading(false);
    } finally {
      uploadAbortRef.current = null;
    }
  };

  const handleClose = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (uploading) return;
    cancelScheduledReset();
    resetPopup();
    onClose?.();
  };

  const hasFiles = files.length > 0;
  const showSuccess = success;
  const uploadDisabled = uploading || success;
  const canUpload = hasFiles && !uploading && !success;
  const fileInputRenderKey = `${success}-${files.length}-${uploading}`;

  console.log("RENDER", {
    show,
    filesLength: files.length,
    uploading,
    success,
    progress,
    showSuccess,
    uploadDisabled,
    hasFiles,
    canUpload,
    fileInputRenderKey,
  });

  if (!show) return null;

  return (
    <div className="PopupOverlay">
      <div className="PopupContent ImportImagePopup">
        <h3>Import ảnh sản phẩm</h3>

        <input
          key={fileInputRenderKey}
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleSelect}
          disabled={uploading}
        />

        {hasFiles ? (
          <ul>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>{f.name}</li>
            ))}
          </ul>
        ) : null}

        {uploading ? (
          <div className="ProgressBox">
            <div className="ProgressBar">
              <div
                className="ProgressFill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="ProgressText">
              {progress}% {statusText}
            </div>
          </div>
        ) : null}

        {showSuccess ? (
          <p className="ImportImagePopup__success">
            ✅ {uploadedCount > 0 ? `${uploadedCount} ảnh — ` : ""}
            Đã tải xong ảnh thành công
          </p>
        ) : null}

        <div className="ImportImagePopup__actions">
          <button
            type="button"
            className="ImportImagePopup__uploadBtn"
            onClick={handleUpload}
            disabled={uploadDisabled}
          >
            {uploading ? "Đang tải..." : "Tải ảnh lên"}
          </button>
          <button
            type="button"
            className="ImportImagePopup__closeBtn"
            onClick={handleClose}
            disabled={uploading}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
