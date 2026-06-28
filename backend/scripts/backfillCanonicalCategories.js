/**
 * Backfill canonical_name / canonical_slug on existing product_categories rows.
 * Logic mirrors categorySync.service.js (calculateCanonicalName, generateCanonicalSlug).
 *
 * Usage: node scripts/backfillCanonicalCategories.js
 */
import { pool } from "../config/db.js";

const DIRECTIONAL_SUFFIXES = ["trước", "sau", "trái", "phải", "trên", "dưới"];
const SEPARATE_PART_CATEGORIES = ["cản", "đèn", "gương", "bánh xe", "cửa"];

function normalizeText(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function deepNormalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function calculateCanonicalName(categoryName, dictionary = null, matchStats = null) {
  const deepNorm = deepNormalize(categoryName);
  const words = deepNorm.split(/\s+/);

  if (dictionary && dictionary.size > 0) {
    if (dictionary.has(deepNorm)) {
      const entry = dictionary.get(deepNorm);
      if (matchStats) {
        matchStats.set(
          entry.original_keyword || deepNorm,
          (matchStats.get(entry.original_keyword || deepNorm) || 0) + 1,
        );
      }
      return entry.canonical_name;
    }

    for (const [keyword, entry] of dictionary.entries()) {
      if (deepNorm.includes(keyword)) {
        const lastWord = words[words.length - 1];
        const displayNorm = deepNormalize(entry.canonical_name);

        if (DIRECTIONAL_SUFFIXES.includes(lastWord)) {
          const canonicalWords = words.slice(0, -1);
          if (canonicalWords.length > 0) {
            const canonicalKey = canonicalWords.join(" ");
            if (displayNorm === canonicalKey) {
              if (matchStats) {
                matchStats.set(
                  entry.original_keyword || keyword,
                  (matchStats.get(entry.original_keyword || keyword) || 0) + 1,
                );
              }
              return entry.canonical_name;
            }
          }
        }

        if (matchStats) {
          matchStats.set(
            entry.original_keyword || keyword,
            (matchStats.get(entry.original_keyword || keyword) || 0) + 1,
          );
        }
        return entry.canonical_name;
      }
    }
  }

  for (const separateCat of SEPARATE_PART_CATEGORIES) {
    if (deepNorm.startsWith(deepNormalize(separateCat))) {
      return null;
    }
  }

  const lastWord = words[words.length - 1];
  if (DIRECTIONAL_SUFFIXES.includes(lastWord)) {
    const canonicalKey = words.slice(0, -1).join(" ");

    if (dictionary && dictionary.has(canonicalKey)) {
      const entry = dictionary.get(canonicalKey);
      if (matchStats) {
        matchStats.set(
          entry.original_keyword || canonicalKey,
          (matchStats.get(entry.original_keyword || canonicalKey) || 0) + 1,
        );
      }
      return entry.canonical_name;
    }

    if (canonicalKey.length > 0) {
      return toTitleCase(categoryName.split(/\s+/).slice(0, -1).join(" "));
    }
  }

  return null;
}

function generateCanonicalSlug(canonicalName) {
  const base = normalizeText(canonicalName);
  return `${base}-o-to`;
}

async function loadCategoryDictionary(connection) {
  const [rows] = await connection.query(`
    SELECT match_keyword, canonical_name, canonical_slug, priority
    FROM category_dictionary
    WHERE is_active = 1
    ORDER BY priority DESC, match_keyword ASC
  `);

  const dictionary = new Map();
  for (const row of rows) {
    const normKeyword = (row.match_keyword || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");

    if (normKeyword) {
      dictionary.set(normKeyword, {
        canonical_name: row.canonical_name,
        canonical_slug: row.canonical_slug,
        priority: row.priority || 0,
        original_keyword: row.match_keyword,
      });
    }
  }

  return dictionary;
}

async function countCanonicalColumns(connection) {
  const [[row]] = await connection.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN canonical_name IS NOT NULL AND canonical_name != '' THEN 1 ELSE 0 END) AS with_name,
      SUM(CASE WHEN canonical_slug IS NOT NULL AND canonical_slug != '' THEN 1 ELSE 0 END) AS with_slug
    FROM product_categories
  `);
  return row;
}

async function fetchHomepageCanonicalRows(connection) {
  const [rows] = await connection.query(`
    SELECT
      canonical_name,
      canonical_slug,
      SUM(product_count) AS total_product_count
    FROM product_categories
    WHERE canonical_name IS NOT NULL
      AND canonical_name != ''
      AND canonical_slug IS NOT NULL
      AND canonical_slug != ''
      AND approved = 1
      AND is_active = 1
    GROUP BY canonical_name, canonical_slug
    ORDER BY total_product_count DESC
    LIMIT 30
  `);
  return rows;
}

async function main() {
  const connection = await pool.getConnection();

  try {
    console.log("[BACKFILL CANONICAL] Starting...");
    const before = await countCanonicalColumns(connection);
    console.log("[BACKFILL CANONICAL] Before:", before);

    const dictionary = await loadCategoryDictionary(connection);
    console.log(`[BACKFILL CANONICAL] Dictionary entries: ${dictionary.size}`);

    const [rows] = await connection.query(`
      SELECT id, category_name, category_slug
      FROM product_categories
      ORDER BY id ASC
    `);

    let populated = 0;
    let fallback = 0;
    let remainingNull = 0;

    await connection.beginTransaction();

    for (const row of rows) {
      let canonicalName = calculateCanonicalName(row.category_name, dictionary);
      let canonicalSlug = null;

      if (!canonicalName || canonicalName.trim() === "") {
        canonicalName = row.category_name;
        canonicalSlug = row.category_slug;
        fallback++;
      } else {
        canonicalSlug = generateCanonicalSlug(canonicalName);
        populated++;
      }

      if (
        !canonicalName ||
        canonicalName.trim() === "" ||
        !canonicalSlug ||
        canonicalSlug.trim() === ""
      ) {
        remainingNull++;
      }

      await connection.query(
        `
          UPDATE product_categories
          SET
            canonical_name = ?,
            canonical_slug = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [canonicalName, canonicalSlug, row.id],
      );
    }

    await connection.commit();

    const after = await countCanonicalColumns(connection);
    const canonicalRows = await fetchHomepageCanonicalRows(connection);
    const payloadBytes = Buffer.byteLength(JSON.stringify(canonicalRows), "utf8");

    console.log("[BACKFILL CANONICAL] Stats:", {
      totalRows: rows.length,
      populated,
      fallback,
      remainingNull,
    });
    console.log("[BACKFILL CANONICAL] After:", after);
    console.log("[BACKFILL CANONICAL] Homepage /canonical estimate:", {
      rows: canonicalRows.length,
      payloadBytes,
      payloadKb: Math.round((payloadBytes / 1024) * 10) / 10,
    });
    console.log("[BACKFILL CANONICAL] Done.");
  } catch (error) {
    await connection.rollback();
    console.error("[BACKFILL CANONICAL] Failed:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
