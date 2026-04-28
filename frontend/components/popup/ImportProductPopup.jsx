"use client";

import { useState } from "react";
import axiosClient from "../../api/axiosClient";
import "./ImportImagePopup.css";

export default function ImportProductPopup({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleImport = async () => {
    if (!file) {
      alert("Vui lòng chọn file Excel");
      return;
    }

    try {
      setLoading(true);
      setProgress(0);

      const formData = new FormData();
      formData.append("file", file);

      const res = await axiosClient.post("/products/import", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (evt) => {
          if (evt.total) {
            const percent = Math.round((evt.loaded * 100) / evt.total);
            setProgress(percent);
          }
        },
      });

      if (res.data.partial) {
        alert("Import thành công một phần!\n\n" + res.data.message);
      } else {
        alert("Import thành công!");
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="PopupOverlay" onClick={onClose}>
      <div className="PopupContent" onClick={(e) => e.stopPropagation()}>
        <h3>Import sản phẩm Excel</h3>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files[0])}
        />

        {file && (
          <ul>
            <li>{file.name}</li>
          </ul>
        )}

        {loading && (
          <div className="ProgressBox">
            <div className="ProgressBar">
              <div
                className="ProgressFill"
                style={{
                  width: progress + "%",
                }}
              />
            </div>

            <div className="ProgressText">{progress}%</div>
          </div>
        )}

        <button onClick={handleImport} disabled={loading}>
          {loading ? "Đang import..." : "Bắt đầu Import"}
        </button>

        <button onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}
