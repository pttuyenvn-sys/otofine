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

// --- Token weight maps ---
const POSITION_WORDS = new Set(["truoc", "sau", "trai", "phai", "front", "rear", "left", "right"]);
const DOMAIN_WORDS = new Set(["dong co", "may", "gam", "gam xe", "lai", "phanh", "thang", "than vo", "than xe", "banh xe", "hop so"]);

const DOMAIN_CONFLICTS = [
  [["gam", "gam xe"], ["banh xe"]],
  [["dong co", "may"], ["than vo", "than xe"]],
];
const DIRECTION_CONFLICTS = [
  [["truoc", "front"], ["sau", "rear"]],
  [["trai", "left"], ["phai", "right"]],
];

function extractTokens(norm) {
  return norm.split(" ").filter(Boolean);
}

function extractDomainTokens(tokens) {
  const out = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const bi = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : null;
    if (bi && DOMAIN_WORDS.has(bi)) { out.add(bi); i++; }
    else if (DOMAIN_WORDS.has(tokens[i])) out.add(tokens[i]);
  }
  return out;
}

function extractPositionTokens(tokens) {
  const out = new Set();
  for (const t of tokens) if (POSITION_WORDS.has(t)) out.add(t);
  return out;
}

function hasDomainConflict(setA, setB) {
  for (const [groupX, groupY] of DOMAIN_CONFLICTS) {
    const aInX = groupX.some((w) => setA.has(w));
    const aInY = groupY.some((w) => setA.has(w));
    const bInX = groupX.some((w) => setB.has(w));
    const bInY = groupY.some((w) => setB.has(w));
    if ((aInX && bInY) || (aInY && bInX)) return true;
  }
  return false;
}

function hasDirectionConflict(setA, setB) {
  for (const [groupX, groupY] of DIRECTION_CONFLICTS) {
    const aInX = groupX.some((w) => setA.has(w));
    const aInY = groupY.some((w) => setA.has(w));
    const bInX = groupX.some((w) => setB.has(w));
    const bInY = groupY.some((w) => setB.has(w));
    if ((aInX && bInY) || (aInY && bInX)) return true;
  }
  return false;
}

function coreNoun(tokens) {
  return tokens.filter((t) => !POSITION_WORDS.has(t) && !DOMAIN_WORDS.has(t) && !STOP_WORDS.has(t)).join(" ");
}

function scoreRow(h1, row) {
  const hNorm = normalizePartText(h1);
  if (!hNorm) return { tier: 99, score: 0 };
  const hSlug = hNorm.replace(/\s+/g, "-");
  const hTokens = extractTokens(hNorm);
  const hDomains = extractDomainTokens(hTokens);
  const hPositions = extractPositionTokens(hTokens);
  const hCore = coreNoun(hTokens);

  const aliasNorms = aliasList(row).map((x) => normalizePartText(x)).filter(Boolean);
  const aliasSet = new Set(aliasNorms);
  const slugNorm = normalizePartText(row.slug || "");

  // --- TIER S: exact matches ---
  if (slugNorm === hNorm || slugNorm === hSlug) return { tier: 1, score: 300 };
  if (aliasSet.has(hNorm)) return { tier: 2, score: 280 };
  for (const a of aliasNorms) {
    const aSyns = SYNONYM_LOOKUP.get(a);
    if (aSyns && aSyns.includes(hNorm)) return { tier: 3, score: 260 };
  }

  // --- Shared context for TIER A/B ---
  const bestAlias = aliasNorms[0] || slugNorm;
  const aTokens = extractTokens(bestAlias);
  const aDomains = extractDomainTokens(aTokens);
  const aPositions = extractPositionTokens(aTokens);
  const aCore = coreNoun(aTokens);

  // --- Conflict penalties (hard reject) ---
  if (hasDomainConflict(hDomains, aDomains)) return { tier: 99, score: -20 };
  if (hasDirectionConflict(hPositions, aPositions)) return { tier: 99, score: -15 };

  // --- TIER A: prefix / startsWith ---
  for (const a of aliasNorms) {
    if (a.startsWith(hNorm) || hNorm.startsWith(a)) return { tier: 4, score: 200 };
  }
  if (hCore && aCore && (aCore.startsWith(hCore) || hCore.startsWith(aCore))) {
    return { tier: 5, score: 180 };
  }

  // --- TIER B: weighted token scoring ---
  let tokenScore = 0;
  const aAllText = aliasNorms.join(" ");
  for (const t of hTokens) {
    if (!aAllText.includes(t)) continue;
    if (POSITION_WORDS.has(t)) tokenScore += 6;
    else if (DOMAIN_WORDS.has(t)) tokenScore += 7;
    else if (STOP_WORDS.has(t)) tokenScore += 1;
    else tokenScore += 10;
  }
  if (hPositions.size > 0) {
    let posMatch = true;
    for (const p of hPositions) if (!aPositions.has(p)) posMatch = false;
    if (posMatch) tokenScore += 6;
    else tokenScore -= 15;
  }
  if (tokenScore > 0) return { tier: 6, score: tokenScore };

  // --- TIER C: synonym expansion ---
  const hSyns = new Set();
  for (const c of buildCandidatePhrases(h1)) {
    for (const s of expandSynonyms(c)) hSyns.add(s);
  }
  let synScore = 0;
  for (const s of hSyns) {
    if (aliasSet.has(s)) { synScore += 50; break; }
  }
  if (synScore > 0) {
    if (hPositions.size > 0) {
      let posMatch = true;
      for (const p of hPositions) if (!aPositions.has(p)) posMatch = false;
      if (posMatch) synScore += 6;
      else synScore -= 15;
    }
    return { tier: 7, score: synScore };
  }

  const popular = Number(row.searchScore ?? row.search_score ?? row.aiPriority ?? 0);
  return { tier: 8, score: Number.isFinite(popular) && popular > 60 ? 5 : 0 };
}

const SCORE_THRESHOLD = 15;

export function findBestSeoArticle(h1, dbRows = []) {
  if (!Array.isArray(dbRows) || dbRows.length === 0) return null;
  let best = null;
  let bestResult = { tier: 99, score: -Infinity };
  for (const row of dbRows) {
    const result = scoreRow(h1, row || {});
    if (
      result.tier < bestResult.tier ||
      (result.tier === bestResult.tier && result.score > bestResult.score)
    ) {
      bestResult = result;
      best = row;
    }
  }
  if (!best || bestResult.score < SCORE_THRESHOLD) return null;
  return { row: best, score: bestResult.score, tier: bestResult.tier };
}

export const PART_MATCH_DICTIONARY = {
  stopWords: [...STOP_WORDS],
  directions: DIRECTION_MAP,
  synonymGroups: SYNONYM_GROUPS,
};
