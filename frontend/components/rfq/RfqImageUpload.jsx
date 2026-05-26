"use client";

import RfqImageUploadSection from "@/components/rfq/RfqImageUploadSection";

const SECTIONS = [
  { key: "part", title: "Ảnh phụ tùng (Chụp mới hoặc chọn từ máy)" },
  { key: "registration", title: "Ảnh đăng kiểm xe (Chụp mới hoặc chọn từ máy)" },
  { key: "vehicle", title: "Ảnh xe thực tế (Chụp mới hoặc chọn từ máy)" },
];

export default function RfqImageUpload({
  sections,
  addFiles,
  removeItem,
  retryUpload,
  canUpload,
  maxPerSection = 6,
  sectionRejectMessages = {},
}) {
  return (
    <div className="rfq-upload-root">
      {SECTIONS.map((cfg) => (
        <RfqImageUploadSection
          key={cfg.key}
          title={cfg.title}
          items={sections[cfg.key] || []}
          maxCount={maxPerSection}
          canUpload={canUpload}
          onAddFiles={(files) => addFiles(cfg.key, files)}
          onRemove={(id) => removeItem(cfg.key, id)}
          onRetry={(id) => retryUpload(cfg.key, id)}
          rejectMessage={sectionRejectMessages[cfg.key] || ""}
        />
      ))}
    </div>
  );
}
