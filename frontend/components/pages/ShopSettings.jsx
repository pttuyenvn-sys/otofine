"use client";

/**
 * ShopSettings — Phase A merge / Phase B+ rich content
 *
 * Single source of truth for all shop configuration.  Replaces both
 * the old `/shop/settings` (basic info via /api/shop/me) and the
 * now-redirected `/shop/public-page` (storefront via /api/shop/public-page).
 *
 * Sections
 *   A. Basic info         → PUT /api/shop/me   (FormData, backward-compat)
 *   B. Public storefront  ┐
 *   C. Branding           ├ → PUT /api/shop/public-page  (JSON + R2 uploads)
 *   D. Intro content      │
 *   E. Contact & social   ┘
 *
 * Legacy rich-text fields:
 *   - `salePolicy` / `warrantyPolicy` → rich Tiptap (Phase B+ policy mode)
 *   - `descriptionHtml` → REMOVED from UI in Phase B+ (the storefront
 *     intro replaced it).  Backend still keeps the column populated as
 *     a fallback for SSR consumers; this form simply never sends it,
 *     and the controller's PATCH semantics preserve the existing value.
 *
 * Backward-compatibility guarantees:
 *   - /api/shop/me response shape is NEVER changed here
 *   - /api/shop/public-page response shape is NEVER changed here
 *   - DB columns are not renamed
 *   - Existing consumers of both APIs keep working
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  getMyShop,
  createShop,
  updateMyShop,
} from "../../api/shopApi";

import {
  getMyPublicPage,
  updateMyPublicPage,
  checkSlugAvailability,
  uploadAvatar,
  uploadCover,
} from "../../api/shopPublicPageApi";

import ShopAddressSelector from "../ShopAddressSelector";
import ShopRichEditorWithPreview from "../shopsite/ShopRichEditorWithPreview";
import ShopPolicyEditor from "../shopsite/ShopPolicyEditor";
import ShopCompletionPanel from "./shop-settings/ShopCompletionPanel";
import { buildShopLoginUrl, getCurrentShopReturnPath } from "@/lib/auth/safeShopRedirect";
import { slugifyVi } from "@/lib/seo/slugify";
import { normalizeRichHtml } from "@/lib/shopsite/normalizeRichHtml";

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function useDebouncedValue(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function useSlugStatus(slug, originalSlug) {
  const debounced = useDebouncedValue(slug, 350);
  const [status, setStatus] = useState({ state: "idle" });
  useEffect(() => {
    let cancelled = false;
    const value = (debounced || "").trim().toLowerCase();
    if (!value) { setStatus({ state: "idle" }); return; }
    if (value === (originalSlug || "").toLowerCase()) {
      setStatus({ state: "ok", message: "Slug hiện tại của shop bạn", mine: true });
      return;
    }
    setStatus({ state: "checking" });
    checkSlugAvailability(value)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.available) {
          setStatus({ state: "ok", message: res.data.mine ? "Slug của shop bạn" : "Slug có thể dùng", mine: !!res.data.mine });
        } else {
          setStatus({ state: "bad", message: res.data?.error || "Slug không hợp lệ", code: res.data?.code });
        }
      })
      .catch(() => { if (!cancelled) setStatus({ state: "bad", message: "Không kiểm tra được slug.", code: "NETWORK" }); });
    return () => { cancelled = true; };
  }, [debounced, originalSlug]);
  return status;
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function SectionCard({ id, title, subtitle, children }) {
  return (
    <section
      id={id}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-20"
    >
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function FieldText({ label, value, onChange, placeholder, error, className = "", type = "text", maxLength, hint }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={
          "w-full px-3 py-2.5 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 " +
          (error ? "border-red-400" : "border-gray-300")
        }
      />
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function FieldTextarea({ label, value, onChange, placeholder, error, className = "", rows = 3, maxLength, hint }) {
  return (
    <div className={className}>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={
          "w-full px-3 py-2.5 rounded-lg border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 resize-y " +
          (error ? "border-red-400" : "border-gray-300")
        }
      />
      {maxLength && (
        <p className="text-xs text-gray-400 mt-1 text-right">{(value || "").length}/{maxLength}</p>
      )}
      {hint && !maxLength && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function SlugHint({ status, value }) {
  if (!value) return <p className="text-xs text-gray-400 mt-1">Chỉ chữ thường, số và dấu gạch (-). 3–40 ký tự.</p>;
  if (status.state === "checking") return <p className="text-xs text-gray-500 mt-1">Đang kiểm tra…</p>;
  if (status.state === "ok") return <p className="text-xs text-emerald-600 mt-1">✓ {status.message}</p>;
  if (status.state === "bad") return <p className="text-xs text-red-600 mt-1">✗ {status.message}</p>;
  return null;
}

function ImageUploader({ label, previewUrl, onPickFile, uploading, aspect = "1/1", helperText, maxWidth = 260 }) {
  const inputRef = useRef(null);
  const openPicker = () => { if (!uploading) inputRef.current?.click(); };
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 mb-2">{label}</p>
      <button
        type="button"
        onClick={openPicker}
        disabled={uploading}
        className={
          "group relative w-full bg-gray-50 border-2 border-dashed rounded-xl overflow-hidden text-left transition-colors " +
          (uploading
            ? "border-gray-200 cursor-wait"
            : "border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/30 cursor-pointer")
        }
        style={{ aspectRatio: aspect, maxWidth }}
        aria-label={previewUrl ? `Đổi ${label.toLowerCase()}` : `Tải ${label.toLowerCase()} lên`}
      >
        {previewUrl
          ? <img src={previewUrl} alt={label} className="w-full h-full object-cover pointer-events-none" />
          : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-1.5 pointer-events-none">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs">Bấm để chọn ảnh</span>
            </div>
          )
        }
        {!uploading && previewUrl && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
            <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Bấm để đổi ảnh</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/85 flex flex-col items-center justify-center gap-2 text-sm text-gray-700 font-medium pointer-events-none">
            <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Đang upload…
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ""; }}
      />
      {helperText && <p className="text-xs text-gray-500 mt-2">{helperText}</p>}
    </div>
  );
}

function PreviewLinks({ preview }) {
  if (!preview?.subdomain) {
    return <p className="text-sm text-gray-500">Lưu slug rồi mới có URL preview.</p>;
  }
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-gray-500 w-28 shrink-0 pt-0.5">Subdomain:</span>
        <a href={preview.subdomain} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline break-all">{preview.subdomain}</a>
      </div>
      <div className="flex items-start gap-2">
        <span className="text-gray-500 w-28 shrink-0 pt-0.5">Apex preview:</span>
        <a href={preview.apex} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline break-all">{preview.apex}</a>
      </div>
      {!preview.isLive && (
        <p className="text-xs text-amber-600">Storefront chỉ hiển thị khi trạng thái = Công khai.</p>
      )}
    </div>
  );
}

const STATUS_OPTIONS = [
  { value: "draft",     label: "Bản nháp — chưa hiển thị", hint: "Khách truy cập subdomain sẽ thấy 404." },
  { value: "public",    label: "Công khai — đang hiển thị", hint: "Subdomain hiển thị storefront cho khách." },
  { value: "suspended", label: "Tạm dừng",                  hint: "Ẩn cho đến khi bật lại." },
];

// ---------------------------------------------------------------------------
// Toast / feedback
// ---------------------------------------------------------------------------

function Toast({ feedback }) {
  if (!feedback) return null;
  return (
    <div className={
      "fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm border max-w-sm " +
      (feedback.type === "ok"
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : "bg-red-50 border-red-200 text-red-800")
    }>
      {feedback.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initial states
// ---------------------------------------------------------------------------

const EMPTY_BASIC = {
  name: "", phone: "", email: "", zalo: "", website: "",
  address: { provinceId: "", wardId: "", detail: "" },
  descriptionHtml: "", salePolicy: "", warrantyPolicy: "",
};

const EMPTY_PUBLIC = {
  slug: "", publicStatus: "draft", bio: "", introHtml: "",
  facebookUrl: "", zaloPhone: "", workingHours: "", mapEmbedUrl: "", addressDetail: "",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ShopSettings() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shopId, setShopId] = useState(null);

  const [basic, setBasic] = useState(EMPTY_BASIC);
  const [pub, setPub] = useState(EMPTY_PUBLIC);

  const [originalSlug, setOriginalSlug] = useState("");
  const [preview, setPreview] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [feedback, setFeedback] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Tracks whether the seller has manually edited the slug. Once true,
  // typing in "Tên shop" stops auto-overwriting the slug.
  const [slugDirty, setSlugDirty] = useState(false);

  const slugStatus = useSlugStatus(pub.slug, originalSlug);
  const slugBad = pub.slug && slugStatus.state === "bad";
  const canSave = !loading && !saving && !slugBad;

  // Auto-fill slug from shop name as long as:
  //   1. The seller hasn't manually edited the slug in this session
  //      (`slugDirty` stays false until they type into the slug field), AND
  //   2. The shop has no saved slug yet (`originalSlug` empty → brand-new
  //      shop or shop that has never published).
  //
  // Deliberately NOT auto-overwriting an existing saved slug — that would
  // silently rename the public subdomain URL and break inbound links.
  function setShopName(value) {
    setBasic((p) => ({ ...p, name: value }));
    if (!slugDirty && !originalSlug) {
      const auto = slugifyVi(value, { compact: true }).slice(0, 40);
      setPub((p) => ({ ...p, slug: auto }));
    }
  }

  function setB(name, value) {
    if (name === "name") return setShopName(value);
    setBasic((p) => ({ ...p, [name]: value }));
  }
  function setP(name, value) {
    if (name === "slug") setSlugDirty(true);
    setPub((p) => ({ ...p, [name]: value }));
    setFieldErrors((p) => p[name] ? { ...p, [name]: undefined } : p);
  }

  // Auto-dismiss feedback toast
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(t);
  }, [feedback]);

  // Load both APIs in parallel
  useEffect(() => {
    let mounted = true;
    Promise.all([
      getMyShop().catch((err) => {
        if (err?.response?.status === 401) router.push(buildShopLoginUrl(getCurrentShopReturnPath()));
        return null;
      }),
      getMyPublicPage().catch(() => null),
    ]).then(([shopRes, pubRes]) => {
      if (!mounted) return;
      const s = shopRes?.data || {};
      const d = pubRes?.data || {};

      if (s.id) {
        setShopId(s.id);
        try { localStorage.setItem("shopId", String(s.id)); } catch (_) {}
        setBasic({
          name: s.name || "",
          phone: s.phone || "",
          email: s.email || "",
          zalo: s.zalo || "",
          website: s.website || "",
          address: { provinceId: s.provinceId || "", wardId: s.wardId || "", detail: s.addressDetail || "" },
          descriptionHtml: s.descriptionHtml || "",
          salePolicy: s.salePolicy || "",
          warrantyPolicy: s.warrantyPolicy || "",
        });
      }

      // Public-page DTO is loaded whenever the shop record exists (slug
      // can be empty for a brand-new shop). Always hydrate so the form
      // surfaces publicStatus/bio/etc even before a slug is set.
      setPub({
        slug:          d.slug          || "",
        publicStatus:  d.publicStatus  || "draft",
        bio:           d.bio           || "",
        introHtml:     d.introHtml     || "",
        facebookUrl:   d.facebookUrl   || "",
        zaloPhone:     d.zaloPhone     || "",
        workingHours:  d.workingHours  || "",
        mapEmbedUrl:   d.mapEmbedUrl   || "",
        addressDetail: d.addressDetail || "",
      });
      setOriginalSlug(d.slug || "");
      setPreview(d.preview || null);

      // Avatar/cover live in `shops.avatar` / `shops.cover` and are
      // surfaced by both APIs. Prefer the public-page DTO (canonical)
      // and fall back to legacy `/api/shop/me` shape.
      const avatar = d.avatar     || s.avatar || null;
      const cover  = d.coverImage || s.cover  || null;
      if (avatar) setAvatarPreview(avatar);
      if (cover)  setCoverPreview(cover);
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Image upload handlers
  async function handleAvatarPick(file) {
    setUploadingAvatar(true);
    setFeedback(null);
    try {
      const res = await uploadAvatar(file);
      setAvatarPreview(res.data?.avatar || null);
      setFeedback({ type: "ok", text: "Đã cập nhật avatar." });
    } catch (err) {
      setFeedback({ type: "error", text: err?.response?.data?.error || "Upload avatar thất bại." });
    } finally { setUploadingAvatar(false); }
  }

  async function handleCoverPick(file) {
    setUploadingCover(true);
    setFeedback(null);
    try {
      const res = await uploadCover(file);
      setCoverPreview(res.data?.coverImage || null);
      setFeedback({ type: "ok", text: "Đã cập nhật ảnh bìa." });
    } catch (err) {
      setFeedback({ type: "error", text: err?.response?.data?.error || "Upload ảnh bìa thất bại." });
    } finally { setUploadingCover(false); }
  }

  // Save — calls both APIs in parallel where possible
  async function handleSave(e) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setFeedback(null);
    setFieldErrors({});
    const errors = [];
    try {
      // ── A: basic info via /api/shop/me  ────────────────────────────────
      const fd = new FormData();
      fd.append("name",          basic.name);
      fd.append("phone",         basic.phone);
      fd.append("email",         basic.email);
      fd.append("zalo",          basic.zalo);
      fd.append("website",       basic.website);
      fd.append("provinceId",    basic.address.provinceId || "");
      fd.append("wardId",        basic.address.wardId     || "");
      fd.append("addressDetail", basic.address.detail     || "");
      // descriptionHtml is no longer surfaced in the UI (Phase B+ — the
      // storefront intro replaced it). The controller skips any field
      // that's not present in the body, so the column is preserved.
      fd.append("salePolicy",     normalizeRichHtml(basic.salePolicy));
      fd.append("warrantyPolicy", normalizeRichHtml(basic.warrantyPolicy));

      // ── B–E: storefront via /api/shop/public-page  ─────────────────────
      const pubPayload = {
        slug:          pub.slug.trim(),
        public_status: pub.publicStatus,
        bio:           pub.bio,
        intro_html:    pub.introHtml,
        facebook_url:  pub.facebookUrl,
        zalo_phone:    pub.zaloPhone,
        working_hours: pub.workingHours,
        map_embed_url: pub.mapEmbedUrl,
        addressDetail: pub.addressDetail,
      };

      const [basicRes, pubRes] = await Promise.allSettled([
        shopId ? updateMyShop(fd) : createShop(fd),
        pub.slug.trim() ? updateMyPublicPage(pubPayload) : Promise.resolve(null),
      ]);

      // Handle basic info result
      if (basicRes.status === "fulfilled" && !shopId) {
        const id = basicRes.value?.data?.id;
        if (id) {
          setShopId(id);
          try { localStorage.setItem("shopId", String(id)); } catch (_) {}
        }
      }
      if (basicRes.status === "rejected") {
        errors.push("Lưu thông tin cơ bản thất bại.");
      }

      // Handle public page result
      if (pubRes.status === "fulfilled" && pubRes.value) {
        const d = pubRes.value?.data?.data;
        if (d) {
          setOriginalSlug(d.slug || "");
          setPreview(d.preview || null);
        }
      }
      if (pubRes.status === "rejected") {
        const errs = pubRes.reason?.response?.data?.errors;
        if (Array.isArray(errs)) {
          const next = {};
          for (const it of errs) { if (it.field) next[it.field] = it.message; }
          setFieldErrors(next);
        }
        errors.push(pubRes.reason?.response?.data?.error || "Lưu storefront thất bại.");
      }

      if (errors.length === 0) {
        setFeedback({ type: "ok", text: "Đã lưu tất cả thay đổi." });
      } else {
        setFeedback({ type: "error", text: errors.join(" | ") });
      }
    } catch (err) {
      setFeedback({ type: "error", text: err?.message || "Lỗi không xác định." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="main-content" style={{ padding: 24 }}>
        <div className="space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 h-36 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ padding: "16px 24px" }}>
      <Toast feedback={feedback} />

      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt Shop</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quản lý toàn bộ thông tin, storefront và liên hệ của shop.
        </p>
      </header>

      {/* Phase 5.1 — friendly completion nudge.  Computed live from
          the current form state; never blocks saving.  Avatar / cover
          live outside `pub` (they're managed via the upload endpoints
          and held in `avatarPreview` / `coverPreview` local state), so
          we splice them into the snapshot at the call site. */}
      <ShopCompletionPanel
        basic={basic}
        pub={{ ...pub, avatar: avatarPreview, coverImage: coverPreview }}
      />

      {/* Jump-to nav */}
      <nav className="mb-6 flex flex-wrap gap-2">
        {[
          ["#basic",       "Thông tin cơ bản"],
          ["#public",      "Storefront công khai"],
          ["#branding",    "Branding"],
          ["#intro",       "Giới thiệu"],
          ["#contact",     "Liên hệ & mạng xã hội"],
          ["#policies",    "Chính sách (marketplace)"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
          >
            {label}
          </a>
        ))}
      </nav>

      <form onSubmit={handleSave} className="space-y-6">
        {/* ── A. Thông tin cơ bản ─────────────────────────────────────── */}
        <SectionCard
          id="basic"
          title="A. Thông tin cơ bản"
          subtitle="Tên, số điện thoại và địa chỉ shop trên Otofine Marketplace."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldText
              label="Tên shop *"
              value={basic.name}
              onChange={(v) => setB("name", v)}
              placeholder="Tên shop của bạn"
              className="md:col-span-2"
            />
            <FieldText label="Số điện thoại" value={basic.phone} onChange={(v) => setB("phone", v)} placeholder="0901 234 567" />
            <FieldText label="Email" value={basic.email} onChange={(v) => setB("email", v)} placeholder="shop@example.com" type="email" />
            <FieldText label="Zalo (số/link)" value={basic.zalo} onChange={(v) => setB("zalo", v)} placeholder="0901 234 567" />
            <FieldText label="Website" value={basic.website} onChange={(v) => setB("website", v)} placeholder="https://example.com" type="url" />
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Địa chỉ</p>
            {/* ShopAddressSelector uses its own CSS; wrapped to isolate */}
            <div className="shop-address-wrapper">
              <ShopAddressSelector
                value={basic.address}
                onChange={(addr) => setB("address", addr)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── B. Storefront công khai ─────────────────────────────────── */}
        <SectionCard
          id="public"
          title="B. Storefront công khai"
          subtitle="Cấu hình URL subdomain và trạng thái trang public của shop."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Trạng thái</label>
              <select
                value={pub.publicStatus}
                onChange={(e) => setP("publicStatus", e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {STATUS_OPTIONS.find((o) => o.value === pub.publicStatus)?.hint}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Slug (URL subdomain)</label>
              <div className="flex items-stretch">
                <input
                  value={pub.slug}
                  onChange={(e) => setP("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  placeholder="vd: cuahangoto355"
                  maxLength={40}
                  className={
                    "flex-1 px-3 py-2.5 rounded-l-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 " +
                    (slugBad ? "border-red-400" : "border-gray-300")
                  }
                />
                <span className="px-3 inline-flex items-center text-sm text-gray-500 bg-gray-50 border border-l-0 border-gray-300 rounded-r-lg">
                  .otofine.com
                </span>
              </div>
              <SlugHint status={slugStatus} value={pub.slug} />
              {fieldErrors.slug && <p className="text-xs text-red-600 mt-1">{fieldErrors.slug}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Preview URL</label>
              <PreviewLinks preview={preview} />
            </div>
          </div>
        </SectionCard>

        {/* ── C. Branding ─────────────────────────────────────────────── */}
        <SectionCard
          id="branding"
          title="C. Branding"
          subtitle="Ảnh đại diện và ảnh bìa hiển thị trên trang storefront. Ảnh tự động chuyển sang WebP và tối ưu kích thước."
        >
          <div className="grid gap-8 md:grid-cols-2">
            <ImageUploader
              label="Avatar"
              previewUrl={avatarPreview}
              onPickFile={handleAvatarPick}
              uploading={uploadingAvatar}
              aspect="1/1"
              helperText="Vuông. PNG / JPG / WEBP. Tối đa 5 MB. Tự động resize 512×512."
            />
            <ImageUploader
              label="Ảnh bìa (cover)"
              previewUrl={coverPreview}
              onPickFile={handleCoverPick}
              uploading={uploadingCover}
              aspect="16/6"
              helperText="Tỉ lệ 16:6 (ví dụ 1600×600). Tự động resize max-width 1600px."
            />
          </div>
        </SectionCard>

        {/* ── D. Giới thiệu ───────────────────────────────────────────── */}
        <SectionCard
          id="intro"
          title="D. Giới thiệu"
          subtitle="Nội dung xuất hiện trên trang storefront và trong danh sách Otofine."
        >
          <div className="space-y-4">
            <FieldTextarea
              label="Giới thiệu ngắn (bio)"
              value={pub.bio}
              onChange={(v) => setP("bio", v)}
              placeholder="Một câu mô tả shop, hiển thị ngay dưới tên shop."
              maxLength={255}
              rows={2}
            />
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Giới thiệu chi tiết (intro — storefront)
              </label>
              <ShopRichEditorWithPreview
                value={pub.introHtml}
                onChange={(v) => setP("introHtml", v)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── E. Liên hệ & mạng xã hội ───────────────────────────────── */}
        <SectionCard
          id="contact"
          title="E. Liên hệ & mạng xã hội"
          subtitle="Thông tin liên lạc hiển thị trên trang storefront và tab Liên hệ."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FieldText
              label="Zalo (số/link — storefront)"
              value={pub.zaloPhone}
              onChange={(v) => setP("zaloPhone", v)}
              placeholder="0901 234 567"
              hint="Hiển thị nút Zalo trên storefront. Có thể khác với Zalo ở mục A."
              error={fieldErrors.zalo_phone}
            />
            <FieldText
              label="Facebook URL"
              value={pub.facebookUrl}
              onChange={(v) => setP("facebookUrl", v)}
              placeholder="https://facebook.com/shop"
              error={fieldErrors.facebook_url}
            />
            <FieldText
              label="Địa chỉ chi tiết (storefront)"
              value={pub.addressDetail}
              onChange={(v) => setP("addressDetail", v)}
              placeholder="Số nhà, đường, phường, quận, tỉnh"
              className="md:col-span-2"
              error={fieldErrors.addressDetail}
            />
            <FieldText
              label="Giờ làm việc"
              value={pub.workingHours}
              onChange={(v) => setP("workingHours", v)}
              placeholder="08:00 - 18:00 (T2 - T7)"
              error={fieldErrors.working_hours}
            />
            <FieldText
              label="Google Maps embed URL"
              value={pub.mapEmbedUrl}
              onChange={(v) => setP("mapEmbedUrl", v)}
              placeholder="https://www.google.com/maps/embed?pb=…"
              error={fieldErrors.map_embed_url}
            />
          </div>
        </SectionCard>

        {/* ── F. Chính sách (rich) ────────────────────────────────────── */}
        <SectionCard
          id="policies"
          title="F. Chính sách"
          subtitle="Hiển thị trên trang sản phẩm Otofine.com. Hỗ trợ ảnh, video và định dạng cơ bản."
        >
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Chính sách bán hàng
              </label>
              <ShopPolicyEditor
                value={basic.salePolicy}
                onChange={(v) => setB("salePolicy", v)}
                placeholder="Nhập chính sách bán hàng — đổi trả, thanh toán, vận chuyển…"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Chính sách bảo hành
              </label>
              <ShopPolicyEditor
                value={basic.warrantyPolicy}
                onChange={(v) => setB("warrantyPolicy", v)}
                placeholder="Nhập chính sách bảo hành — thời hạn, điều kiện áp dụng…"
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Sticky save bar ─────────────────────────────────────────── */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-3 -mx-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 z-20">
          <p className="text-xs text-gray-500 mr-auto">
            {slugBad
              ? "Sửa lỗi slug trước khi lưu."
              : "Lưu sẽ cập nhật cả thông tin cơ bản lẫn storefront."}
          </p>
          <a
            href="/shop/change-password"
            className="text-sm text-gray-500 hover:text-gray-700 underline self-center mr-4"
          >
            Đổi mật khẩu
          </a>
          <button
            type="submit"
            disabled={!canSave}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </form>
    </div>
  );
}
