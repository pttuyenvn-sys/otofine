import {
  listPartKnowledge,
  getPartKnowledgeById,
  createPartKnowledge,
  updatePartKnowledge,
  deletePartKnowledge,
} from "../repositories/partKnowledge.repository.js";
import {
  importBatch1PartKnowledge,
  extractBatch1RowsFromBody,
} from "../services/partKnowledgeImport.service.js";

function isDuplicateSlugError(err) {
  const code = err?.code;
  const num = err?.number ?? err?.originalError?.number;
  return code === "ER_DUP_ENTRY" || num === 2627 || num === 2601;
}

export async function listPartKnowledgeHandler(req, res) {
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const q = req.query.q;
    const data = await listPartKnowledge({ page, limit, q });
    res.json(data);
  } catch (e) {
    console.error("listPartKnowledge:", e);
    res.status(500).json({ message: "Lỗi tải knowledge" });
  }
}

export async function getPartKnowledgeHandler(req, res) {
  try {
    const row = await getPartKnowledgeById(req.params.id);
    if (!row) return res.status(404).json({ message: "Không tìm thấy" });
    res.json(row);
  } catch (e) {
    console.error("getPartKnowledge:", e);
    res.status(500).json({ message: "Lỗi tải bản ghi" });
  }
}

export async function importBatch1PartKnowledgeHandler(req, res) {
  try {
    const rows = extractBatch1RowsFromBody(req.body);
    const result = await importBatch1PartKnowledge(rows);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("importBatch1PartKnowledge:", e);
    res
      .status(400)
      .json({ message: e?.message || "Import Batch 1 thất bại" });
  }
}

export async function createPartKnowledgeHandler(req, res) {
  try {
    const body = req.body || {};
    const slug = String(body.slug || "").trim();
    const nameVi = String(body.nameVi || "").trim();
    const nameEn = body.nameEn != null ? String(body.nameEn).trim() : "";
    if (!slug || (!nameVi && !nameEn)) {
      return res
        .status(400)
        .json({ message: "slug và nameVi hoặc nameEn là bắt buộc" });
    }
    const row = await createPartKnowledge(body);
    res.status(201).json(row);
  } catch (e) {
    if (isDuplicateSlugError(e)) {
      return res.status(409).json({ message: "Slug đã tồn tại" });
    }
    console.error("createPartKnowledge:", e);
    res.status(500).json({ message: "Lỗi tạo bản ghi" });
  }
}

export async function updatePartKnowledgeHandler(req, res) {
  try {
    const body = req.body || {};
    const slug = String(body.slug || "").trim();
    const nameVi = String(body.nameVi || "").trim();
    const nameEn = body.nameEn != null ? String(body.nameEn).trim() : "";
    if (!slug || (!nameVi && !nameEn)) {
      return res
        .status(400)
        .json({ message: "slug và nameVi hoặc nameEn là bắt buộc" });
    }
    const existing = await getPartKnowledgeById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Không tìm thấy" });
    const row = await updatePartKnowledge(req.params.id, body);
    res.json(row);
  } catch (e) {
    if (isDuplicateSlugError(e)) {
      return res.status(409).json({ message: "Slug đã tồn tại" });
    }
    console.error("updatePartKnowledge:", e);
    res.status(500).json({ message: "Lỗi cập nhật" });
  }
}

export async function deletePartKnowledgeHandler(req, res) {
  try {
    const existing = await getPartKnowledgeById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Không tìm thấy" });
    await deletePartKnowledge(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error("deletePartKnowledge:", e);
    res.status(500).json({ message: "Lỗi xóa" });
  }
}
