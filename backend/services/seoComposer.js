/**
 * PRO Content Engine V2 — Vietnamese automotive SEO HTML from part_knowledge.
 * Profile-aware (ignition · brake · filter · suspension · default), data-first, template padding.
 */

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function foldVi(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/đ/gi, "d")
    .replace(/[^a-z0-9]+/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** @typedef {'ignition'|'brake'|'steering'|'filter'|'body'|'electrical'|'suspension'|'lighting'|'engine'|'transmission'|'exhaust'|'cooling'|'default'} Profile */

/**
 * @param {import("mysql2").RowDataPacket} row
 * @returns {Profile}
 */
function detectProfile(row) {
  const hay = [
    foldVi(row.slug ?? ""),
    foldVi(row.name_vi ?? ""),
    foldVi(row.system_group ?? ""),
    foldVi(row.category_name ?? ""),
    foldVi(row.canonical_name ?? ""),
  ].join(" ");

  if (/\b(ma phanh|bo thang|phanh|heo phanh|caliper|dia phanh|dau phanh|tang bua)\b/.test(hay)) {
    return "brake";
  }

  if (/\b(thuoc lai|thanh rang|rotuyn lai|rotin lai|tro luc lai|bom tro luc|vo lang|tay lai)\b/.test(hay)) {
    return "steering";
  }

  if (/\b(can truoc|can sau|ba do soc|nap capo|tai xe|tai truoc|tai sau|cua xe|mat ca lang|calang|guong|than vo|op hong|op cua|bu long can)\b/.test(hay)) {
    return "body";
  }

  if (/\b(den|cam bien|sensor|ecu|day dien|cong tac|relay|ro le|cau chi|motor|mo to|camera)\b/.test(hay)) {
    return "electrical";
  }

  if (
    /\b(he thong ham|tang phanh|caliper|dong phanh|pho thang|phanh dia|phanh tang|pad phanh|phanh \w+|phanh\b)\b/.test(
      hay,
    )
  ) {
    return "brake";
  }

  if (
    /\b(loc gio|loc nhot|loc nh|loc dau|loc dong co|loc cabin|loc khi|nen khi)\b/.test(hay) ||
    /\bbo loc\b/.test(hay)
  ) {
    return "filter";
  }

  if (
    /\b(mobin|bougie|chia lua|cuc day cao|dai cao ap|cao ap|ecu dieu khien|kim phun|bugi)\b/.test(
      hay,
    )
  ) {
    return "ignition";
  }

  if (
    /\b(giam soc|cang|pho|lac|rotin|cang a|cang i|dam nang|cang ke|lac cam|lac la|cang xe)\b/.test(
      hay,
    )
  ) {
    return "suspension";
  }

  if (
    /\b(den|pha|cos|xi nhan|phanh|bi|led|halogen|chiếu|sáng|đèn)\b/.test(hay)
  ) {
    return "lighting";
  }

  if (
    /\b(dong co|may|piston|xi lanh|buong dot|ket|bu gi|cam|turboc|nhot|nhiet|dong co)\b/.test(hay)
  ) {
    return "engine";
  }

  if (
    /\b(hop so|ly hop|truyen dong|cai truyen|so tu dong|so tay|bien tan)\b/.test(hay)
  ) {
    return "transmission";
  }

  if (
    /\b(xa|phe|ong xả|đuôi xe|bộ xả|silencer|muffler)\b/.test(hay)
  ) {
    return "exhaust";
  }

  if (
    /\b(ke t|lam nhiet|quat nhiet|nuoc lam nhiet|bang nhiet|thong gió|hoi nhiet)\b/.test(hay)
  ) {
    return "cooling";
  }

  return "default";
}

const PROFILE_DENY = {
  brake: [],
  steering: [/\babs\b/i, /dau phanh/i, /heo phanh/i, /ma phanh/i],
  filter: [/\babs\b/i, /dau phanh/i, /heo phanh/i],
  body: [/\becu\b/i, /\babs\b/i, /\bdau\b/i, /cam bien/i, /tin hieu/i, /dien ap/i],
  electrical: [/\bdau phanh\b/i, /heo phanh/i, /ma phanh/i],
  suspension: [/\babs\b/i, /dau phanh/i, /heo phanh/i],
  ignition: [/\bdau phanh\b/i, /heo phanh/i, /ma phanh/i],
  default: [/\babs\b/i, /dau phanh/i, /heo phanh/i],
};

function isAllowedForProfile(text, profile) {
  const folded = foldVi(text);
  const rules = PROFILE_DENY[profile] || PROFILE_DENY.default;
  return !rules.some((re) => re.test(folded));
}

/** @returns {boolean} */
function looksLikeHtmlMarkup(text) {
  const t = String(text ?? "").trim();
  return /^<[a-z][\s\S]*>/i.test(t);
}

/**
 * @param {string} text
 * @param {Set<string>} seen
 */
function paragraphsToHtml(text, seen, profile = "default") {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  if (looksLikeHtmlMarkup(raw)) {
    const key = raw.replace(/\s+/g, " ").slice(0, 280);
    if (seen?.has?.(key)) return "";
    seen?.add?.(key);
    return raw;
  }

  const chunks = raw
    .split(/\n\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const paras = chunks.length ? chunks : raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  let out = "";
  for (let p of paras) {
    const norm = p.replace(/\s+/g, " ").trim();
    if (!norm) continue;
    if (!isAllowedForProfile(norm, profile)) continue;
    const k = norm.toLowerCase();
    if (seen?.has?.(k)) continue;
    seen?.add?.(k);
    out += `<p>${escapeHtml(norm)}</p>\n`;
  }
  return out;
}

/** @param {(string|null|undefined)[]} parts @param {Set<string>} seen */
function mergeFields(parts, seen, profile = "default") {
  let acc = "";
  for (const t of parts) {
    const b = paragraphsToHtml(String(t ?? ""), seen, profile);
    if (b.trim()) acc += b;
  }
  return acc;
}

/** Plain text length proxy for “words” (VN mix). */
function stripTags(html) {
  return String(html ?? "").replace(/<[^>]+>/gi, " ");
}

function approxWords(html) {
  const p = stripTags(html).trim();
  const w = p.split(/\s+/).filter(Boolean).length;
  return w > 0 ? w : Math.ceil(p.length / 6);
}

/** Deduped sentence paragraph. */
/** @param {string} t @param {Set<string>} seen */
function emitP(t, seen, profile = "default") {
  const n = String(t ?? "").replace(/\s+/g, " ").trim();
  if (!n) return "";
  if (!isAllowedForProfile(n, profile)) return "";
  const k = n.toLowerCase();
  if (seen.has(k)) return "";
  seen.add(k);
  return `<p>${escapeHtml(n)}</p>\n`;
}

/** @param {string[]} items @param {Set<string>} seen */
function emitUl(items, seen, profile = "default") {
  let li = "";
  for (const it of items) {
    const s = String(it ?? "").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (!isAllowedForProfile(s, profile)) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    li += `<li>${escapeHtml(s)}</li>\n`;
  }
  if (!li) return "";
  return `<ul class="seo-part-list">\n${li}</ul>\n`;
}

/**
 * Turn multiline text into paragraphs + optional bullet list (lines starting "- " "• ").
 * @param {string} raw
 * @param {Set<string>} seen
 */
function mixedBlocksFromText(raw, seen, profile = "default") {
  let body = String(raw ?? "").trim();
  if (!body) return "";
  const lines = body.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const bullets = [];
  const prose = [];
  for (const line of lines) {
    if (/^[-•*]\s+/.test(line) || /^\d+[\.\)]\s+/.test(line)) {
      bullets.push(line.replace(/^[-•*]\s+/, "").replace(/^\d+[\.\)]\s+/, ""));
    } else {
      prose.push(line);
    }
  }
  let html = "";
  if (prose.length) {
    html += paragraphsToHtml(prose.join("\n\n"), seen, profile);
  }
  if (bullets.length) {
    html += emitUl(bullets, seen, profile);
  }
  if (!html.trim()) {
    html = paragraphsToHtml(body, seen, profile);
  }
  return html;
}

/**
 * Category-specific bridge copy (not a substitute for DB fields — padding + expert tone).
 * @param {Profile} profile
 * @param {string} nameVi
 * @param {string} cat
 */
function templateLaGiExtras(profile, nameVi, cat) {
  const n = nameVi || "linh kiện";
  const c = cat || "hệ thống liên quan";
  /** @type {Record<Profile, string[]>} */
  const map = {
    ignition: [
      `Trong hệ thống đánh lửa, ${n} đóng vai trò chuyển điện áp thấp thành xung cao áp phù hợp so với thiết kế nhà sản xuất, giúp phát lửa đốt hỗn hợp nhiên liệu — khí nạp tại buồng đốt ổn định.`,
      `Khi ${n} suy giảm, máy dễ rung lắc khi tải, mất lực, tiêu hao nhiên liệu tăng và có thể phát sinh mã lỗi liên quan buồng đốt hoặc cảm biến khí thải — cần quét mã và kiểm tra toàn bộ dây cao áp, bugi trước khi kết luận một thành phần đơn lẻ.`,
    ],
    brake: [
      `Với phanh ${c}, ${n} là bộ phận chịu ma sát chính khi hãm/giảm tốc; vật liệu ma sát, khe tản nhiệt và bề mặt tiếp xúc đĩa phải đồng bộ thông số OE/OEM để tránh kêu, rung, nóng cục bộ hoặc lệch moment phanh giữa các bánh.`,
      `Trên đường Việt Nam, bụi, nước mưa, nhiệt độ cao liên tục và tải phanh nặng (đèo, tắc đường) làm tăng tốc độ hao mòn; nên kết hợp quan sát độ dày còn lại, ranh giới an toàn nhà sản xuất và hiện tượng thực tế (kêu, rung vô lăng, kéo phanh) khi quyết định thay.`,
    ],
    steering: [
      `${n} thuộc hệ thống lái, cần đúng kích thước lắp, hành trình và độ rơ cho từng đời xe. Khi sai thông số, vô lăng có thể nặng, trả lái kém, kêu lục cục hoặc làm lốp mòn lệch.`,
      `Nên kiểm tra đồng thời rotuyn, thanh răng, cao su chụp bụi và trợ lực EPS/dầu để tránh thay một chi tiết nhưng vẫn còn độ rơ hoặc tiếng kêu từ cụm liên quan.`,
    ],
    filter: [
      `${n} thuộc nhóm bảo dưỡng định kỳ: lưu lượng khí/dầu qua lõi lọc phải giữ trong ngưỡng cho phép; khi tắc, áp suất chênh hoặc nhiễm bẩn sẽ ảnh hưởng hiệu suất động cơ, tuổi thọ dầu/nhiên liệu và đôi khi cảm biến liên quan.`,
      `Chất lượng lõi, gioăng, van bypass (nếu có) và đúng mã theo động cơ quan trọng hơn “hình dạng nhìn giống nhau”; không nên lắp chung loại không đúng thông số lưu lượng chỉ để tiết kiệm ngắn hạn.`,
    ],
    body: [
      `${n} thuộc nhóm thân vỏ/ngoại thất, ưu tiên đúng form dáng, khe hở lắp ráp, vị trí bắt ốc và độ khớp với ba-đờ-sốc, tai xe, nắp capo hoặc cụm đèn liền kề.`,
      `Khi thay ${n}, cần kiểm tra bề mặt sơn, độ phẳng, pát giữ và đường mép để tránh hở khe, lệch dáng hoặc rung khi xe chạy tốc độ cao.`,
    ],
    electrical: [
      `${n} thuộc nhóm điện/điện tử, cần đúng điện áp làm việc, chân giắc, tín hiệu và chuẩn giao tiếp với hệ thống trên xe.`,
      `Khi chọn ${n}, nên đối chiếu mã OE/OEM, sơ đồ chân và đời xe; sai mã có thể gây báo lỗi, tín hiệu không ổn định hoặc hoạt động chập chờn.`,
    ],
    suspension: [
      `${n} chịu tải động của thân xe: lực dọc, xoắn, va đập và mài mòn cao su/kim loại — vì vậy lắp đặt không đồng tâm hoặc thiếu siết lực theo moment chuẩn dễ gây ồn, lệch thước lái hoặc bào mòn lốp.`,
      `Khi thay trong hệ khung gầm (${c}), nên kiểm tra chi tiết liên đới (bao, rotin, căn chỉnh góc) để không chẩn đoán sai “hỏng tái diễn” chỉ sau vài trăm km.`,
    ],
    lighting: [
      `${n} đảm bảo an toàn và khả năng hiển thị khi lái xe, đặc biệt vào ban đêm và điều kiện thời tiết xấu. Công suất, nhiệt độ màu và góc chiếu phải đúng thông số kỹ thuật để tránh gây chói lái xe khác và đảm bảo hiệu quả chiếu sáng.`,
      `Khi ${n} suy giảm, người lái sẽ bị hạn chế tầm nhìn, nguy cơ tai nạn tăng, và có thể bị phạt do không đáp ứng tiêu chuẩn an toàn. Nên kiểm tra và thay thế định kỳ, ưu tiên LED để tiết kiệm điện và tăng tuổi thọ.`,
    ],
    engine: [
      `${n} là trái tim của xe, chuyển đổi năng lượng hóa học thành cơ năng để tạo ra chuyển động. Các thông số kỹ thuật như dung tích xi lanh, tỷ số nén, và hệ thống cung cấp nhiên liệu phải được bảo dưỡng đúng cách để đảm bảo hiệu suất và độ bền.`,
      `Khi ${n} gặp vấn đề, xe có thể bị yếu, tăng tốc kém, tiêu hao nhiên liệu tăng hoặc phát sinh tiếng động lạ. Cần kiểm tra định kỳ dầu nhớt, bộ lọc, và các cảm biến để phát hiện sớm các dấu hiệu hư hỏng.`,
    ],
    transmission: [
      `${n} truyền công suất từ động cơ đến bánh xe, đảm bảo xe vận hành mượt mà ở các tốc độ khác nhau. Hộp số có thể là số tay hoặc số tự động, mỗi loại yêu cầu cách bảo dưỡng và vận hành khác nhau để đảm bảo độ bền.`,
      `Khi ${n} có vấn đề, xe có thể bị rung, khó vào số, trượt số hoặc phát sinh tiếng kêu lạ. Nên thay nhớt hộp số định kỳ, kiểm tra mức nhớt và đến garage chuyên nghiệp khi có dấu hiệu bất thường.`,
    ],
    exhaust: [
      `${n} dẫn khí thải từ động cơ ra ngoài và giảm tiếng ồn động cơ. Hệ thống xả phải đảm bảo kín, đúng đường kính và vật liệu chống ăn mòn để duy trì hiệu suất động cơ và đáp ứng tiêu chuẩn khí thải.`,
      `Khi ${n} bị hỏng, xe có thể bị ồn lớn, hiệu suất giảm, tiêu hao nhiên liệu tăng hoặc không qua được kiểm tra môi trường. Nên kiểm tra định kỳ các rò rỉ và thay thế khi có dấu hiệu ăn mòn hoặc hư hỏng.`,
    ],
    cooling: [
      `${n} duy trì nhiệt độ hoạt động tối ưu cho động cơ, tránh quá nhiệt và đảm bảo hiệu suất. Hệ thống làm mát bao gồm két nước, quạt, bơm nước và chất làm mát phải hoạt động đồng bộ để hiệu quả.`,
      `Khi ${n} gặp vấn đề, động cơ có thể quá nhiệt, bị hư hại nghiêm trọng hoặc xe bị nóng bất thường. Nên kiểm tra mực nước làm mát định kỳ, thay chất làm mát theo lịch và theo dõi nhiệt độ hoạt động của xe.`,
    ],
    default: [
      `${n} là linh kiện thuộc nhóm ${c}. Vận hành đúng thiết kế giúp xe an toàn, êm và bền; khi suy giảm, triệu chứng thường xuất hiện dần — cần đối chiếu mã xe, năm sản xuất và hướng dẫn hãng trước khi thay thế.`,
      `Trên thực tế sửa chữa, lỗi "tái phát" thường do vệ sinh chưa triệt để, lắp sai vị trí, siết lực không đạt hoặc nguyên nhân liên quan khác chưa xử lý; vì vậy nên kiểm tra toàn hệ thay vì thay lẻ một chi tiết khi chưa đủ cơ sở.`,
    ],
  };
  return map[profile] || map.default;
}

function templateSymptomIntro(profile, nameVi) {
  const n = nameVi || "linh kiện";
  const o = {
    ignition: `Dấu hiệu ${n} yếu hoặc hỏng thường kết hợp với hiện tượng đánh lửa kém ở một hoặc nhiều xi-lanh. Dưới đây là các biểu hiện thường gặp — nên ghi nhận kèm ngữ cảnh (nóng máy, tải, vệ sinh bugi):`,
    brake: `Triệu chứng phanh liên quan ${n} thường thể hiện qua âm thanh, độ rung vô lăng, khoảng hành trình bàn đạp hoặc mùi nóng; cần phân biệt bánh trước/sau và tình trạng đĩa/má phanh kèm theo:`,
    filter: `Khi ${n} tắc hoặc quá bẩn, động cơ có thể “uống” nhiên liệu hơn, yếu tốc đầu, báo đèn hoặc tiếng hút lạ — theo dõi các dấu hiệu sau:`,
    steering: `Dấu hiệu ${n} hỏng thường nằm ở cảm giác lái, độ rơ và tiếng kêu từ gầm trước. Cần phân biệt với rotuyn, thước lái và trợ lực lái trước khi kết luận:`,
    body: `Dấu hiệu ${n} xuống cấp thường thể hiện ở khe hở, độ lệch form, nứt gãy pát giữ hoặc bề mặt sơn. Các biểu hiện nên kiểm tra gồm:`,
    electrical: `Dấu hiệu ${n} lỗi thường liên quan điện áp, tín hiệu hoặc giắc cắm. Nên ghi nhận hiện tượng theo thời điểm bật/tắt tải điện và điều kiện vận hành:`,
    suspension: `Hệ thống treo kêu, lệch lái hoặc lốp mòn lệch thường liên quan đến ${n} hoặc chi tiết lân cận. Các dấu hiệu phổ biến:`,
    default: `Dưới đây là các dấu hiệu thường gặp khi ${n} suy giảm hoặc hỏng — cần đối chiếu thêm qua chẩn đoán tại xưởng:`,
  };
  return o[profile] || o.default;
}

function templateSymptomClosing(profile, nameVi) {
  const n = nameVi || "linh kiện";
  const o = {
    ignition: `Bỏ qua các dấu hiệu trên có thể làm tăng khí thải, hư hỏng cục bộ buồng đốt hoặc hư hỏng dây cao áp/ECU do phải “bù” đánh lửa; nên quét mã lỗi và đo thông số trước khi thay lẻ.`,
    brake: `Tiếp tục sử dụng khi phanh kém hoặc nóng cục bộ làm tăng nguy cơ mất an toàn (trượt bánh, lệch moment, mất phanh một phần). Hãy kiểm tra cả dầu phanh, heo thắng và đĩa kèm theo.`,
    filter: `Không xử lý kịp có thể kéo theo tải bơm, nóng dầu, carbon hóa van hoặc hư cảm biến áp — chi phí sửa chữa thường cao hơn thay đúng lọc đúng kỳ.`,
    steering: `Nếu tiếp tục chạy khi ${n} có độ rơ hoặc kêu bất thường, xe có thể mất ổn định hướng lái, mòn lốp lệch và làm tăng tải lên rotuyn hoặc trợ lực lái.`,
    body: `Với thân vỏ, bỏ qua chi tiết lệch/hở có thể làm nước, bụi và rung gió lọt vào, đồng thời ảnh hưởng thẩm mỹ và độ khít khi lắp các chi tiết liền kề.`,
    electrical: `Nếu ${n} phát tín hiệu sai hoặc mất nguồn chập chờn, xe có thể báo lỗi không ổn định; nên kiểm tra nguồn, mass và giắc trước khi thay.`,
    suspension: `Triệu chứng kéo dài thường làm mòn lốp lệch, căng rotin/càng chữ A và giảm ổn định đường trơn.`,
    default: `Nếu triệu chứng xuất hiện đồng thời với các hệ khác (nhiệt độ dầu, đèn báo), cần chẩn đoán tổng thể để tránh thay sai vị trí.`,
  };
  return o[profile] || o.default;
}

function templateCauseExtras(profile, nameVi, cat) {
  const n = nameVi || "linh kiện";
  const c = cat || "";
  const o = {
    ignition: [
      `${n}: hao nhiệt từ máy và buồng đốt, rung trong gầm máy; dây cao áp nút gỉ có thể gây rò nhỏ tạo lỗi gián tiếp trên cục.`,
      `Độ ẩm, bụi cacbon phủ điện cực bugi hoặc nhiên liệu kém chất lượng cũng làm tăng tải phóng điện — dễ nhầm với hỏng hoàn toàn ${n}.`,
    ],
    brake: [
      `Phanh ${c}: bụi phanh, nước ngập, leo dốc kéo dài khiến nhiệt phân bố không đều; heo kẹt nhẹ cũng gây mòn lệch mép má phanh hoặc vân sóng trên đĩa.`,
      `Lắp sai lớp phụ kiện (không OE) hoặc bỏ qua vệ sinh ray heo thường làm triệu chứng quay lại nhanh sau thay.`,
    ],
    filter: [
      `Môi trường bụi cao (QL1, cao tốc, công trường) rút ngắn tuổi lọc gió; lọc dầu phải thay đúng định kỳ nếu dầu máy đã mờ/sôi.`,
    ],
    steering: [
      `Đường xấu, va ổ gà, nước lọt vào chụp bụi hoặc thiếu bảo dưỡng có thể làm ${n} rơ, kêu và trả lái không đều.`,
      `Lệch góc đặt bánh hoặc rotuyn mòn cũng dễ làm người dùng nhầm là hỏng riêng ${n}.`,
    ],
    body: [
      `Va quệt, pát gãy, lắp sai ngàm hoặc sơn sửa không đúng quy trình là các nguyên nhân thường gặp khiến ${n} lệch form hoặc hở khe.`,
    ],
    electrical: [
      `Ẩm giắc, oxy hóa chân cắm, dây dẫn đứt ngầm hoặc điện áp cấp không ổn định là nguyên nhân phổ biến làm ${n} hoạt động sai.`,
    ],
    suspension: [
      `Chạy nhiều ổ gà/gờ giảm tốc làm giảm tuổi thọ cao su; lệch lái kéo dài khiến ${n} chịu tải xoắn không đều.`,
    ],
    default: [
      `Nguyên nhân thường kết hợp: hao mòn tự nhiên, bảo dưỡng không đúng chu kỳ, lắp không đúng mã hoặc tác động vật lý từ đường xá Việt Nam.`,
    ],
  };
  return o[profile] || o.default;
}

function templateIntervalExtras(profile, nameVi) {
  const n = nameVi || "linh kiện";
  const o = {
    ignition: `Hiếm khi có “km cố định” cho ${n}: thay khi có triệu chứng rõ, sau khi đã loại trừ bugi/dây cao áp và quét lỗi. Một số hãng khuyến cáo kiểm tra định kỳ — ưu tiên làm đúng hướng dẫn bảo dưỡng của xe.`,
    brake: `Khoảng thay má phanh/đĩa phụ thuộc phong độ phanh, địa hình và chất lượng vật liệu; theo dõi độ dày còn lại an toàn thay vì chỉ nhìn km tổng.`,
    filter: `Lọc gió/dầu thường niêm trong lịch bảo dưỡng định kỳ theo km hoặc tháng — nếu môi trường bụi cao có thể rút ngắn.`,
    steering: `${n} thường thay khi có độ rơ, kêu, chảy dầu trợ lực hoặc kiểm tra thấy thanh răng/rotuyn vượt giới hạn cho phép; không nên chỉ dựa vào số km.`,
    body: `${n} không có chu kỳ thay cố định; chỉ thay khi nứt gãy, biến dạng, hở khe, bạc màu nặng hoặc sau va chạm cần phục hồi đúng form.`,
    electrical: `${n} nên thay khi đo được lỗi tín hiệu/điện áp, giắc hư hoặc hệ thống báo lỗi lặp lại sau khi đã kiểm tra nguồn và mass.`,
    suspension: `${n}: thường thay khi có chơi/kêu không hết sau khi siết đúng moment, kiểm tra rotin/càng kèm theo; không luôn có km cố định.`,
    default: `Không có một mốc km áp dụng cho mọi xe: cần kết hợp triệu chứng, điều kiện đường và khuyến cáo ${n} trên tài liệu hãng.`,
  };
  return o[profile] || o.default;
}

function templateCautionExtras(profile, nameVi) {
  const n = nameVi || "linh kiện";
  const o = {
    ignition: [
      `Với động cơ nhiều xi-lanh, nên cân nhắc thay ${n} theo cặp/xi-lanh hoặc bộ (tùy thiết kế) để tránh chênh điện trở phóng điện giữa các buồng.`,
      `Luôn quét mã lỗi và xoá thích hợp sau thay; kiểm tra dây cao áp không nứt, bugi đúng nhiệt; ưu tiên phụ tùng có mã OEM/tương đương.`,
    ],
    brake: [
      `Thay đồng bộ hai bên trục nếu hãng khuyến cáo; siết moment bulong đúng, xả khí và bôi trơn chổi chữ U theo đúng quy trình.`,
      `Kiểm tra dầu phanh và độ chai dây sau khi sửa hệ phanh.`,
    ],
    filter: [
      `Đóng kín nắp, kiểm tra gioăng không xoắn; không thổi tái lọc gió đã quá giới hạn; lọc dầu không quá siết gây xì.`,
    ],
    steering: [
      `Sau khi thay ${n}, nên kiểm tra độ rơ vô lăng, siết đúng lực, kiểm tra chụp bụi và cân chỉnh góc đặt bánh nếu có tháo cụm lái.`,
    ],
    body: [
      `Ướm thử trước khi sơn, kiểm tra khe hở đều hai bên, pát giữ chắc và bề mặt không cong vênh trước khi hoàn thiện.`,
    ],
    electrical: [
      `Ngắt nguồn đúng cách, kiểm tra chân giắc và chống ẩm; sau lắp cần kiểm tra tín hiệu hoặc quét lỗi nếu chi tiết có giao tiếp điện tử.`,
    ],
    suspension: [
      `Sau khi thay ${n}, nên kiểm tra căn chỉnh góc đặt bánh nếu có tháo càng; siết lực theo moment chuẩn.`,
    ],
    default: [
      `Lắp đúng mã, giữ sạch mặt lắp, siết lực đúng; tránh dùng hàng không rõ nguồn khi liên quan an toàn.`,
    ],
  };
  return o[profile] || o.default;
}

function templateBuyingExtras(profile, nameVi) {
  const n = nameVi || "linh kiện";
  const o = {
    ignition: [
      `Ưu tiên mã OEM hoặc OE công bố; kiểm tra số in trên thân hàng; tránh hàng “tương thích chung” khi ECU yêu cầu thông số cao áp chặt.`,
      `Giữ hóa đơn & bảo hành; tránh mua hàng không có tem chống giả khi mua qua kênh không rõ nguồn.`,
    ],
    brake: [
      `Đối chiếu mã OE với đĩa/má phanh; kiểm tra kèm cảm biến ABS nếu có; với phanh dầu, chọn loại đúng ma sát theo thông số Friction code (nếu ghi trên hộp).`,
    ],
    filter: [
      `Đọc mã lọc in trên thân cũ; chú ý lưu lượng & áp suất bypass; hàng giả thường lõi mềm/không đủ diện tích lọc.`,
    ],
    steering: [
      `So khớp mã thước lái/rotuyn theo đời xe, vị trí lắp và loại trợ lực. Ưu tiên hàng có ảnh rõ pát bắt, đầu nối và chính sách đổi trả.`,
    ],
    body: [
      `Nên chọn theo mã xe, đời xe, phiên bản cản/đèn đi kèm và tình trạng sơn. Ảnh thật giúp kiểm tra form dáng, mép gấp và vị trí pát.`,
    ],
    electrical: [
      `Đối chiếu mã OE/OEM, chân giắc, điện áp và đời xe. Không nên mua theo hình dáng bên ngoài nếu chi tiết có cảm biến hoặc mạch điều khiển.`,
    ],
    suspension: [
      `Chọn đúng độ cứng/tải cho trọng lượng xe; các phụ kiện hạ gầm cần tương thích với chiều cao và hành trình còn lại.`,
    ],
    default: [
      `So khớp mã theo catalogue hãng, năm sản xuất, dung tích động cơ và vị trí lắp; hỏi rõ chính sách đổi trả.`,
    ],
  };
  return o[profile] || o.default;
}

/**
 * Build “là gì?” with data + extras.
 */
function sectionLaGi(part, opts, profile, seen) {
  const nameVi = String(part.name_vi ?? "").trim() || "phụ tùng";
  const cat = String(part.category_name ?? "").trim() || "nhóm phụ tùng";
  /** @type {string[]} */
  let parts = opts.omitSummary ? [] : [part.summary];
  parts.push(
    part.function_text,
    part.structure_text,
    part.operation_text,
  );
  let body = mergeFields(parts, seen, profile);
  const extras = templateLaGiExtras(profile, nameVi, cat);
  for (const ex of extras) {
    body += emitP(ex, seen, profile);
    if (approxWords(body) > 520) break;
  }
  if (!body.trim()) return "";
  return `<section class="seo-part-section seo-part-intro">\n<h2>${escapeHtml(`${nameVi} là gì?`)}</h2>\n<div class="seo-part-section__body">${body}</div>\n</section>\n`;
}

function sectionSymptoms(part, profile, seen) {
  const nameVi = String(part.name_vi ?? "").trim() || "phụ tùng";
  let inner = "";
  inner += emitP(templateSymptomIntro(profile, nameVi), seen, profile);
  inner += mixedBlocksFromText(part.symptoms_text ?? "", seen, profile);
  inner += emitP(templateSymptomClosing(profile, nameVi), seen, profile);
  if (!stripTags(inner).trim()) return "";
  return `<section class="seo-part-section">\n<h2>${escapeHtml(`Dấu hiệu ${nameVi} hỏng`)}</h2>\n<div class="seo-part-section__body">${inner}</div>\n</section>\n`;
}

function sectionCauses(part, profile, seen) {
  const nameVi = String(part.name_vi ?? "").trim() || "phụ tùng";
  const cat = String(part.category_name ?? "").trim();
  let inner = paragraphsToHtml(String(part.common_causes_text ?? ""), seen, profile);
  for (const line of templateCauseExtras(profile, nameVi, cat)) {
    inner += emitP(line, seen, profile);
    if (approxWords(inner) > 440) break;
  }
  if (!stripTags(inner).trim()) return "";
  return `<section class="seo-part-section">\n<h2>${escapeHtml("Nguyên nhân thường gặp")}</h2>\n<div class="seo-part-section__body">${inner}</div>\n</section>\n`;
}

function sectionInterval(part, profile, seen) {
  const nameVi = String(part.name_vi ?? "").trim() || "phụ tùng";
  let inner = paragraphsToHtml(String(part.replace_interval_text ?? ""), seen, profile);
  inner += emitP(templateIntervalExtras(profile, nameVi), seen, profile);
  if (!stripTags(inner).trim()) return "";
  return `<section class="seo-part-section">\n<h2>${escapeHtml("Bao lâu nên thay?")}</h2>\n<div class="seo-part-section__body">${inner}</div>\n</section>\n`;
}

function sectionCaution(part, profile, seen) {
  let inner = mergeFields(
    [
      part.warnings_text,
      part.garage_notes_text,
      part.buyer_mistakes_text,
    ],
    seen,
    profile,
  );
  const extras = templateCautionExtras(
    profile,
    String(part.name_vi ?? "").trim() || "phụ tùng",
  );
  for (const ex of extras) inner += emitP(ex, seen, profile);
  if (!inner.trim()) return "";
  return `<section class="seo-part-section">\n<h2>${escapeHtml("Lưu ý khi thay")}</h2>\n<div class="seo-part-section__body">${inner}</div>\n</section>\n`;
}

function sectionBuying(part, profile, seen) {
  let inner = paragraphsToHtml(String(part.buying_guide_text ?? ""), seen, profile);
  for (const x of templateBuyingExtras(
    profile,
    String(part.name_vi ?? "").trim() || "phụ tùng",
  )) {
    inner += emitP(x, seen, profile);
  }
  if (!stripTags(inner).trim()) return "";
  return `<section class="seo-part-section">\n<h2>${escapeHtml("Cách chọn mua đúng")}</h2>\n<div class="seo-part-section__body">${inner}</div>\n</section>\n`;
}

/**
 * Unique closing paragraphs to lift thin articles toward ~1100–1300 words (VN, expert tone).
 * @param {Profile} profile
 */
function tailPadLines(profile, nameVi, cat) {
  const n = nameVi || "phụ tùng";
  const g = cat || "phụ tùng";
  const common = [
    `${n}: khi vận hành xe tại Việt Nam, nhiệt độ ngoài xe và dao động tải dừng–khởi có thể rút ngắn tuổi thọ thực tế so với sách hướng dẫn — nên luôn ưu tiên triệu chứng, trạng thái chi tiết cũ và khuyến cáo hãng trước khi đổi hàng chỉ để ‘thử’.`,
    `Nhóm phụ tùng “${g}” thường liên đới đến nhiều chi tiết lân cận; chỉ căn vào một triệu chứng đơn lẻ dễ dẫn đến thay nhầm vị trí hoặc thay không xử lý hết nguyên nhân.`,
    `Khi làm việc với gara hoặc đại lý uy tín trên Otofine, hãy cung cấp biển số xe, phiên bản máy và ảnh phụ kiện cũ còn lắp trên xe để đối chiếu mã và tránh sai chênh năm sản xuất.`,
    `Phụ kiện chính hãng và phụ kiện tương đương OE không giống hàng chợ trùng khớp «nhìn bề ngoài» — đệm làm kín, mômen siết và vật liệu được thiết kế theo tải thực; chênh lệch nhỏ cũng có thể làm tái hiện lỗi sau vài trăm km.`,
    `Lịch bảo dưỡng được gợi ý trong bài chỉ là tham khảo; ô tô chở nặng, leo núi hay chạy nhiều trong thành phố nên rút ngắn hoặc mở rộng định kỳ theo cảnh báo thực tế.`,
    `Nếu sau thay đổi không hết đèn báo hay triệu chứng tái hiện, cần quét điều khiển động cơ/ABS/phanh phù hợp xe và đo sóng/thông số tại chỗ để loại các hệ thống lân cận.`,
    `Độ ẩm, bụi mịn và hóa chất lau rửa không đúng thường làm corrosion đường dẫn/khớp không nhìn thấy ở bước kiểm tra nhanh — vệ sinh mặt lắp và nguồn gốc rò là bước bắt buộc trước khi khẳng định chi tiết hỏng hoàn toàn.`,
    `Để an toàn, không nên chủ quan với các cảnh báo liên quan phanh và lái hoặc dây điện đánh lửa/cao áp tiềm ẩn đánh lửa sót khi lái.`,
  ];

  /** @type {Record<Profile, string[]>} */
  const layered = {
    ignition: [
      ...common,
      `Với các thành phần như ${n} trong hệ đánh lửa, nối âm và chất lượng bugi/phích cắm ảnh hưởng trực tiếp tới sóng và thời điểm phóng điện — nếu chỉ đổi một phần trong chuỗi có thể vẫn còn misfire.`,
      `Xe nhiều xi-lanh nên được so chỉ số và log động trước/sau để một buồng lệch không kéo các buồng khác chịu tải bất đối xứng trong thời gian dài.`,
    ],
    brake: [
      ...common,
      `Xe chạy nhiều trong mưa và nước ngập có thể tạo váng và phân bố nhiệt không đều trên má phanh và đĩa — cần kiểm tra đồng thời vệ sinh ray heo và độ chai dầu.`,
      `Đừng bỏ qua độ chai dầu phanh và đèn báo ABS khi chỉ căn vào bề ngoài má phanh — khoảng bàn đạp kéo dài hay cảm giác spongy báo hiệu cần xử lý cả cụm thủy lực.`,
    ],
    filter: [
      ...common,
      `Lọc gió nghẹt không chỉ làm giảm công suất mà có thể kéo theo sai lệch phối khí và nhiên liệu; lọc dầu tắc gây dao động áp và làm nhớt nóng quá giới.`,
      `Nhớt không đạt chỉ định hoặc lọc kém không đúng cấu tạo lõi và bypass có thể khiến van điều tiết và các cảm biến áp phản ánh không đồng bộ.`,
    ],
    steering: [
      ...common,
      `Với ${n}, cảm giác vô lăng, độ rơ và tiếng kêu khi đánh lái quan trọng hơn một mốc km cố định; cần kiểm tra rotuyn, thanh răng và trợ lực lái cùng lúc.`,
      `Sau khi thay chi tiết hệ lái, nên chạy thử trên đường thẳng và kiểm tra góc đặt bánh để tránh lệch lái hoặc mòn lốp không đều.`,
    ],
    body: [
      `${n}: khi vận hành xe tại Việt Nam, va quệt nhẹ, nắng nóng và rung gió có thể làm pát giữ, mép gấp hoặc lớp sơn xuống cấp nhanh hơn.`,
      `Nhóm thân vỏ “${g}” cần kiểm tra form dáng, khe hở lắp ráp, vị trí bắt ốc và độ khớp với chi tiết liền kề trước khi sơn hoặc hoàn thiện.`,
      `Khi làm việc với gara hoặc đại lý uy tín trên Otofine, hãy cung cấp ảnh chi tiết cũ, đời xe và phiên bản ngoại thất để đối chiếu đúng form.`,
      `Phụ kiện thân vỏ nhìn giống nhau vẫn có thể khác pát, ngàm hoặc mép bo; nên ưu tiên sản phẩm có ảnh thật và chính sách đổi trả rõ ràng.`,
    ],
    electrical: [
      ...common,
      `Với ${n}, cần kiểm tra nguồn cấp, mass, chân giắc và tín hiệu đầu ra trước khi kết luận hỏng chi tiết.`,
      `Sau khi thay chi tiết điện/điện tử, nên kiểm tra lại trạng thái báo lỗi và hoạt động thực tế ở các chế độ tải khác nhau.`,
    ],
    suspension: [
      ...common,
      `${n} và khung treo có liên đới cánh tay, rotin, chụp bụi và phuộc; kêu không hết chỉ sau thay có thể do vẫn sót lash rotin hay lệch lốp chứ không chỉ một chiều.`,
      `Xe chạy nhiều đường xấu — ổ gà, rái và gờ giảm tốc — làm cứng và nứt cao su nhanh hơn nếu chỉ nhìn số km tổng.`,
    ],
    default: [...common],
  };

  const base = layered[profile]?.length ? layered[profile] : layered.default;
  return base;
}

/**
 * Nudge word count upward when primary fields are sparse (dedup-aware).
 */
function padArticle(html, profile, nameVi, categoryName, seen) {
  if (approxWords(html) >= 1100) return html;
  const lines = tailPadLines(profile, nameVi, categoryName || "");
  let h = html;
  for (const line of lines) {
    if (approxWords(h) >= 1200) break;
    h += emitP(line, seen, profile);
  }
  return h;
}


/**
 * @param {import("mysql2").RowDataPacket} part
 * @param {{ omitSummary?: boolean }} [opts]
 * @returns {string}
 */
export function composePartArticle(part, opts = {}) {
  if (!part) return "";
  /** @type {Set<string>} */
  const seen = new Set();
  const profile = detectProfile(part);
  const nameVi = String(part.name_vi ?? "").trim() || "phụ tùng";
  const categoryName = String(part.category_name ?? "").trim();

  let html = "";
  html += sectionLaGi(part, opts, profile, seen);
  html += sectionSymptoms(part, profile, seen);
  html += sectionCauses(part, profile, seen);
  html += sectionInterval(part, profile, seen);
  html += sectionCaution(part, profile, seen);
  html += sectionBuying(part, profile, seen);

  html = padArticle(html, profile, nameVi, categoryName, seen);
  return html.trim();
}

/**
 * Opening intro for hero (summary only).
 * @param {import("mysql2").RowDataPacket} part
 */
export function composeIntroHtml(part) {
  if (!part?.summary?.trim?.()) return "";
  const seen = new Set();
  return paragraphsToHtml(part.summary, seen);
}
