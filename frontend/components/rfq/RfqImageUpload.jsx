"use client";

import RfqImageUploadSection from "@/components/rfq/RfqImageUploadSection";

const SECTIONS = [
  {
    key: "part",
    title: "Ảnh phụ tùng",
    hint: "Ảnh chi tiết bộ phận, vị trí lỗi hoặc mã trên phụ tùng.",
    capture: "environment",
  },
  {
    key: "registration",
    title: "Giấy đăng ký xe",
    hint: "Ảnh cà vẹt / đăng ký giúp shop xác định đúng xe.",
    capture: "environment",
  },
  {
    key: "vehicle",
    title: "Ảnh xe",
    hint: "Toàn cảnh hoặc góc xe liên quan phụ tùng cần báo giá.",
    capture: "environment",
  },
];

export default function RfqImageUpload({
  sections,
  addFiles,
  removeItem,
  retryUpload,
  canUpload,
  uploadBlockedHint,
  maxPerSection = 6,
  sectionRejectMessages = {},
}) {
  return (
    <div className="rfq-upload-root">
      <p className="rfq-upload-intro muted">
        Thêm ảnh để shop báo giá chính xác hơn (JPG, PNG, WebP — tối đa 5MB/ảnh, tối đa 10 ảnh).
      </p>
      {SECTIONS.map((cfg) => (
        <RfqImageUploadSection
          key={cfg.key}
          sectionKey={cfg.key}
          title={cfg.title}
          hint={cfg.hint}
          capture={cfg.capture}
          items={sections[cfg.key] || []}
          maxCount={maxPerSection}
          canUpload={canUpload}
          uploadBlockedHint={uploadBlockedHint}
          onAddFiles={(files) => addFiles(cfg.key, files)}
          onRemove={(id) => removeItem(cfg.key, id)}
          onRetry={(id) => retryUpload(cfg.key, id)}
          rejectMessage={sectionRejectMessages[cfg.key] || ""}
        />
      ))}
    </div>
  );
}
