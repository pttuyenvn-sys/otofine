/**
 * Frozen query corpus generator — identical algorithm to search-index-parity-audit-01.mjs
 * Exported for mismatch analysis corpus freeze.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function typoWord(w, rng) {
  if (w.length < 4) return w;
  const i = Math.floor(rng() * (w.length - 2)) + 1;
  const chars = w.split("");
  chars[i] = String.fromCharCode(97 + Math.floor(rng() * 26));
  return chars.join("");
}

async function sampleRows(pool, sql, limit) {
  const [rows] = await pool.query(sql, [limit]);
  return rows;
}

export async function generateQuerySet(pool) {
  const rng = mulberry32(Number(process.env.PARITY_QUERY_SEED || 20260622));
  const QUERY_TARGET = Number(process.env.PARITY_AUDIT_QUERIES || 10000);
  const queries = [];
  const seen = new Set();

  const add = (q, type) => {
    const kw = String(q.query || q.keyword || q.q || "").trim();
    if (!kw || kw.length < 1) return;
    const key = JSON.stringify(q);
    if (seen.has(key)) return;
    seen.add(key);
    queries.push({ ...q, query: kw, _type: type });
  };

  const partRows = await sampleRows(
    pool,
    `SELECT partNumber FROM products WHERE partNumber IS NOT NULL AND TRIM(partNumber) <> '' ORDER BY id DESC LIMIT ?`,
    2000,
  );
  for (const r of partRows) add({ query: r.partNumber }, "oem");

  const [brandRows] = await pool.query(
    `SELECT DISTINCT hang_xe AS brand FROM car_models WHERE hang_xe IS NOT NULL AND TRIM(hang_xe) <> '' LIMIT 40`,
  );
  const [modelRows] = await pool.query(
    `SELECT hang_xe AS brand, ten_xe AS model FROM car_models
     WHERE hang_xe IS NOT NULL AND ten_xe IS NOT NULL
     GROUP BY hang_xe, ten_xe ORDER BY MIN(id) LIMIT ?`,
    [400],
  );
  for (const r of brandRows) add({ query: r.brand }, "brand");
  for (const r of modelRows) {
    add({ query: r.model, brand: r.brand }, "brand+model");
    add({ query: `${r.brand} ${r.model}` }, "brand+model-phrase");
  }

  const catRows = await sampleRows(
    pool,
    `SELECT category_name, canonical_name FROM product_categories WHERE is_active = 1 ORDER BY id LIMIT ?`,
    300,
  );
  for (const r of catRows) {
    const c = r.canonical_name || r.category_name;
    add({ query: c }, "category");
    if (brandRows[0]) add({ query: c, brand: brandRows[0].brand }, "category+brand");
    if (modelRows[0]) add({ query: c, brand: modelRows[0].brand, model: modelRows[0].model }, "category+brand+model");
  }

  const kwRows = await sampleRows(
    pool,
    `SELECT search_keywords FROM product_meta WHERE search_keywords IS NOT NULL AND TRIM(search_keywords) <> '' ORDER BY product_id LIMIT ?`,
    1500,
  );
  for (const r of kwRows) {
    const parts = String(r.search_keywords).split(/[,;|]/).map((x) => x.trim()).filter((x) => x.length >= 2);
    for (const p of parts.slice(0, 3)) add({ query: p }, "keyword");
  }

  const nameRows = await sampleRows(
    pool,
    `SELECT partName FROM products WHERE partName IS NOT NULL ORDER BY id DESC LIMIT ?`,
    2000,
  );
  for (const r of nameRows) {
    const words = String(r.partName).split(/\s+/).filter((w) => w.length >= 3);
    if (words.length) add({ query: words.slice(0, Math.min(4, words.length)).join(" ") }, "free-text");
    if (words.length >= 2) add({ query: typoWord(words.join(" "), rng) }, "typo");
  }

  for (const e of ["brake pad", "oil filter", "spark plug", "timing belt", "water pump", "fuel pump", "air filter"]) {
    add({ query: e }, "english");
  }
  for (const s of ["ốp", "đèn", "mâm", "lốp", "bugi", "ắc", "còi"]) add({ query: s }, "short");
  for (const l of [
    "phu tung thay the chinh hang cho xe con",
    "linh kien bao duong dinh ky o to toyota honda mazda",
  ]) add({ query: l }, "long");

  while (queries.length < QUERY_TARGET) {
    const base = queries[Math.floor(rng() * queries.length)];
    const q = { ...base };
    if (rng() < 0.3 && brandRows.length) {
      q.brand = brandRows[Math.floor(rng() * brandRows.length)].brand;
    }
    if (rng() < 0.2 && modelRows.length) {
      const m = modelRows[Math.floor(rng() * modelRows.length)];
      q.brand = m.brand;
      q.model = m.model;
    }
    if (rng() < 0.1) q.year = String(2015 + Math.floor(rng() * 10));
    q._type = "random-mix";
    const key = JSON.stringify(q);
    if (!seen.has(key)) {
      seen.add(key);
      queries.push(q);
    }
    if (seen.size > QUERY_TARGET * 3) break;
  }

  return queries.slice(0, QUERY_TARGET);
}
