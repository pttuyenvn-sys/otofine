"use client";

/**
 * ShopRichEditor — Tiptap-based rich content editor for the seller's
 * storefront `intro_html`.
 *
 * Architecture
 *   - The editor itself is client-only (uses ProseMirror, contentEditable).
 *     The parent file dynamically imports this module so the bundle
 *     doesn't leak into SSR.
 *   - All output is HTML. The server runs `sanitizeShopHtml` on every
 *     PUT, so any tag the editor invents that the sanitizer doesn't
 *     recognise will be silently dropped — which is fine for v1.
 *   - Embeds (YouTube / TikTok / Facebook) are inserted as plain
 *     `<div class="shop-embed ..."><iframe src="..."></iframe></div>`,
 *     i.e. exactly the markup the renderer + sanitizer expects.
 *   - CTAs are inserted as `<a class="shop-cta shop-cta--<kind>" ...>`,
 *     again matching the renderer + sanitizer contract.
 *
 * Live preview lives in a sibling component (`ShopRichEditorWithPreview`)
 * so this file stays focused on the editing surface.
 */

import { useCallback, useEffect, useImperativeHandle, forwardRef, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

import { uploadContentImage } from "../../api/shopRichContentApi";
import {
  parseYouTubeEmbed,
  parseTikTokEmbed,
  parseFacebookEmbed,
  detectEmbedProvider,
} from "../../lib/shopsite/embedParsers";

import "./ShopRichEditor.css";

// ----- Helpers ----------------------------------------------------------

/**
 * Build the embed div+iframe HTML for the 3 providers. Returns null
 * if the URL doesn't match any provider — caller shows an error.
 */
function buildEmbedHtml(url) {
  const provider = detectEmbedProvider(url);
  if (!provider) return null;
  let src = null;
  if (provider === "youtube") src = parseYouTubeEmbed(url);
  else if (provider === "tiktok") src = parseTikTokEmbed(url);
  else if (provider === "facebook") src = parseFacebookEmbed(url);
  if (!src) return null;
  // The renderer + sanitizer style + allow only `shop-embed` wrappers.
  return `<div class="shop-embed shop-embed--${provider}"><iframe src="${src}" allowfullscreen loading="lazy"></iframe></div><p></p>`;
}

const CTA_OPTIONS = [
  { kind: "call",     label: "Gọi ngay",     defaultHref: "tel:" },
  { kind: "zalo",     label: "Nhắn Zalo",    defaultHref: "https://zalo.me/" },
  { kind: "facebook", label: "Xem Facebook", defaultHref: "https://facebook.com/" },
];

function buildCtaHtml(kind, href, label) {
  const safeKind = ["call", "zalo", "facebook"].includes(kind) ? kind : "call";
  const safeHref = href || "#";
  const text = label || CTA_OPTIONS.find((c) => c.kind === safeKind).label;
  const target = safeHref.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<p><a class="shop-cta shop-cta--${safeKind}" href="${safeHref}"${target}>${text}</a></p>`;
}

// ----- Toolbar button (small primitive) ---------------------------------

function ToolbarBtn({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        "px-2.5 py-1.5 rounded text-sm transition-colors " +
        (active
          ? "bg-emerald-100 text-emerald-700"
          : "text-gray-600 hover:bg-gray-100") +
        " disabled:opacity-40 disabled:cursor-not-allowed"
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

// ----- Main editor ------------------------------------------------------

const ShopRichEditor = forwardRef(function ShopRichEditor(
  { value, onChange, placeholder = "Bắt đầu viết giới thiệu shop của bạn…" },
  ref,
) {
  const [uploadingPct, setUploadingPct] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const editor = useEditor({
    immediatelyRender: false, // Critical: avoid SSR hydration mismatch under Next.js
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: false, // we use the dedicated extension for security defaults
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        protocols: ["http", "https", "mailto", "tel"],
        autolink: true,
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: { class: "shop-content-img", loading: "lazy" },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "shop-editor-content prose prose-sm sm:prose-base max-w-none focus:outline-none",
      },
      handlePaste(view, event) {
        // Image paste from clipboard
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find((it) => it.type.startsWith("image/"));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) {
            event.preventDefault();
            uploadAndInsert(file);
            return true;
          }
        }
        // URL paste → auto-embed if it's a known provider
        const text = event.clipboardData?.getData("text/plain") || "";
        if (text && detectEmbedProvider(text.trim())) {
          const html = buildEmbedHtml(text.trim());
          if (html) {
            event.preventDefault();
            editor?.commands.insertContent(html);
            return true;
          }
        }
        return false;
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || []);
        const img = files.find((f) => f.type.startsWith("image/"));
        if (img) {
          event.preventDefault();
          uploadAndInsert(img);
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
  });

  useImperativeHandle(ref, () => ({
    getHtml: () => editor?.getHTML() || "",
    setHtml: (html) => editor?.commands.setContent(html || ""),
    focus: () => editor?.commands.focus(),
  }), [editor]);

  // External value sync (only when the incoming value DIFFERS, to avoid
  // wiping the user's cursor on every keystroke roundtrip)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (typeof value === "string" && value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  // -------- Image upload pipeline ---------

  const uploadAndInsert = useCallback(async (file) => {
    if (!editor) return;
    setUploadError(null);
    setUploadingPct(0);
    try {
      const res = await uploadContentImage(file, (pct) => setUploadingPct(pct));
      const data = res.data || {};
      if (!data.ok || !data.url) throw new Error("Upload không thành công");
      editor
        .chain()
        .focus()
        .setImage({ src: data.url, alt: file.name?.replace(/\.[^.]+$/, "") || "" })
        .createParagraphNear()
        .run();
    } catch (err) {
      setUploadError(err?.response?.data?.error || err?.message || "Upload thất bại");
    } finally {
      setUploadingPct(null);
    }
  }, [editor]);

  const onPickFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) uploadAndInsert(f);
    e.target.value = "";
  }, [uploadAndInsert]);

  // -------- Toolbar actions ---------

  const insertLink = useCallback(() => {
    if (!editor) return;
    const current = editor.getAttributes("link").href || "";
    const url = window.prompt("Nhập URL (http/https/mailto/tel):", current);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertEmbed = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Dán URL YouTube / TikTok / Facebook video:");
    if (!url) return;
    const html = buildEmbedHtml(url.trim());
    if (!html) {
      alert("URL không được hỗ trợ. Chỉ chấp nhận YouTube, TikTok hoặc Facebook video.");
      return;
    }
    editor.chain().focus().insertContent(html).run();
  }, [editor]);

  const insertCta = useCallback((kind) => {
    if (!editor) return;
    const opt = CTA_OPTIONS.find((c) => c.kind === kind);
    const href = window.prompt(`Nhập đích cho nút "${opt.label}":`, opt.defaultHref);
    if (!href) return;
    const html = buildCtaHtml(kind, href, opt.label);
    editor.chain().focus().insertContent(html).run();
  }, [editor]);

  if (!editor) {
    return <div className="text-sm text-gray-400">Đang tải trình soạn thảo…</div>;
  }

  return (
    <div className="shop-rich-editor border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Sticky compact toolbar */}
      <div className="shop-rich-editor__toolbar sticky top-0 z-10 flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-white border-b border-gray-200">
        <ToolbarBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
        <ToolbarBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolbarBtn>
        <ToolbarBtn title="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolbarBtn>
        <ToolbarBtn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</ToolbarBtn>
        <ToolbarBtn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarBtn>
        <Divider />
        <ToolbarBtn title="Link" active={editor.isActive("link")} onClick={insertLink}>🔗</ToolbarBtn>
        <ToolbarBtn title="Image" onClick={() => fileInputRef.current?.click()}>🖼️</ToolbarBtn>
        <ToolbarBtn title="YouTube / TikTok / Facebook" onClick={insertEmbed}>▶</ToolbarBtn>
        <Divider />
        <span className="text-xs text-gray-400 px-1">CTA:</span>
        {CTA_OPTIONS.map((opt) => (
          <ToolbarBtn key={opt.kind} title={opt.label} onClick={() => insertCta(opt.kind)}>
            {opt.label}
          </ToolbarBtn>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <ToolbarBtn title="Hoàn tác" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>↶</ToolbarBtn>
          <ToolbarBtn title="Làm lại" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>↷</ToolbarBtn>
        </div>
      </div>

      {/* Upload progress + error banners */}
      {uploadingPct !== null && (
        <div className="px-3 py-1.5 text-xs text-emerald-700 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2">
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          Đang upload ảnh… {uploadingPct}%
        </div>
      )}
      {uploadError && (
        <div className="px-3 py-1.5 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
          ⚠ {uploadError}
          <button className="ml-auto text-red-500 hover:text-red-700" onClick={() => setUploadError(null)} type="button">✕</button>
        </div>
      )}

      <EditorContent editor={editor} placeholder={placeholder} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={onPickFile}
      />
    </div>
  );
});

export default ShopRichEditor;
