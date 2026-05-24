"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

import {
  checkSlugAvailability,
  getMyPublicPage,
  updateMyPublicPage,
  uploadAvatar,
  uploadCover,
} from "../../api/shopPublicPageApi";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, 4, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link", "blockquote"],
    ["clean"],
  ],
};

const QUILL_FORMATS = [
  "header", "bold", "italic", "underline",
  "list", "bullet", "link", "blockquote",
];

const STATUS_OPTIONS = [
  { value: "draft",     label: "Bản nháp (chưa hiển thị)", hint: "Subdomain trả 404. Khách không thấy gì." },
  { value: "public",    label: "Công khai (hiển thị)",      hint: "Subdomain hiển thị storefront." },
  { value: "suspended", label: "Tạm dừng",                 hint: "Subdomain ẩn cho đến khi bật lại." },
];

const EMPTY_FORM = {
  slug: "",
  publicStatus: "draft",
  bio: "",
  introHtml: "",
  facebookUrl: "",
  zaloPhone: "",
  workingHours: "",
  mapEmbedUrl: "",
  addressDetail: "",
};

function useDebouncedValue(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Realtime slug availability check.
 * Returns one of:
 *   { state: "idle"  }
 *   { state: "checking" }
 *   { state: "ok",       message, mine }
 *   { state: "bad",      message, code }
 */
function useSlugStatus(slug, originalSlug) {
  const debounced = useDebouncedValue(slug, 350);
  const [status, setStatus] = useState({ state: "idle" });
  useEffect(() => {
    let cancelled = false;
    const value = (debounced || "").trim().toLowerCase();
    if (!value) {
      setStatus({ state: "idle" });
      return;
    }
    if (value === (originalSlug || "").toLowerCase()) {
      setStatus({ state: "ok", message: "Slug hiện tại của shop bạn", mine: true });
      return;
    }
    setStatus({ state: "checking" });
    checkSlugAvailability(value)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.available) {
          setStatus({
            state: "ok",
            message: res.data.mine ? "Slug của shop bạn" : "Slug có thể dùng",
            mine: !!res.data.mine,
          });
        } else {
          setStatus({
            state: "bad",
            message: res.data?.error || "Slug không hợp lệ",
            code: res.data?.code,
          });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus({ state: "bad", message: "Không kiểm tra được slug. Thử lại sau.", code: "NETWORK" });
      });
    return () => { cancelled = true; };
  }, [debounced, originalSlug]);
  return status;
}

function PreviewLinks({ preview }) {
  if (!preview?.subdomain) {
    return (
      <div className="text-sm text-gray-500">
        Lưu slug rồi mới có URL preview.
      </div>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-gray-500 w-24 shrink-0">Subdomain:</span>
        <a
          href={preview.subdomain}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:underline break-all"
        >
          {preview.subdomain}
        </a>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-gray-500 w-24 shrink-0">Apex preview:</span>
        <a
          href={preview.apex}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-600 hover:underline break-all"
        >
          {preview.apex}
        </a>
      </div>
      {!preview.isLive && (
        <div className="text-xs text-amber-600">
          Storefront chỉ hiển thị khi trạng thái = Công khai.
        </div>
      )}
    </div>
  );
}

function ImageUploader({
  label,
  previewUrl,
  onPickFile,
  uploading,
  aspect = "1/1",
  helperText,
}) {
  const inputRef = useRef(null);
  return (
    <div>
      <div className="text-sm font-semibold text-gray-700 mb-2">{label}</div>
      <div
        className="relative w-full max-w-[280px] bg-gray-100 border border-dashed border-gray-300 rounded-xl overflow-hidden"
        style={{ aspectRatio: aspect }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Chưa có ảnh
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-sm text-gray-600">
            Đang upload…
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="mt-2 inline-flex items-center px-3 py-1.5 text-sm rounded-lg bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {previewUrl ? "Đổi ảnh" : "Tải ảnh lên"}
      </button>
      {helperText && (
        <div className="text-xs text-gray-500 mt-1">{helperText}</div>
      )}
    </div>
  );
}

export default function ShopPublicPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [originalSlug, setOriginalSlug] = useState("");
  const [preview, setPreview] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [feedback, setFeedback] = useState(null);   // { type: 'ok'|'error', text }
  const [fieldErrors, setFieldErrors] = useState({});

  const slugStatus = useSlugStatus(form.slug, originalSlug);

  useEffect(() => {
    let mounted = true;
    getMyPublicPage()
      .then((res) => {
        if (!mounted) return;
        const d = res.data || {};
        setForm({
          slug: d.slug || "",
          publicStatus: d.publicStatus || "draft",
          bio: d.bio || "",
          introHtml: d.introHtml || "",
          facebookUrl: d.facebookUrl || "",
          zaloPhone: d.zaloPhone || "",
          workingHours: d.workingHours || "",
          mapEmbedUrl: d.mapEmbedUrl || "",
          addressDetail: d.addressDetail || "",
        });
        setOriginalSlug(d.slug || "");
        setPreview(d.preview || null);
        setAvatarPreview(d.avatar || null);
        setCoverPreview(d.coverImage || null);
      })
      .catch(() => setFeedback({ type: "error", text: "Không tải được dữ liệu shop." }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const slugLooksWrong = useMemo(() => {
    if (!form.slug) return false;
    return slugStatus.state === "bad";
  }, [form.slug, slugStatus]);

  const canSave = !loading && !saving && !slugLooksWrong && form.slug.trim();

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  }

  async function handleAvatarPick(file) {
    setUploadingAvatar(true);
    setFeedback(null);
    try {
      const res = await uploadAvatar(file);
      setAvatarPreview(res.data?.avatar || null);
      setFeedback({ type: "ok", text: "Đã cập nhật avatar." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.response?.data?.error || "Upload avatar thất bại.",
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleCoverPick(file) {
    setUploadingCover(true);
    setFeedback(null);
    try {
      const res = await uploadCover(file);
      setCoverPreview(res.data?.coverImage || null);
      setFeedback({ type: "ok", text: "Đã cập nhật ảnh bìa." });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.response?.data?.error || "Upload ảnh bìa thất bại.",
      });
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    try {
      const payload = {
        slug: form.slug.trim(),
        public_status: form.publicStatus,
        bio: form.bio,
        intro_html: form.introHtml,
        facebook_url: form.facebookUrl,
        zalo_phone: form.zaloPhone,
        working_hours: form.workingHours,
        map_embed_url: form.mapEmbedUrl,
        addressDetail: form.addressDetail,
      };
      const res = await updateMyPublicPage(payload);
      const d = res.data?.data;
      if (d) {
        setOriginalSlug(d.slug || "");
        setPreview(d.preview || null);
      }
      setFeedback({ type: "ok", text: "Đã lưu cấu hình storefront." });
    } catch (err) {
      const errs = err?.response?.data?.errors;
      if (Array.isArray(errs)) {
        const next = {};
        for (const it of errs) {
          if (it.field) next[it.field] = it.message;
        }
        setFieldErrors(next);
        setFeedback({ type: "error", text: "Có lỗi cần sửa trước khi lưu." });
      } else {
        setFeedback({
          type: "error",
          text: err?.response?.data?.error || "Lưu thất bại.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="main-content" style={{ padding: 24 }}>
        Đang tải…
      </div>
    );
  }

  return (
    <div className="main-content" style={{ padding: "16px 24px" }}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Trang public của shop</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cấu hình URL, branding và nội dung hiển thị trên storefront
          riêng của shop (subdomain). Phần này độc lập với "Shop" cũ và
          chưa bật Google indexing.
        </p>
      </header>

      {feedback && (
        <div
          className={
            "mb-5 px-4 py-3 rounded-lg text-sm border " +
            (feedback.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800")
          }
        >
          {feedback.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            1. Trang public
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Trạng thái
              </label>
              <select
                value={form.publicStatus}
                onChange={(e) => setField("publicStatus", e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="text-xs text-gray-500 mt-1">
                {STATUS_OPTIONS.find((o) => o.value === form.publicStatus)?.hint}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Slug (URL subdomain)
              </label>
              <div className="flex items-stretch">
                <input
                  value={form.slug}
                  onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  placeholder="vd: cuahangoto355"
                  maxLength={40}
                  className={
                    "flex-1 p-2.5 rounded-l-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 " +
                    (slugLooksWrong ? "border-red-400" : "border-gray-300")
                  }
                />
                <span className="px-3 inline-flex items-center text-sm text-gray-500 bg-gray-50 border border-l-0 border-gray-300 rounded-r-lg">
                  .otofine.com
                </span>
              </div>
              <SlugHint status={slugStatus} value={form.slug} />
              {fieldErrors.slug && (
                <div className="text-xs text-red-600 mt-1">{fieldErrors.slug}</div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Preview
              </label>
              <PreviewLinks preview={preview} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            2. Branding
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <ImageUploader
              label="Avatar"
              previewUrl={avatarPreview}
              onPickFile={handleAvatarPick}
              uploading={uploadingAvatar}
              aspect="1/1"
              helperText="Vuông, PNG / JPG / WEBP. Tối đa 5MB."
            />
            <ImageUploader
              label="Ảnh bìa (cover)"
              previewUrl={coverPreview}
              onPickFile={handleCoverPick}
              uploading={uploadingCover}
              aspect="16/6"
              helperText="Tỉ lệ rộng 16:6, tối thiểu 1200x450. Tối đa 5MB."
            />
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Giới thiệu ngắn (bio)
              </label>
              <textarea
                value={form.bio}
                onChange={(e) => setField("bio", e.target.value)}
                maxLength={255}
                rows={2}
                placeholder="Một câu mô tả shop, hiển thị ngay dưới tên shop."
                className="w-full p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="text-xs text-gray-400 mt-1 text-right">{form.bio.length}/255</div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            3. Giới thiệu chi tiết
          </h2>
          <div className="quill-host">
            <ReactQuill
              theme="snow"
              value={form.introHtml}
              onChange={(html) => setField("introHtml", html)}
              modules={QUILL_MODULES}
              formats={QUILL_FORMATS}
            />
          </div>
          <div className="text-xs text-gray-500 mt-2">
            HTML sẽ được lọc lại trên server: <code>script</code>, <code>iframe</code>,
            event handler và <code>javascript:</code> link sẽ bị loại bỏ tự động.
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            4. Liên hệ
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            <FieldText
              label="Zalo (số / link)"
              value={form.zaloPhone}
              onChange={(v) => setField("zaloPhone", v)}
              placeholder="0901 234 567"
              error={fieldErrors.zalo_phone}
            />
            <FieldText
              label="Facebook URL"
              value={form.facebookUrl}
              onChange={(v) => setField("facebookUrl", v)}
              placeholder="https://facebook.com/shop"
              error={fieldErrors.facebook_url}
            />
            <FieldText
              className="md:col-span-2"
              label="Địa chỉ chi tiết"
              value={form.addressDetail}
              onChange={(v) => setField("addressDetail", v)}
              placeholder="Số nhà, đường, phường, quận, tỉnh"
              error={fieldErrors.addressDetail}
            />
            <FieldText
              label="Giờ làm việc"
              value={form.workingHours}
              onChange={(v) => setField("workingHours", v)}
              placeholder="08:00 - 18:00 (T2 - T7)"
              error={fieldErrors.working_hours}
            />
            <FieldText
              label="Map embed URL"
              value={form.mapEmbedUrl}
              onChange={(v) => setField("mapEmbedUrl", v)}
              placeholder="https://www.google.com/maps/embed?pb=…"
              error={fieldErrors.map_embed_url}
            />
          </div>
        </section>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3 -mx-4 sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
          <div className="text-xs text-gray-500 mr-auto">
            {slugLooksWrong
              ? "Bạn cần sửa lỗi slug trước khi lưu."
              : "Lưu sẽ áp dụng ngay cho subdomain và trang public."}
          </div>
          <button
            type="submit"
            disabled={!canSave}
            className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldText({ label, value, onChange, placeholder, error, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-700 mb-2">
        {label}
      </label>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "w-full p-2.5 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 " +
          (error ? "border-red-400" : "border-gray-300")
        }
      />
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

function SlugHint({ status, value }) {
  if (!value) {
    return (
      <div className="text-xs text-gray-400 mt-1">
        Chỉ chữ thường, số và dấu gạch (-). 3–40 ký tự.
      </div>
    );
  }
  if (status.state === "checking") {
    return <div className="text-xs text-gray-500 mt-1">Đang kiểm tra…</div>;
  }
  if (status.state === "ok") {
    return (
      <div className="text-xs text-emerald-600 mt-1">
        ✓ {status.message}
      </div>
    );
  }
  if (status.state === "bad") {
    return <div className="text-xs text-red-600 mt-1">✗ {status.message}</div>;
  }
  return null;
}
