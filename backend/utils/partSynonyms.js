/**
 * Nhóm từ tương đương (VN / thường gặp) — dùng mở rộng khớp "tên gọi tương đương".
 * Chỉ dùng nội bộ backend; không bind trực tiếp input user vào SQL (chỉ LIKE với chuỗi đã lọc).
 */
export const SYNONYM_GROUPS = [
  ["má phanh", "bố thắng", "brake pad", "má phanh trước", "má phanh sau"],
  ["lọc dầu", "lọc nhớt", "oil filter"],
  ["giảm xóc", "phuộc", "shock"],
  ["bu gi", "bugi", "spark plug"],
  ["ắc quy", "bình điện", "battery"],
  ["càng a", "càng chữ a"],
  ["đèn pha", "đèn trước"],
  ["dầu nhớt", "nhớt máy"],
];

/**
 * @param {string} partName
 * @param {string} shortDescription
 * @returns {string[]} cụm an toàn để LIKE (đã lowercase)
 */
export function collectSynonymPhrasesForProduct(partName, shortDescription) {
  const blob = `${String(partName || "")} ${String(shortDescription || "")}`
    .toLowerCase()
    .replace(/<[^>]*>/g, " ");

  const out = new Set();

  for (const group of SYNONYM_GROUPS) {
    const hit = group.some((term) => blob.includes(term.toLowerCase()));
    if (hit) {
      group.forEach((g) => {
        const t = g.toLowerCase().trim();
        if (t.length >= 2) out.add(t);
      });
    }
  }

  return [...out];
}

/**
 * Token có nghĩa từ partName (bổ sung khi không trúng synonym group).
 * @param {string} partName
 * @returns {string[]}
 */
export function tokenizePartName(partName) {
  const s = String(partName || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/+()[\]{}]/g, " ");

  const words = s.split(/\s+/).filter(Boolean);
  const stop = new Set([
    "cho",
    "xe",
    "o",
    "to",
    "phu",
    "tung",
    "chinh",
    "hang",
    "gia",
    "moi",
  ]);

  return words
    .filter((w) => w.length >= 3 && !stop.has(w))
    .slice(0, 5);
}
