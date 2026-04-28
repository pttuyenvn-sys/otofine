export const MASTER_DATASET_VERSION = "2026.1";
export const MASTER_DATASET_BRAND = "Otofine";
export const MASTER_DATASET_LOCALE = "vi-VN";

const TEXT_FIELDS = [
  "function_text",
  "structure_text",
  "operation_text",
  "symptoms_text",
  "common_causes_text",
  "replace_interval_text",
  "warnings_text",
  "buying_guide_text",
  "garage_notes_text",
  "buyer_mistakes_text",
  "vn_usage_notes_text",
];

const SYSTEM_RULES = [
  {
    match: /(phanh|abs|brake|heo phanh|đĩa phanh|má phanh|dây đai|seat belt)/i,
    system_group: "Hệ thống phanh",
    style: "BRAKE_SAFETY",
    failure: "HIGH",
    area: "Chassis",
  },
  {
    match: /(lái|vô lăng|rotuyn|thước lái|eps|steering)/i,
    system_group: "Hệ thống lái",
    style: "STEERING_STABILITY",
    failure: "HIGH",
    area: "Cabin Front",
  },
  {
    match: /(giảm xóc|phuộc|treo|càng|stabilizer|sway|strut|shock)/i,
    system_group: "Hệ thống treo",
    style: "STEERING_STABILITY",
    failure: "MEDIUM",
    area: "Chassis",
  },
  {
    match: /(điều hòa|lạnh|dàn|lốc|quạt gió|cabin|ac|hvac)/i,
    system_group: "Hệ thống điều hòa",
    style: "CABIN_COMFORT",
    failure: "MEDIUM",
    area: "Cabin",
  },
  {
    match: /(nhiên liệu|xăng|diesel|bơm xăng|kim phun|fuel|adblue)/i,
    system_group: "Hệ thống nhiên liệu",
    style: "FUEL_EFFICIENCY",
    failure: "HIGH",
    area: "Engine Bay",
  },
  {
    match: /(xả|khí thải|egr|dpf|nox|pô|catalytic|exhaust)/i,
    system_group: "Hệ thống xả khí",
    style: "EMISSION_EFFICIENCY",
    failure: "MEDIUM",
    area: "Undercarriage",
  },
  {
    match: /(hộp số|côn|ly hợp|transmission|clutch|số)/i,
    system_group: "Hộp số",
    style: "TRANSMISSION_SMOOTHNESS",
    failure: "HIGH",
    area: "Drivetrain",
  },
  {
    match: /(đèn|relay|cảm biến|module|ecu|motor|điện|ắc quy|máy phát|alternator|sensor)/i,
    system_group: "Hệ thống điện",
    style: "ELECTRICAL_RELIABILITY",
    failure: "MEDIUM",
    area: "Electrical",
  },
  {
    match: /(kính|cửa|gương|cản|capo|cốp|thân|vỏ|body|door|mirror|bumper)/i,
    system_group: "Thân vỏ ngoại thất",
    style: "BODY_PROTECTION",
    failure: "LOW",
    area: "Body",
  },
  {
    match: /(ghế|taplo|nội thất|tapi|ốp|cabin|interior)/i,
    system_group: "Nội thất cabin",
    style: "CABIN_COMFORT",
    failure: "LOW",
    area: "Cabin",
  },
  {
    match: /(nước|két|làm mát|coolant|radiator|thermostat)/i,
    system_group: "Hệ thống làm mát",
    style: "COOLING_RELIABILITY",
    failure: "HIGH",
    area: "Engine Bay",
  },
  {
    match: /(động cơ|máy|bugi|trục|gioăng|engine|timing|turbo)/i,
    system_group: "Động cơ",
    style: "ENGINE_POWER",
    failure: "HIGH",
    area: "Engine Bay",
  },
];

const HOT_TERMS = [
  "má phanh",
  "đĩa phanh",
  "heo phanh",
  "cảm biến abs",
  "lọc dầu",
  "lọc gió",
  "lọc nhiên liệu",
  "lọc điều hòa",
  "giảm xóc",
  "rotuyn",
  "thước lái",
  "cao su càng",
  "bi moay ơ",
  "bạc đạn",
  "bán trục",
  "ắc quy",
  "máy phát",
  "máy đề",
  "bobin",
  "turbo",
  "kim phun",
  "van egr",
  "bơm xăng",
  "bơm nước",
  "két nước",
  "abs",
  "bugi",
  "dây curoa",
  "cảm biến oxy",
  "điều hòa",
  "lốc lạnh",
  "dàn lạnh",
  "cảm biến",
];

export const REGIONAL_ALIAS_DICTIONARY = {
  "bố thắng": "má phanh",
  láp: "bán trục",
  "củ đề": "máy đề",
  phuộc: "giảm xóc",
  "lọc nhớt": "lọc dầu",
};

export function stripVietnamese(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function slugifyPartName(input) {
  return stripVietnamese(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 191);
}

export function normalizeNameKey(input) {
  return stripVietnamese(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values, max = 12) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const s = String(value || "").trim();
    const key = normalizeNameKey(s);
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function classify(row) {
  const haystack = [
    row.category_name,
    row.name_vi,
    row.english_name,
    row.system_group,
    row.function_text,
  ].join(" ");
  const found = SYSTEM_RULES.find((rule) => rule.match.test(haystack));
  return (
    found || {
      system_group: row.system_group || "Phụ tùng ô tô",
      style: row.style_persona_v2 || "UNIVERSAL_TECHNICAL",
      failure: "MEDIUM",
      area: "Vehicle",
    }
  );
}

function priorityFor(row, classified) {
  const raw = String(row.seo_priority || "").trim().toUpperCase();
  if (/^(A1|A2|B|C)$/.test(raw)) return raw;
  const name = normalizeNameKey(row.category_name || row.name_vi || row.slug);
  const hot = HOT_TERMS.some((term) => name.includes(normalizeNameKey(term)));
  const demand = Number(row.demand_score) || (hot ? 88 : 52);
  const profit = Number(row.profit_score) || (hot ? 72 : 50);
  const failure = String(row.failure_level || classified?.failure || "").toUpperCase();
  if (demand >= 80 && profit >= 70 && failure === "HIGH") return "A1";
  if (demand >= 70 || hot) return "A2";
  if (name.split(" ").length <= 3 || demand >= 55) return "B";
  return "C";
}

function scoreBase(priority) {
  if (priority === "A1") return { demand: 92, competition: 72, profit: 82 };
  if (priority === "A2") return { demand: 82, competition: 62, profit: 68 };
  if (priority === "B") return { demand: 68, competition: 52, profit: 62 };
  return { demand: 46, competition: 34, profit: 48 };
}

function numericPriorityForTier(tier) {
  return { A1: 95, A2: 82, B: 60, C: 35 }[tier] ?? 35;
}

function inferVehicleTypes(systemGroup) {
  const s = normalizeNameKey(systemGroup);
  if (s.includes("diesel") || s.includes("tai")) return ["Pickup", "SUV", "Van"];
  if (s.includes("than vo") || s.includes("noi that")) return ["Sedan", "SUV", "Hatchback"];
  return ["Sedan", "SUV", "Pickup"];
}

function defaultText(categoryName, systemGroup, field) {
  const name = categoryName || "Phụ tùng này";
  const group = systemGroup || "hệ thống liên quan";
  const templates = {
    function_text: `${name} đảm nhiệm chức năng quan trọng trong ${group}, giúp xe vận hành ổn định và đúng thiết kế.`,
    structure_text: `${name} thường gồm thân chính, chi tiết liên kết và bề mặt làm việc phù hợp với vị trí lắp trên xe.`,
    operation_text: `${name} hoạt động đồng bộ với các chi tiết xung quanh để duy trì hiệu quả vận hành của ${group}.`,
    symptoms_text: `Dấu hiệu thường gặp là tiếng ồn bất thường, hoạt động kém ổn định hoặc cảnh báo lỗi liên quan trên xe.`,
    common_causes_text: `Nguyên nhân thường gặp là hao mòn tự nhiên, bụi bẩn, nhiệt độ cao, lắp sai thông số hoặc các chi tiết liên quan trong ${group} xuống cấp.`,
    replace_interval_text: `Nên kiểm tra và thay ${name.toLowerCase()} khi có dấu hiệu hư hỏng, mòn, rò rỉ hoặc theo khuyến cáo bảo dưỡng.`,
    warnings_text: `Không nên kéo dài tình trạng hư hỏng vì có thể ảnh hưởng an toàn, độ bền và chi phí sửa chữa về sau.`,
    buying_guide_text: `Chọn đúng mã phụ tùng, đúng đời xe, đúng vị trí lắp và ưu tiên nguồn hàng có bảo hành rõ ràng.`,
    garage_notes_text: `Nên kiểm tra các chi tiết liên quan trước khi thay để tránh chẩn đoán sai nguyên nhân.`,
    buyer_mistakes_text: `Sai lầm phổ biến là mua theo hình dáng gần giống nhưng không đối chiếu mã xe hoặc thông số lắp đặt.`,
    vn_usage_notes_text: `Điều kiện đường sá, khí hậu nóng ẩm và thói quen sử dụng tại Việt Nam có thể làm chi tiết xuống cấp nhanh hơn.`,
  };
  return templates[field];
}

function splitFaq(raw, categoryName) {
  const parts = String(raw || "")
    .split("||")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}||${parts[1]}`;
  return `${categoryName} hỏng có dấu hiệu gì?||Khi thay ${String(categoryName).toLowerCase()} cần lưu ý gì?`;
}

function buildAliases(row) {
  const name = row.category_name || row.name_vi || "";
  const english = row.english_name || "";
  const aliases = row.aliases || [];
  const noDiacriticSpaced = stripVietnamese(name)
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const generated = uniqueStrings([
    ...aliases,
    name,
    stripVietnamese(name).toLowerCase(),
    noDiacriticSpaced,
    english,
  ]).filter((x) => x !== name && x !== english);
  if (generated.length) return generated;
  return uniqueStrings([stripVietnamese(name).toLowerCase(), `${name} ô tô`], 2);
}

function buildRegionalAliases(row) {
  const values = [row.category_name, row.name_vi, ...(row.aliases || [])];
  const keys = values.map(normalizeNameKey).filter(Boolean);
  const aliases = [];
  for (const [regional, canonical] of Object.entries(REGIONAL_ALIAS_DICTIONARY)) {
    const canonicalKey = normalizeNameKey(canonical);
    if (keys.some((key) => key.includes(canonicalKey))) {
      aliases.push(regional);
    }
  }
  return uniqueStrings([...(row.regional_aliases || []), ...aliases], 8);
}

function buildSymptomKeywords(row) {
  const seed = String(row.symptoms_text || "")
    .replace(/[;|]/g, ",")
    .split(/[,.!?]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 4)
    .slice(0, 8);
  const words = normalizeNameKey(row.symptoms_text)
    .split(/\s+/)
    .filter((word) => word.length >= 3);
  const symptomTerms = [
    "ồn",
    "rung",
    "rò rỉ",
    "yếu",
    "kẹt",
    "lệch",
    "hao",
    "nóng",
    "khó nổ",
    "báo lỗi",
    "mất lực",
    "mòn",
  ].filter((term) => normalizeNameKey(row.symptoms_text).includes(normalizeNameKey(term)));
  const inferredByGroup = {
    "he thong phanh": ["phanh kêu", "phanh rung", "phanh yếu", "bó phanh", "đèn ABS"],
    "he thong lai": ["lái nặng", "vô lăng rơ", "xe lệch lái", "tiếng kêu gầm"],
    "he thong treo": ["xe xóc", "gầm kêu", "lốp mòn lệch", "xe bồng bềnh"],
    "he thong dieu hoa": ["điều hòa không lạnh", "gió yếu", "mùi hôi", "lốc lạnh kêu"],
    "he thong nhien lieu": ["khó nổ", "hao nhiên liệu", "máy hụt ga", "áp xăng yếu"],
    "he thong xa khi": ["khói đen", "mùi xăng sống", "đèn check engine", "pô kêu"],
    "hop so": ["sang số giật", "trễ số", "chảy dầu hộp số", "hộp số hú"],
    "he thong dien": ["đèn báo lỗi", "khó nổ", "mất điện", "chập chờn"],
    "he thong lam mat": ["máy nóng", "hao nước", "rò nước", "quạt két nước chạy liên tục"],
    "dong co": ["máy rung", "khó nổ", "hao dầu", "đèn check engine"],
  };
  const groupKey = normalizeNameKey(row.system_group);
  const inferred = Object.entries(inferredByGroup).find(([key]) =>
    groupKey.includes(key),
  )?.[1] || ["tiếng kêu bất thường", "hoạt động kém ổn định", "cảnh báo lỗi"];
  const built = uniqueStrings([...seed, ...symptomTerms, ...words.slice(0, 8)], 12);
  return built.length >= 4 ? built : uniqueStrings([...built, ...inferred], 12);
}

function buildKeywords(row) {
  const name = row.category_name || row.name_vi || "";
  const symptoms = String(row.symptoms_text || "")
    .split(/[,.]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
  return uniqueStrings([...(row.keywords || []), name, `giá ${name}`, ...symptoms], 10);
}

function buildCrossSell(row) {
  const group = normalizeNameKey(row.system_group);
  if (group.includes("phanh")) return ["má phanh", "đĩa phanh", "dầu phanh", "heo phanh", "cảm biến ABS"];
  if (group.includes("lai")) return ["thước lái", "rotuyn lái ngoài", "rotuyn cân bằng", "cảm biến góc lái", "dầu trợ lực"];
  if (group.includes("treo")) return ["giảm xóc", "cao su càng", "rotuyn trụ", "rotuyn cân bằng", "bát bèo"];
  if (group.includes("dieu hoa")) return ["lọc gió điều hòa", "lốc lạnh", "dàn lạnh", "dàn nóng", "van tiết lưu"];
  if (group.includes("nhien lieu")) return ["lọc nhiên liệu", "bơm nhiên liệu", "kim phun", "ống dẫn nhiên liệu", "cảm biến áp suất nhiên liệu"];
  if (group.includes("xa") || group.includes("khi thai")) return ["gioăng cổ xả", "cảm biến oxy", "cao su treo pô", "van EGR", "bầu catalytic"];
  if (group.includes("hop so")) return ["lọc dầu hộp số", "dầu hộp số", "solenoid hộp số", "cao su chân hộp số"];
  if (group.includes("dien")) return ["ắc quy", "cầu chì", "relay", "giắc điện", "máy phát điện"];
  if (group.includes("lam mat")) return ["két nước", "nắp két nước", "van hằng nhiệt", "bơm nước", "nước làm mát"];
  if (group.includes("dong co")) return ["lọc dầu", "lọc gió động cơ", "bugi", "gioăng nắp máy", "dây curoa"];
  if (group.includes("than vo")) return ["ghim cài", "gioăng cao su", "pát bắt", "ốp nhựa", "keo kính"];
  if (group.includes("noi that")) return ["tapi cửa", "công tắc ghế", "ốp nội thất", "cảm biến ghế"];
  return ["hàng OEM", "phụ kiện lắp đặt", "dịch vụ kiểm tra"];
}

function buildSummary(row) {
  if (row.summary && String(row.summary).trim().length >= 80) {
    return String(row.summary).trim();
  }
  return `${row.category_name} thuộc ${row.system_group}, ảnh hưởng trực tiếp đến độ ổn định và trải nghiệm vận hành. Xem dấu hiệu hỏng, nguyên nhân thường gặp, lưu ý chọn mua và khuyến nghị kiểm tra trước khi thay thế.`;
}

function buildBody(row) {
  const existing = String(row.body || "").trim();
  if (existing.length >= 600) return existing;
  const name = row.category_name || row.slug;
  const variants = [
    [
      `${name} là chi tiết thuộc ${row.system_group}, thường được người dùng quan tâm khi xe xuất hiện dấu hiệu vận hành bất thường hoặc đến kỳ bảo dưỡng. Khi đánh giá chi tiết này, cần xem đúng vị trí lắp, đời xe, mã phụ tùng và tình trạng các bộ phận liên quan để tránh thay nhầm.`,
      row.function_text,
      row.symptoms_text,
      row.common_causes_text,
      row.buying_guide_text,
      row.garage_notes_text,
      `Với điều kiện sử dụng tại Việt Nam, nên ưu tiên kiểm tra thực tế trước khi mua, đối chiếu hình ảnh và thông số, đồng thời chọn nguồn hàng có bảo hành rõ ràng. Nếu xe có cảnh báo lỗi hoặc triệu chứng lặp lại sau khi thay, cần kiểm tra toàn bộ cụm liên quan thay vì chỉ thay riêng một chi tiết.`,
    ],
    [
      `Khi ${String(name).toLowerCase()} xuống cấp, xe có thể xuất hiện nhiều biểu hiện khó chịu và đôi khi ảnh hưởng trực tiếp đến an toàn vận hành. Đây là nhóm phụ tùng cần được kiểm tra theo đúng ${row.system_group}, tránh chỉ nhìn triệu chứng bề mặt rồi kết luận vội.`,
      row.symptoms_text,
      row.function_text,
      row.common_causes_text,
      row.garage_notes_text,
      row.buying_guide_text,
      `Trước khi mua, nên đối chiếu tên gọi, mã phụ tùng, vị trí lắp và thông tin xe. Các tên gọi vùng miền hoặc tên không dấu có thể khác nhau, vì vậy cần so sánh thêm hình ảnh thực tế và hỏi rõ chính sách đổi trả nếu chưa chắc chắn.`,
    ],
    [
      `${name} nằm trong nhóm ${row.system_group} và thường liên quan đến nhiều chi tiết xung quanh. Một lỗi nhỏ ở cụm này có thể làm xe vận hành kém ổn định, tăng chi phí sửa chữa hoặc khiến người dùng thay nhầm phụ tùng nếu không kiểm tra đầy đủ.`,
      row.function_text,
      row.common_causes_text,
      row.symptoms_text,
      row.buying_guide_text,
      row.vn_usage_notes_text,
      `Khi thay thế, garage nên kiểm tra đồng thời các phụ tùng liên quan như ${row.cross_sell.join(", ")}. Cách làm này giúp phát hiện nguyên nhân gốc, giảm rủi ro quay lại sửa cùng một lỗi và tối ưu chi phí cho chủ xe.`,
    ],
  ];
  const variantIndex = Math.abs(normalizeNameKey(row.slug || name).length) % variants.length;
  const paragraphs = variants[variantIndex];
  let body = paragraphs.filter(Boolean).join("\n\n");
  while (body.length < 600) {
    body += `\n\nGợi ý thêm: kiểm tra ${String(name).toLowerCase()} cùng các phụ tùng liên quan như ${row.cross_sell.join(", ")} để tối ưu chi phí sửa chữa và giảm nguy cơ phải tháo lắp nhiều lần.`;
  }
  return body;
}

export function toMasterRow(raw, index = 0) {
  const categoryName = String(raw.category_name || raw.name_vi || raw.name || "").trim();
  const englishName = String(raw.english_name || raw.name_en || "").trim();
  const slug = String(raw.slug || slugifyPartName(categoryName)).trim().toLowerCase();
  const classified = classify(raw);
  const systemGroup = String(raw.system_group || classified.system_group).trim();
  const seoTier = priorityFor(raw, classified);
  const seoPriority = Number(raw.seo_priority_numeric ?? raw.seo_priority);
  const scores = scoreBase(seoTier);

  const row = {
    slug,
    category_name: categoryName,
    canonical_name: categoryName,
    english_name: englishName || categoryName,
    aliases: buildAliases({ ...raw, category_name: categoryName, english_name: englishName }),
    regional_aliases: [],
    system_group: systemGroup,
    sub_group: raw.sub_group || systemGroup.replace(/^Hệ thống\s+/i, ""),
    vehicle_area: raw.vehicle_area || classified.area,
    seo_tier: seoTier,
    seo_priority: Number.isFinite(seoPriority)
      ? Math.trunc(seoPriority)
      : numericPriorityForTier(seoTier),
    tier_class: seoTier.startsWith("A") ? "A" : seoTier,
    demand_score: Number(raw.demand_score) || scores.demand,
    competition_score: Number(raw.competition_score) || scores.competition,
    profit_score: Number(raw.profit_score) || scores.profit,
    ai_priority:
      Number(raw.ai_priority) ||
      numericPriorityForTier(seoTier),
    style_persona_v2:
      raw.style_persona_v2 || classified.style || "UNIVERSAL_TECHNICAL",
    brand_persona_v3: raw.brand_persona_v3 || "UNIVERSAL",
    buyer_intents_v4: uniqueStrings(raw.buyer_intents_v4 || raw.buyerIntentsV4 || ["family_use", "long_term_owner"], 6),
    compatible_vehicle_types: uniqueStrings(
      raw.compatible_vehicle_types || inferVehicleTypes(systemGroup),
      6,
    ),
    failure_level: raw.failure_level || classified.failure,
    faq_text: splitFaq(raw.faq_text, categoryName || slug),
    keywords: [],
    cross_sell: [],
    upsell: uniqueStrings(raw.upsell || ["hàng OEM", "hàng chính hãng"], 5),
    content_seed_score:
      Number(raw.content_seed_score) ||
      Math.min(99, scores.demand + (seoTier === "A1" ? 7 : 0)),
    diagnosis_weight:
      Number(raw.diagnosis_weight) ||
      ({ HIGH: 90, MEDIUM: 60, LOW: 30 }[
        String(raw.failure_level || classified.failure).toUpperCase()
      ] ?? 60),
    is_active: raw.is_active !== false,
    source_index: index,
  };

  for (const field of TEXT_FIELDS) {
    const rawText = String(raw[field] || "").trim();
    row[field] =
      rawText.length >= 24
        ? rawText
        : defaultText(categoryName, systemGroup, field);
  }

  row.keywords = buildKeywords({ ...row, keywords: raw.keywords || [] });
  row.symptom_keywords = buildSymptomKeywords(row);
  row.search_intents = uniqueStrings(
    raw.search_intents || [
      `lỗi ${categoryName}`,
      `triệu chứng ${categoryName}`,
      `khi nào thay ${categoryName}`,
      `giá ${categoryName}`,
      `${categoryName} chính hãng`,
    ],
    8,
  );
  row.search_score =
    Number(raw.search_score) ||
    Math.min(99, Math.round(row.demand_score + row.content_seed_score / 2));
  row.summary = buildSummary({ ...raw, ...row });
  row.cross_sell = uniqueStrings(raw.cross_sell || buildCrossSell(row), 8);
  row.body = buildBody({ ...raw, ...row });
  row.regional_aliases = buildRegionalAliases(row);
  return row;
}

function priorityRank(priority) {
  return { A1: 4, A2: 3, B: 2, C: 1 }[priority] || 0;
}

function mergeDuplicateRows(existing, incoming) {
  const keepIncomingPriority =
    priorityRank(incoming.seo_tier) > priorityRank(existing.seo_tier);
  const base = keepIncomingPriority ? { ...existing, ...incoming } : { ...incoming, ...existing };
  const existingBody = String(existing.body || "");
  const incomingBody = String(incoming.body || "");
  return {
    ...base,
    aliases: uniqueStrings([...(existing.aliases || []), ...(incoming.aliases || [])], 16),
    regional_aliases: uniqueStrings(
      [...(existing.regional_aliases || []), ...(incoming.regional_aliases || [])],
      12,
    ),
    keywords: uniqueStrings([...(existing.keywords || []), ...(incoming.keywords || [])], 16),
    symptom_keywords: uniqueStrings(
      [...(existing.symptom_keywords || []), ...(incoming.symptom_keywords || [])],
      16,
    ),
    search_intents: uniqueStrings(
      [...(existing.search_intents || []), ...(incoming.search_intents || [])],
      12,
    ),
    cross_sell: uniqueStrings([...(existing.cross_sell || []), ...(incoming.cross_sell || [])], 12),
    body: incomingBody.length > existingBody.length ? incoming.body : existing.body,
  };
}

export function dedupeRows(rawRows) {
  const rows = [];
  const skipped = [];
  const seenSlug = new Map();
  const seenName = new Map();

  rawRows.forEach((raw, index) => {
    const row = toMasterRow(raw, index);
    const nameKey = normalizeNameKey(row.category_name);
    if (!row.slug || row.slug.length < 3 || !nameKey) {
      skipped.push({ index, reason: "invalid_name", raw });
      return;
    }
    if (seenSlug.has(row.slug)) {
      skipped.push({ index, reason: "duplicate_slug", slug: row.slug });
      const existingIndex = seenSlug.get(row.slug);
      rows[existingIndex] = mergeDuplicateRows(rows[existingIndex], row);
      return;
    }
    if (seenName.has(nameKey)) {
      skipped.push({ index, reason: "duplicate_name", slug: row.slug });
      const existingIndex = seenName.get(nameKey);
      rows[existingIndex] = mergeDuplicateRows(rows[existingIndex], row);
      seenSlug.set(row.slug, existingIndex);
      return;
    }
    seenSlug.set(row.slug, rows.length);
    seenName.set(nameKey, rows.length);
    rows.push(row);
  });

  rows.sort((a, b) => {
    const rank = { A1: 0, A2: 1, B: 2, C: 3 };
    return (
      (rank[a.seo_tier] ?? 9) - (rank[b.seo_tier] ?? 9) ||
      b.demand_score - a.demand_score ||
      a.slug.localeCompare(b.slug)
    );
  });

  return { rows, skipped };
}

export function buildMasterDataset(rawRows) {
  const { rows, skipped } = dedupeRows(rawRows);
  return {
    dataset: {
      version: MASTER_DATASET_VERSION,
      brand: MASTER_DATASET_BRAND,
      locale: MASTER_DATASET_LOCALE,
      generated_at: new Date().toISOString(),
      rows,
    },
    summary: {
      total_input: rawRows.length,
      valid_rows: rows.length,
      duplicate_removed: skipped.filter((x) => x.reason.startsWith("duplicate")).length,
      invalid_removed: skipped.filter((x) => !x.reason.startsWith("duplicate")).length,
      skipped,
    },
  };
}

export function toPartKnowledgeImportRow(row) {
  return {
    slug: row.slug,
    category_name: row.category_name,
    english_name: row.english_name,
    canonical_name: row.canonical_name || row.category_name,
    aliases: row.aliases,
    regional_aliases: row.regional_aliases,
    summary: row.summary,
    body: row.body,
    system_group: row.system_group,
    vehicle_area: row.vehicle_area,
    seo_priority: row.seo_priority,
    seo_tier: row.seo_tier,
    tier_class: row.tier_class,
    ai_priority: row.ai_priority,
    search_score: row.search_score,
    diagnosis_weight: row.diagnosis_weight,
    style_persona_v2: row.style_persona_v2,
    brand_persona_v3: row.brand_persona_v3,
    buyer_intents_v4: row.buyer_intents_v4,
    function_text: row.function_text,
    structure_text: row.structure_text,
    operation_text: row.operation_text,
    symptoms_text: row.symptoms_text,
    common_causes_text: row.common_causes_text,
    replace_interval_text: row.replace_interval_text,
    warnings_text: row.warnings_text,
    buying_guide_text: row.buying_guide_text,
    garage_notes_text: row.garage_notes_text,
    buyer_mistakes_text: row.buyer_mistakes_text,
    vn_usage_notes_text: row.vn_usage_notes_text,
    faq_text: row.faq_text,
    symptom_keywords: row.symptom_keywords,
    search_intents: row.search_intents,
    cross_sell: row.cross_sell,
  };
}
