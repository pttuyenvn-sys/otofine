export function stripHtml(html = "") {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarize(html = "") {
  const text = stripHtml(html);
  return text.split(" ").slice(0, 75).join(" ") + "...";
}

export function formatVND(price) {
  if (!price || Number(price) <= 0) return "Liên hệ";
  return Number(price).toLocaleString("vi-VN") + "đ";
}
