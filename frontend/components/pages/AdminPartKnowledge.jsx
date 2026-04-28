"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  listPartKnowledge,
  createPartKnowledge,
  updatePartKnowledge,
  deletePartKnowledge,
  importPartKnowledgeBatch1,
} from "../../api/adminApi";

const emptyForm = {
  slug: "",
  nameVi: "",
  nameEn: "",
  summary: "",
  body: "",
  categoryTag: "",
  categoryName: "",
  systemGroup: "",
  seoTier: "",
  seoPriority: "",
  functionText: "",
  structureText: "",
  operationText: "",
  symptomsText: "",
  replaceIntervalText: "",
  warningsText: "",
  buyingGuideText: "",
  faqText: "",
  sortOrder: 0,
  isPublished: true,
};

export default function AdminPartKnowledge() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [batchJson, setBatchJson] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listPartKnowledge({ page, limit, q });
      setRows(res.data.rows || []);
      setTotal(res.data.total ?? 0);
    } catch (e) {
      console.error("part-knowledge load", e);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, q]);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      slug: row.slug || "",
      nameVi: row.nameVi || "",
      nameEn: row.nameEn || "",
      summary: row.summary || "",
      body: row.body || "",
      categoryTag: row.categoryTag || "",
      categoryName: row.categoryName || "",
      systemGroup: row.systemGroup || "",
      seoTier: row.seoTier || "",
      seoPriority:
        row.seoPriority != null && row.seoPriority !== ""
          ? String(row.seoPriority)
          : "",
      functionText: row.functionText || "",
      structureText: row.structureText || "",
      operationText: row.operationText || "",
      symptomsText: row.symptomsText || "",
      replaceIntervalText: row.replaceIntervalText || "",
      warningsText: row.warningsText || "",
      buyingGuideText: row.buyingGuideText || "",
      faqText: row.faqText || "",
      sortOrder: row.sortOrder ?? 0,
      isPublished: row.isPublished !== false,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nameVi.trim() && !form.nameEn.trim()) {
      window.alert("Điền Tên (VI) hoặc Tên (EN)");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...form,
        seoPriority: form.seoPriority === "" ? null : form.seoPriority,
      };
      if (editingId) {
        await updatePartKnowledge(editingId, payload);
      } else {
        await createPartKnowledge(payload);
      }
      startCreate();
      await load();
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || "Lưu thất bại";
      window.alert(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleImportBatch1() {
    try {
      setImporting(true);
      const parsed = JSON.parse(batchJson || "[]");
      const payload = Array.isArray(parsed) ? parsed : { rows: parsed?.rows };
      const res = await importPartKnowledgeBatch1(payload);
      const { imported, errors, dedupeDropped, uniqueSlugs } = res.data;
      window.alert(
        `Import xong: ${imported} bản ghi (slug duy nhất: ${uniqueSlugs ?? "—"}). Trùng slug bỏ qua: ${dedupeDropped ?? 0}. Lỗi dòng: ${errors?.length ?? 0}`,
      );
      if (errors?.length) console.warn(errors);
      setBatchJson("");
      await load();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "JSON không hợp lệ hoặc import lỗi";
      window.alert(msg);
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Xóa bản ghi knowledge này?")) return;
    try {
      await deletePartKnowledge(id);
      if (editingId === id) startCreate();
      await load();
    } catch (e) {
      console.error(e);
      window.alert("Xóa thất bại");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <p style={{ marginBottom: 8 }}>
        <Link href="/admin/shops">← Quản lý shop</Link>
      </p>
      <h2>Otofine Knowledge Engine — phụ tùng</h2>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Bảng <code>part_knowledge</code> (MySQL / SQL Server). Migration:{" "}
        <code>npm run migrate:knowledge</code>. Import CLI:{" "}
        <code>npm run import:knowledge:batch1 -- data/batch1.json</code>
      </p>

      <div
        style={{
          border: "1px dashed #94a3b8",
          padding: 16,
          marginBottom: 24,
          borderRadius: 8,
          maxWidth: 900,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Import Batch 1 (JSON)</h3>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
          Tối đa 50 dòng/lần (hoặc <code>PART_KNOWLEDGE_BATCH1_MAX_ROWS</code> trên
          backend). Gửi mảng JSON <code>[...]</code> hoặc <code>{"{ rows: [...] }"}</code>.
          Trùng <code>slug</code> trong file: giữ bản cuối — ghi đè DB theo slug.           Trường: <code>slug</code>, <code>category_name</code>, <code>english_name</code>,{" "}
          <code>system_group</code>, <code>seo_priority</code> (số hoặc A–E),{" "}
          <code>function_text</code>, <code>structure_text</code>, <code>operation_text</code>,{" "}
          <code>symptoms_text</code>, <code>replace_interval_text</code>, <code>warnings_text</code>,{" "}
          <code>buying_guide_text</code>, <code>faq_text</code>.
        </p>
        <textarea
          placeholder='[ { "slug": "...", "english_name": "...", ... }, ... ]'
          value={batchJson}
          onChange={(e) => setBatchJson(e.target.value)}
          style={{ width: "100%", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
        />
        <button
          type="button"
          style={{ marginTop: 8 }}
          disabled={importing || !batchJson.trim()}
          onClick={handleImportBatch1}
        >
          {importing ? "Đang import…" : "Import Batch 1"}
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #e2e8f0",
          padding: 16,
          marginBottom: 24,
          borderRadius: 8,
          maxWidth: 720,
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          {editingId ? `Sửa #${editingId}` : "Thêm mới"}
        </h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            slug *
            <input
              style={{ width: "100%", display: "block" }}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
            />
          </label>
          <label>
            Tên (VI) — bắt buộc nếu không có EN
            <input
              style={{ width: "100%", display: "block" }}
              value={form.nameVi}
              onChange={(e) => setForm({ ...form, nameVi: e.target.value })}
            />
          </label>
          <label>
            Tên (EN)
            <input
              style={{ width: "100%", display: "block" }}
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
            />
          </label>
          <label>
            Nhóm tag (category_tag)
            <input
              style={{ width: "100%", display: "block" }}
              value={form.categoryTag}
              onChange={(e) =>
                setForm({ ...form, categoryTag: e.target.value })
              }
            />
          </label>
          <label>
            Tên nhóm hiển thị (category_name)
            <input
              style={{ width: "100%", display: "block" }}
              value={form.categoryName}
              onChange={(e) =>
                setForm({ ...form, categoryName: e.target.value })
              }
            />
          </label>
          <label>
            Nhóm hệ thống (system_group)
            <input
              style={{ width: "100%", display: "block" }}
              value={form.systemGroup}
              onChange={(e) =>
                setForm({ ...form, systemGroup: e.target.value })
              }
            />
          </label>
          <label>
            SEO tier (A–E, tuỳ chọn)
            <input
              style={{ width: 120, display: "block" }}
              value={form.seoTier}
              onChange={(e) => setForm({ ...form, seoTier: e.target.value })}
            />
          </label>
          <label>
            SEO priority (số hoặc để trống nếu chỉ dùng tier)
            <input
              type="text"
              style={{ width: 160, display: "block" }}
              value={form.seoPriority}
              onChange={(e) =>
                setForm({ ...form, seoPriority: e.target.value })
              }
            />
          </label>
          <label>
            Chức năng (function_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 72 }}
              value={form.functionText}
              onChange={(e) =>
                setForm({ ...form, functionText: e.target.value })
              }
            />
          </label>
          <label>
            Cấu tạo (structure_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 56 }}
              value={form.structureText}
              onChange={(e) =>
                setForm({ ...form, structureText: e.target.value })
              }
            />
          </label>
          <label>
            Vận hành (operation_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 56 }}
              value={form.operationText}
              onChange={(e) =>
                setForm({ ...form, operationText: e.target.value })
              }
            />
          </label>
          <label>
            Triệu chứng (symptoms_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 72 }}
              value={form.symptomsText}
              onChange={(e) =>
                setForm({ ...form, symptomsText: e.target.value })
              }
            />
          </label>
          <label>
            Chu kỳ thay (replace_interval_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 56 }}
              value={form.replaceIntervalText}
              onChange={(e) =>
                setForm({ ...form, replaceIntervalText: e.target.value })
              }
            />
          </label>
          <label>
            Cảnh báo (warnings_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 56 }}
              value={form.warningsText}
              onChange={(e) =>
                setForm({ ...form, warningsText: e.target.value })
              }
            />
          </label>
          <label>
            Hướng dẫn mua (buying_guide_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 56 }}
              value={form.buyingGuideText}
              onChange={(e) =>
                setForm({ ...form, buyingGuideText: e.target.value })
              }
            />
          </label>
          <label>
            FAQ (faq_text)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 72 }}
              value={form.faqText}
              onChange={(e) => setForm({ ...form, faqText: e.target.value })}
            />
          </label>
          <label>
            Tóm tắt
            <textarea
              style={{ width: "100%", display: "block", minHeight: 64 }}
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </label>
          <label>
            Nội dung (body)
            <textarea
              style={{ width: "100%", display: "block", minHeight: 96 }}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label>
            Thứ tự (sort_order)
            <input
              type="number"
              style={{ width: 120, display: "block" }}
              value={form.sortOrder}
              onChange={(e) =>
                setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
              }
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) =>
                setForm({ ...form, isPublished: e.target.checked })
              }
            />
            Xuất bản
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
          {editingId && (
            <button type="button" onClick={startCreate}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          placeholder="Tìm theo tên, slug, mô tả…"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          style={{ minWidth: 220, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setQ(qInput.trim());
          }}
        >
          Tìm
        </button>
      </div>

      {loading && <p>Đang tải dữ liệu…</p>}

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>slug</th>
            <th>Tên (VI)</th>
            <th>SEO</th>
            <th>Nhóm</th>
            <th>XB</th>
            <th>Cập nhật</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center" }}>
                Không có dữ liệu
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.slug}</td>
              <td>{r.nameVi || r.nameEn || "—"}</td>
              <td>
                {r.seoTier ? `${r.seoTier} ` : ""}
                {r.seoPriority ?? "—"}
              </td>
              <td>{r.categoryTag || r.categoryName || "—"}</td>
              <td>{r.isPublished ? "✓" : "—"}</td>
              <td style={{ fontSize: 12 }}>
                {r.updatedAt
                  ? String(r.updatedAt).slice(0, 19).replace("T", " ")
                  : "—"}
              </td>
              <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={() => startEdit(r)}>
                  Sửa
                </button>
                <button type="button" onClick={() => handleDelete(r.id)}>
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Trước
        </button>
        <span>
          Trang {page} / {totalPages} ({total} bản ghi)
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Sau
        </button>
      </div>
    </div>
  );
}
