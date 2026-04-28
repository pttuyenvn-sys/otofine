const STOP_WORDS = new Set([
  "o to",
  "oto",
  "xe",
  "chinh hang",
  "gia re",
  "gia tot",
  "tot",
  "cao cap",
  "xinh",
  "dep",
]);

const DIRECTION_MAP = {
  trai: "left",
  left: "left",
  lh: "left",
  phai: "right",
  right: "right",
  rh: "right",
  truoc: "front",
  front: "front",
  sau: "rear",
  rear: "rear",
};

const SYNONYM_GROUPS = [
  ["ma phanh", "bo thang", "brake pad"],
  ["can", "can va", "ba do soc", "bumper"],
  ["den pha", "cum den truoc", "headlamp"],
  ["giam xoc", "phuoc nhun", "shock absorber"],
  ["loc gio dong co", "loc gio may", "air filter", "engine air filter"],
  ["ket nuoc", "radiator"],
  ["guong chieu hau", "guong", "rear view mirror", "side mirror"],
  // Enhanced automotive category synonyms
  ["can truoc", "ba đờ sốc trước", "cản va trước", "bumper trước", "front bumper"],
  ["can sau", "ba đờ sốc sau", "cản va sau", "bumper sau", "rear bumper"],
  ["he thong phanh", "he thong thang", "brake system", "braking system"],
  ["loc gio", "loc gió động cơ", "loc gió máy", "air filter", "engine air filter"],
  ["loc nhot", "loc dầu", "oil filter", "engine oil filter"],
  ["loc nhien lieu", "loc xăng", "fuel filter", "gasoline filter"],
  ["den pha led", "den pha bi led", "led headlamp", "led headlight"],
  ["den xi nhan", "den xi nhan truoc", "turn signal", "indicator light"],
  ["den phanh", "den phanh sau", "brake light", "stop light"],
  ["dong co", "may", "engine", "motor"],
  ["hop so", "hop so tu dong", "transmission", "gearbox"],
  ["he thong xả", "ong xả", "đuôi xe", "exhaust system", "muffler"],
  ["he thong lam nhiet", "ke t", "radiator", "cooling system"],
  ["giam soc truoc", "phuoc truoc", "shock absorber front", "front suspension"],
  ["giam soc sau", "phuoc sau", "shock absorber rear", "rear suspension"],
  ["bougie", "bugi", "spark plug", "ignition plug"],
  ["bobin", "bobin cao ap", "ignition coil", "coil pack"],
  ["kim phun", "kim phun xăng", "fuel injector", "injector"],
];

const SYNONYM_LOOKUP = (() => {
  const map = new Map();
  for (const group of SYNONYM_GROUPS) {
    const normalized = group.map((x) => normalizePartText(x));
    for (const k of normalized) {
      map.set(k, normalized);
    }
  }
  return map;
})();

export function normalizePartText(input = "") {
  const raw = String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const parts = raw
    .split(" ")
    .filter(Boolean)
    .filter((w) => !STOP_WORDS.has(w));
  return parts.join(" ");
}

export function extractDirections(input = "") {
  const t = normalizePartText(input);
  if (!t) return new Set();
  const out = new Set();
  for (const token of t.split(" ")) {
    const mapped = DIRECTION_MAP[token];
    if (mapped) out.add(mapped);
  }
  return out;
}

export function expandSynonyms(input = "") {
  const n = normalizePartText(input);
  if (!n) return [];
  const direct = SYNONYM_LOOKUP.get(n);
  if (direct) return [...direct];
  const out = new Set([n]);
  for (const [k, arr] of SYNONYM_LOOKUP.entries()) {
    if (n.includes(k) || k.includes(n)) {
      arr.forEach((x) => out.add(x));
    }
  }
  return [...out];
}

export function buildCandidatePhrases(input = "") {
  const n = normalizePartText(input);
  if (!n) return [];
  const parts = n.split(" ").filter(Boolean);
  const out = new Set([n, ...expandSynonyms(n)]);
  if (parts.length >= 2) {
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = i + 1; j <= parts.length; j += 1) {
        const phrase = parts.slice(i, j).join(" ").trim();
        if (phrase) out.add(phrase);
      }
    }
  }
  const dirs = [...extractDirections(n)];
  const core = parts.filter((p) => !DIRECTION_MAP[p]).join(" ").trim();
  if (core) {
    out.add(core);
    for (const d of dirs) {
      out.add(`${core} ${d}`.trim());
    }
  }
  return [...out];
}

function aliasList(row) {
  const out = [];
  const push = (x) => {
    if (x == null) return;
    const s = String(x).trim();
    if (s) out.push(s);
  };
  push(row.nameVi);
  push(row.nameEn);
  push(row.canonicalName);
  push(row.slug);
  const parseJsonArr = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    try {
      const parsed = JSON.parse(String(v));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  parseJsonArr(row.aliasesJson).forEach(push);
  parseJsonArr(row.regionalAliasesJson).forEach(push);
  return out;
}

function scoreRow(h1, row) {
  const hNorm = normalizePartText(h1);
  const candidates = buildCandidatePhrases(h1);
  const aliasNorms = aliasList(row).map((x) => normalizePartText(x)).filter(Boolean);
  const aliasSet = new Set(aliasNorms);
  let score = 0;
  if (aliasSet.has(hNorm)) score += 100;
  for (const c of candidates) {
    if (aliasSet.has(c)) {
      score += 80;
      break;
    }
  }
  for (const a of aliasNorms) {
    if (a.includes(hNorm) || hNorm.includes(a)) {
      score += 60;
      break;
    }
  }
  const synonymHits = new Set();
  for (const c of candidates) {
    for (const s of expandSynonyms(c)) {
      if (aliasSet.has(s)) synonymHits.add(s);
    }
  }
  if (synonymHits.size > 0) score += 50;

  const hDirs = extractDirections(hNorm);
  const aDirs = extractDirections(aliasNorms.join(" "));
  if (hDirs.size > 0) {
    let dirMatch = true;
    for (const d of hDirs) {
      if (!aDirs.has(d)) {
        dirMatch = false;
        break;
      }
    }
    if (dirMatch) score += 40;
    else score -= 50;
  }

  const popular = Number(row.searchScore ?? row.search_score ?? row.aiPriority ?? 0);
  if (Number.isFinite(popular) && popular > 60) score += 20;
  return score;
}

export function findBestSeoArticle(h1, dbRows = []) {
  if (!Array.isArray(dbRows) || dbRows.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const row of dbRows) {
    const score = scoreRow(h1, row || {});
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best || bestScore < 60) return null;
  return { row: best, score: bestScore };
}

export const PART_MATCH_DICTIONARY = {
  stopWords: [...STOP_WORDS],
  directions: DIRECTION_MAP,
  synonymGroups: SYNONYM_GROUPS,
};
