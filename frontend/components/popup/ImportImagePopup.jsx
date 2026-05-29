"use client";

import { useState, useRef, useEffect } from "react";
import axiosClient from "@/api/axiosClient";
import { API_BASE } from "@/lib/config";
import "./ImportImagePopup.css";

export default function ImportImagePopup({ show, onClose }) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [done, setDone] = useState(false);
  const uploadAbortRef = useRef(null);

  useEffect(() => {
    return () => {
      try {
        uploadAbortRef.current?.abort?.();
      } catch {}
    };
  }, []);

  if (!show) return null;

  const handleSelect = (e) => {
    const selectedFiles = [...e.target.files];

    if (selectedFiles.length > 200) {
      alert("Mỗi lần chỉ được tải tối đa 200 ảnh.");
      e.target.value = "";
      return;
    }

    setFiles(selectedFiles);

    // reset trạng thái cũ
    setDone(false);
    setProgress(0);
    setStatusText("");
  };

  const handleUpload = async () => {
    if (files.length === 0) return alert("Chưa chọn ảnh!");

    const form = new FormData();
    files.forEach((f) => form.append("images", f));

    setUploading(true);
    setDone(false);
    setProgress(0);
    setStatusText("Đang tải ảnh...");

    const controller = new AbortController();
    const signal = controller.signal;
    // attach controller so we can abort if the component unmounts
    uploadAbortRef.current = controller;

    try {
      const res = await axiosClient.post("/products/images/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
          setStatusText(percent < 100 ? "Đang tải ảnh..." : "Đang xử lý ảnh trên server...");
        },
        signal,
        timeout: 0,
      });

      setUploading(false);
      setDone(true);
      setProgress(100);
      setStatusText("Đã tải xong ảnh thành công");
      setFiles([]);
    } catch (err) {
      if (axiosClient.isCancel?.(err) || err.name === "CanceledError") {
        // aborted — keep previous UI state minimal
      } else {
        console.error("Upload error:", err);
        alert("Lỗi khi upload ảnh");
      }
      setUploading(false);
    } finally {
      uploadAbortRef.current = null;
    }
  };

  return (
    <div className="PopupOverlay">
      <div className="PopupContent">
        <h3>Import ảnh sản phẩm</h3>

        <input type="file" multiple accept="image/*" onChange={handleSelect} />

        <ul>
          {files.map((f, i) => (
            <li key={i}>{f.name}</li>
          ))}
        </ul>

        {(uploading || done) && (
          <div className="ProgressBox">
            <div className="ProgressBar">
              <div
                className="ProgressFill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="ProgressText">
              {done
                ? "✅ Đã tải xong ảnh thành công"
                : `${progress}% ${statusText}`}
            </div>
          </div>
        )}

        <button onClick={handleUpload} disabled={uploading}>
          {uploading ? "Đang tải..." : done ? "Đã xong" : "Tải ảnh lên"}
        </button>
        <button onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}
