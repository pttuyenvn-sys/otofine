import { getPartKnowledgeBySlug } from "../repositories/partKnowledge.repository.js";

/**
 * GET /api/knowledge/part/:slug — chỉ dữ kiện công khai (SEO engine / Otofine).
 */
export async function getPublicPartKnowledgeBySlug(req, res) {
  try {
    const slug = String(req.params.slug || "")
      .toLowerCase()
      .trim();
    if (!slug) {
      return res.status(400).json({ message: "Thiếu slug" });
    }
    const row = await getPartKnowledgeBySlug(slug);
    if (!row || !row.isPublished) {
      return res.status(404).json({ message: "Không có dữ liệu" });
    }
    res.json({
      slug: row.slug,
      categoryName: row.categoryName,
      categoryTag: row.categoryTag,
      nameVi: row.nameVi,
      nameEn: row.nameEn,
      systemGroup: row.systemGroup,
      seoPriority: row.seoPriority,
      seoTier: row.seoTier,
      stylePersonaV2: row.stylePersonaV2,
      brandPersonaV3: row.brandPersonaV3,
      buyerIntentsV4: row.buyerIntentsV4,
      functionText: row.functionText,
      structureText: row.structureText,
      operationText: row.operationText,
      symptomsText: row.symptomsText,
      replaceIntervalText: row.replaceIntervalText,
      warningsText: row.warningsText,
      buyingGuideText: row.buyingGuideText,
      garageNotesText: row.garageNotesText,
      buyerMistakesText: row.buyerMistakesText,
      vnUsageNotesText: row.vnUsageNotesText,
      faqText: row.faqText,
      summary: row.summary,
    });
  } catch (e) {
    console.error("getPublicPartKnowledgeBySlug:", e);
    res.status(500).json({ message: "Lỗi tải knowledge" });
  }
}
