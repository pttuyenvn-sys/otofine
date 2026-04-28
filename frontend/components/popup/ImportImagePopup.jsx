"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/config";
import "./ImportImagePopup.css";

export default function ImportImagePopup({ show, onClose }) {
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [done, setDone] = useState(false);

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

  const handleUpload = () => {
    if (files.length === 0) return alert("Chưa chọn ảnh!");

    const form = new FormData();
    files.forEach((f) => form.append("images", f));

    const xhr = new XMLHttpRequest();

    xhr.open("POST", `${API_BASE}/products/images/import`);

    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${localStorage.getItem("token")}`,
    );

    setUploading(true);
    setDone(false);
    setProgress(0);
    setStatusText("Đang tải ảnh...");

    // progress %
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setProgress(percent);

        if (percent < 100) {
          setStatusText("Đang tải ảnh...");
        } else {
          setStatusText("Đang xử lý ảnh trên server...");
        }
      }
    };

    xhr.upload.onload = () => {
      setProgress(100);
    };

    xhr.onload = () => {
      setUploading(false);
      setDone(true);
      setProgress(100);
      setStatusText("Đã tải xong ảnh thành công");

      if (xhr.status !== 200) {
        alert(`Upload lỗi (${xhr.status})`);
        return;
      }

      setFiles([]);
    };

    xhr.onerror = () => {
      setUploading(false);
      alert("Lỗi khi upload ảnh");
    };

    xhr.send(form);
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
