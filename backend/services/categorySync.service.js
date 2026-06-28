import { pool } from "../config/db.js";

// Cache for column detection results (5 minute TTL for dictionary, 1 hour for columns)
const columnCache = {
  productColumns: null,
  partKnowledgeColumns: null,
  categoryDictionary: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000, // 5 minutes for faster dictionary updates
};

/**
 * Normalize Vietnamese text for category matching
 * - Lowercase
 * - Remove diacritics
 * - Remove special characters
 * - Replace spaces with dashes for slug generation
 */
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

/**
 * Load category mappings from part_knowledge
 * Returns map: normalized_name -> canonical_name
 */
async function loadCategoryMappings() {
  // Check if canonical_name column exists
  let hasCanonicalName = false;
  try {
    const [colRows] = await pool.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'part_knowledge'
        AND COLUMN_NAME = 'canonical_name'
    `);
    hasCanonicalName = colRows.length > 0;
  } catch (e) {
    // Ignore column check errors, assume column doesn't exist
  }

  const selectCols = hasCanonicalName
    ? `name_vi, canonical_name, aliases_json`
    : `name_vi, aliases_json`;

  const [rows] = await pool.query(`
    SELECT ${selectCols}
    FROM part_knowledge
    WHERE is_active = 1
  `);

  const mappings = new Map();

  for (const row of rows) {
    const canonical = (hasCanonicalName && row.canonical_name) || row.name_vi;
    if (!canonical) continue;

    const normCanonical = normalizeText(canonical);
    mappings.set(normCanonical, canonical);

    // Map name_vi
    if (row.name_vi) {
      const normName = normalizeText(row.name_vi);
      mappings.set(normName, canonical);
    }

    // Map aliases
    if (row.aliases_json) {
      try {
        const aliases = JSON.parse(row.aliases_json);
        if (Array.isArray(aliases)) {
          for (const alias of aliases) {
            const normAlias = normalizeText(alias);
            mappings.set(normAlias, canonical);
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }

  return mappings;
}

/**
 * Load category dictionary from DB with caching
 * Returns Map: normalized match_keyword -> { canonical_name, canonical_slug, priority }
 */
async function loadCategoryDictionary(connection, forceReload = false) {
  const now = Date.now();
  
  // Return cached result if still valid (unless force reload)
  if (!forceReload && columnCache.categoryDictionary && (now - columnCache.timestamp) < columnCache.ttl) {
    console.log("[CATEGORY SYNC] Using cached category dictionary");
    return columnCache.categoryDictionary;
  }

  const [rows] = await connection.query(`
    SELECT match_keyword, canonical_name, canonical_slug, priority
    FROM category_dictionary
    WHERE is_active = 1
    ORDER BY priority DESC, match_keyword ASC
  `);

  const dictionary = new Map();
  for (const row of rows) {
    // Normalize: lowercase, remove accents, trim spaces, replace multiple spaces with single space
    const normKeyword = (row.match_keyword || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
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

  console.log(`[CATEGORY SYNC] Loaded ${dictionary.size} dictionary entries from DB${forceReload ? ' (forced reload)' : ''}`);
  
  // Cache the result
  columnCache.categoryDictionary = dictionary;
  columnCache.timestamp = now;
  
  return dictionary;
}

/**
 * Queue unmatched category name for review
 * Normalizes raw name and removes brand/model/year/SKU noise
 * Inserts into category_dictionary_queue or increments hit_count if exists
 *
 * DISABLED: category_dictionary must be treated as MANUAL SOURCE OF TRUTH
 * System should NOT auto insert or modify dictionary entries
 */
async function queueUnmatchedCategory(connection, rawName) {
  // DISABLED - category_dictionary is manual source of truth
  return;

  // Normalize and remove noise
  let normName = normalizeText(rawName);
  if (!normName) return;

  // Remove common noise patterns (brand, model, year, SKU-like patterns)
  const noisePatterns = [
    /\b\d{4}\b/g, // Year (e.g., 2020, 2021)
    /\b[a-z]{2,4}-\d{3,4}\b/gi, // SKU patterns (e.g., TO-1234)
    /\b\d{3,4}-[a-z]{2,4}\b/gi, // SKU patterns reversed
    /\b\d{6,}\b/g, // Long numbers (likely SKU/ID)
  ];

  for (const pattern of noisePatterns) {
    normName = normName.replace(pattern, '').trim();
  }

  // Remove extra spaces after noise removal
  normName = normName.replace(/\s+/g, ' ').trim();

  if (!normName || normName.length < 2) return;

  try {
    await connection.query(`
      INSERT INTO category_dictionary_queue (raw_name, normalized_name, sample_part_name, hit_count)
      VALUES (?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        hit_count = hit_count + 1,
        last_seen_at = CURRENT_TIMESTAMP
    `, [rawName, normName, rawName]);
  } catch (error) {
    console.error(`[CATEGORY SYNC] Failed to queue unmatched category: ${rawName}`, error);
  }
}

/**
 * Built-in category mapping for common parts
 * Used as fallback when part_knowledge is unavailable
 */
const BUILTIN_MAPPINGS = {
  "ba do soc truoc": "Cản trước",
  "can truoc": "Cản trước",
  "bumper truoc": "Cản trước",
  "ba do soc sau": "Cản sau",
  "can sau": "Cản sau",
  "bumper sau": "Cản sau",
  "ma phanh truoc": "Má phanh trước",
  "dia phanh truoc": "Đĩa phanh trước",
  "gu phanh truoc": "Gu phanh trước",
  "ma phanh sau": "Má phanh sau",
  "dia phanh sau": "Đĩa phanh sau",
  "gu phanh sau": "Gu phanh sau",
  "den pha": "Đèn pha",
  "den pha led": "Đèn pha LED",
  "den sau": "Đèn sau",
  "den xi nhan": "Đèn xi nhan",
  "den gat nuoc": "Đèn gạt nước",
  "guong chieu hau": "Gương chiếu hậu",
  "guong chieu truoc": "Gương chiếu trước",
  "loc gio": "Lọc gió",
  "loc dau": "Lọc dầu",
  "loc nhien lieu": "Lọc nhiên liệu",
  "loc khoang": "Lọc khí",
  "bom nuoc": "Bơm nước",
  "bom dau": "Bơm dầu",
  "bom phanh": "Bơm phanh",
  "ket nuoc": "Két nước",
  "ket nuoc dong co": "Két nước động cơ",
  "binh nuoc": "Bình nước",
  "binh dau": "Bình dầu",
  "binh lai": "Bình lái",
  "binh xich": "Bình xích",
  "dau phanh": "Dầu phanh",
  "dau lac bo": "Dầu láp",
  "dau dong co": "Dầu động cơ",
  "dau hop so": "Dầu hộp số",
  "cua so dien": "Cửa sổ điện",
  "cua so tay": "Cửa sổ tay",
  "cua so dien truoc": "Cửa sổ điện trước",
  "cua so dien sau": "Cửa sổ điện sau",
  "may lanh": "Máy lạnh",
  "dieu hoa": "Điều hòa",
  "quat giac": "Quạt gió",
  "dau hut": "Đầu hút",
  "cam bien oxy": "Cảm biến oxy",
  "cam bien nhiet do": "Cảm biến nhiệt độ",
  "cam bien toc do": "Cảm biến tốc độ",
  "cam bien ap suat": "Cảm biến áp suất",
  "bugi": "Bugi",
  "bugi den": "Bugi đen",
  "bo loc": "Bộ lọc",
  "bo loc gi": "Bộ lọc gió",
  "bo loc dau": "Bộ lọc dầu",
  "bo loc nhien lieu": "Bộ lọc nhiên liệu",
  "bo ket": "Bộ kẹt",
  "bo ket phanh": "Bộ kẹt phanh",
  "bo ket lam": "Bộ kẹt lám",
  "ro le": "Rơ le",
  "ro le canh bao": "Rơ le cảnh báo",
  "ro le gio": "Rơ le gió",
  "ro le bom nuoc": "Rơ le bơm nước",
  "ro le may lanh": "Rơ le máy lạnh",
  "ro le dieu hoa": "Rơ le điều hòa",
  "ro le den pha": "Rơ le đèn pha",
  "ro le den sau": "Rơ le đèn sau",
  "ro le den xi nhan": "Rơ le đèn xi nhan",
  "ro le den gat nuoc": "Rơ le đèn gạt nước",
  "ro le guong": "Rơ le gương",
  "ro le cua so": "Rơ le cửa sổ",
  "ro le may bơm": "Rơ le máy bơm",
  "ro le may phanh": "Rơ le máy phanh",
  "ro le may lac": "Rơ le máy lác",
  "ro le may quay": "Rơ le máy quay",
  "ro le may hut": "Rơ le máy hút",
  "ro le may thoi": "Rơ le máy thổi",
  "ro le may nen": "Rơ le máy nén",
  "ro le may gia": "Rơ le máy gia",
  "ro le may loc": "Rơ le máy lọc",
  "ro le may khuay": "Rơ le máy khuấy",
  "ro le may dong": "Rơ le máy động",
  "ro le may tinh": "Rơ le máy tính",
  "ro le may in": "Rơ le máy in",
  "ro le may scan": "Rơ le máy scan",
  "ro le may photo": "Rơ le máy photo",
  "ro le may fax": "Rơ le máy fax",
  "ro le may cat": "Rơ le máy cắt",
  "ro le may may": "Rơ le máy may",
  "ro le may khoan": "Rơ le máy khoan",
  "ro le may mài": "Rơ le máy mài",
  "ro le may do": "Rô le máy đo",
  "ro le may can": "Rơ le máy cân",
  "ro le may dem": "Rơ le máy đếm",
  "ro le may dong go": "Rơ le máy đóng gỗ",
  "ro le may cat go": "Rơ le máy cắt gỗ",
  "ro le may mai go": "Rơ le máy mài gỗ",
  "ro le may khoan go": "Rơ le máy khoan gỗ",
  "ro le may do go": "Rơ le máy đo gỗ",
  "ro le may can go": "Rơ le máy cân gỗ",
  "ro le may dem go": "Rơ le máy đếm gỗ",
};

/**
 * Map a product name to its canonical category
 */
function mapToCategory(partName, mappings) {
  if (!partName) return null;

  const norm = normalizeText(partName);

  // Check mappings from part_knowledge first
  if (mappings.has(norm)) {
    return mappings.get(norm);
  }

  // Check built-in mappings
  if (BUILTIN_MAPPINGS[norm]) {
    return BUILTIN_MAPPINGS[norm];
  }

  // Try to match partial keywords
  for (const [key, category] of Object.entries(BUILTIN_MAPPINGS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return category;
    }
  }

  // Fallback: use the original name as category
  return partName;
}

/**
 * Generate unique category slug from category name
 * Handles duplicates by appending -2, -3, etc.
 */
async function generateUniqueCategorySlug(categoryName, connection) {
  const base = normalizeText(categoryName);
  const baseSlug = `${base}-o-to`;

  // Check if base slug exists
  const [existing] = await connection.query(`
    SELECT category_slug
    FROM product_categories
    WHERE category_slug = ?
  `, [baseSlug]);

  if (existing.length === 0) {
    return baseSlug;
  }

  // Find the next available suffix
  let suffix = 2;
  while (true) {
    const candidateSlug = `${baseSlug}-${suffix}`;
    const [check] = await connection.query(`
      SELECT category_slug
      FROM product_categories
      WHERE category_slug = ?
    `, [candidateSlug]);

    if (check.length === 0) {
      return candidateSlug;
    }
    suffix++;
  }
}

/**
 * Generate H1 from category name
 */
function generateH1(categoryName) {
  return `${categoryName} ô tô`;
}

/**
 * Directional suffixes that should be merged into canonical names
 * These represent position variants that can be grouped
 */
const DIRECTIONAL_SUFFIXES = ['trước', 'sau', 'trái', 'phải', 'trên', 'dưới'];

/**
 * Categories that should NOT be merged (true separate parts)
 * These are distinct parts even with directional suffixes
 */
const SEPARATE_PART_CATEGORIES = ['cản', 'đèn', 'gương', 'bánh xe', 'cửa'];

/**
 * Deep normalize text for matching (removes accents, lowercases, removes special chars)
 */
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

/**
 * Calculate canonical name by merging directional variants and using dictionary
 * Returns proper Vietnamese display name and match source
 * @param {string} categoryName - The category name to canonicalize
 * @param {Map} dictionary - Category dictionary from DB (normalized keyword -> {canonical_name, canonical_slug, priority})
 * @param {Map} matchStats - Stats map to track dictionary matches (keyword -> count)
 */
function calculateCanonicalName(categoryName, dictionary = null, matchStats = null) {
  const deepNorm = deepNormalize(categoryName);
  const words = deepNorm.split(/\s+/);

  // Check dictionary first (priority 1)
  if (dictionary && dictionary.size > 0) {
    // Check for exact match
    if (dictionary.has(deepNorm)) {
      const entry = dictionary.get(deepNorm);
      if (matchStats) {
        matchStats.set(entry.original_keyword || deepNorm, (matchStats.get(entry.original_keyword || deepNorm) || 0) + 1);
      }
      return entry.canonical_name;
    }

    // Check for partial match (keyword is contained in category name)
    for (const [keyword, entry] of dictionary.entries()) {
      if (deepNorm.includes(keyword)) {
        // Check if it has directional suffix that should be removed
        const lastWord = words[words.length - 1];
        const displayNorm = deepNormalize(entry.canonical_name);
        
        if (DIRECTIONAL_SUFFIXES.includes(lastWord)) {
          // Remove directional suffix
          const canonicalWords = words.slice(0, -1);
          if (canonicalWords.length > 0) {
            const canonicalKey = canonicalWords.join(' ');
            // Return display name without directional suffix if it matches
            if (displayNorm === canonicalKey) {
              if (matchStats) {
                matchStats.set(entry.original_keyword || keyword, (matchStats.get(entry.original_keyword || keyword) || 0) + 1);
              }
              return entry.canonical_name;
            }
          }
        }
        
        if (matchStats) {
          matchStats.set(entry.original_keyword || keyword, (matchStats.get(entry.original_keyword || keyword) || 0) + 1);
        }
        return entry.canonical_name;
      }
    }
  }

  // Check if this is a separate part category that should not be merged (priority 2)
  for (const separateCat of SEPARATE_PART_CATEGORIES) {
    if (deepNorm.startsWith(deepNormalize(separateCat))) {
      return null; // Keep as separate
    }
  }

  // Check if ends with directional suffix (priority 3)
  const lastWord = words[words.length - 1];
  if (DIRECTIONAL_SUFFIXES.includes(lastWord)) {
    // Remove directional suffix to get canonical key
    const canonicalKey = words.slice(0, -1).join(' ');
    
    // Check if canonical key matches a dictionary entry
    if (dictionary && dictionary.has(canonicalKey)) {
      const entry = dictionary.get(canonicalKey);
      if (matchStats) {
        matchStats.set(entry.original_keyword || canonicalKey, (matchStats.get(entry.original_keyword || canonicalKey) || 0) + 1);
      }
      return entry.canonical_name;
    }
    
    // Return proper Vietnamese display name by capitalizing (priority 4 - fuzzy fallback)
    if (canonicalKey.length > 0) {
      return toTitleCase(categoryName.split(/\s+/).slice(0, -1).join(' '));
    }
  }

  return null; // No canonical transformation needed
}

/**
 * Convert string to title case for proper Vietnamese display
 */
function toTitleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate canonical slug from canonical name
 */
function generateCanonicalSlug(canonicalName) {
  const base = normalizeText(canonicalName);
  return `${base}-o-to`;
}

/**
 * Detect product column names for partName and stock
 * Uses cache with 1 hour TTL
 */
async function detectProductColumns(connection) {
  const now = Date.now();
  
  // Return cached result if still valid
  if (columnCache.productColumns && (now - columnCache.timestamp) < columnCache.ttl) {
    console.log("[CATEGORY SYNC] Using cached product column detection");
    return columnCache.productColumns;
  }

  let productNameCol = 'partName';
  let stockCol = 'stock';

  try {
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND COLUMN_NAME IN ('partName', 'part_name', 'name', 'stock', 'quantity', 'qty')
    `);
    const colSet = new Set(cols.map(c => c.COLUMN_NAME));

    // Detect product name column with priority
    if (colSet.has('partName')) productNameCol = 'partName';
    else if (colSet.has('part_name')) productNameCol = 'part_name';
    else if (colSet.has('name')) productNameCol = 'name';

    // Detect stock column with priority
    if (colSet.has('stock')) stockCol = 'stock';
    else if (colSet.has('quantity')) stockCol = 'quantity';
    else if (colSet.has('qty')) stockCol = 'qty';

    console.log(`[CATEGORY SYNC] Detected product columns: name=${productNameCol}, stock=${stockCol}`);
  } catch (e) {
    console.warn("[CATEGORY SYNC] Column detection failed, using defaults:", e.message);
  }

  const result = { productNameCol, stockCol };
  
  // Cache the result
  columnCache.productColumns = result;
  columnCache.timestamp = now;
  
  return result;
}

/**
 * Sync product categories from products table
 * Uses transaction and UPSERT to preserve existing data on failure
 */
export async function syncProductCategories() {
  console.log("[CATEGORY SYNC] Starting sync...");

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    console.log("[CATEGORY SYNC] Transaction started");

    // Detect product column names
    const cols = await detectProductColumns(connection);
    console.log(`[CATEGORY SYNC] Using product name column: ${cols.productNameCol}, stock column: ${cols.stockCol}`);

    // Simple WHERE clause: partName IS NOT NULL AND partName != '' AND stock > 0
    const whereClause = `WHERE ${cols.productNameCol} IS NOT NULL AND ${cols.productNameCol} != '' AND ${cols.stockCol} > 0`;

    // Log final SQL for debugging
    console.log(`[CATEGORY SYNC] Final SQL: SELECT id, ${cols.productNameCol} AS partName FROM products ${whereClause}`);

    // Load category mappings from part_knowledge
    const mappings = await loadCategoryMappings();
    console.log(`[CATEGORY SYNC] Loaded ${mappings.size} category mappings from part_knowledge`);

    // Load category dictionary for canonical mapping
    const dictionary = await loadCategoryDictionary(connection);
    console.log(`[CATEGORY SYNC] Loaded ${dictionary.size} dictionary entries`);

    // Get all products using detected column name
    const [products] = await connection.query(`
      SELECT id, ${cols.productNameCol} AS partName
      FROM products
      ${whereClause}
    `);
    console.log(`[CATEGORY SYNC] Processing ${products.length} products...`);

    // Group products by category
    const categoryGroups = new Map();
    const unmatchedCategories = new Set();

    for (const product of products) {
      const category = mapToCategory(product.partName, mappings);
      if (!category) {
        // Queue unmatched product names
        await queueUnmatchedCategory(connection, product.partName);
        continue;
      }

      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, []);
      }
      categoryGroups.get(category).push(product.id);
    }

    console.log(`[CATEGORY SYNC] Found ${categoryGroups.size} unique categories`);

    // Build menu order based on product count (descending)
    const sortedCategories = [...categoryGroups.entries()]
      .sort((a, b) => b[1].length - a[1].length);

    // UPSERT categories (insert or update by category_key)
    let menuOrder = 0;
    let canonicalPopulated = 0;
    let canonicalFallback = 0;
    let canonicalNull = 0;
    const dictionaryMatchStats = new Map();

    for (const [categoryName, productIds] of sortedCategories) {
      const categoryKey = normalizeText(categoryName);
      const categorySlug = await generateUniqueCategorySlug(categoryName, connection);
      const h1 = generateH1(categoryName);
      const productCount = productIds.length;

      // Calculate canonical name for merging directional variants
      let canonicalName = calculateCanonicalName(categoryName, dictionary, dictionaryMatchStats);
      let canonicalSlug = null;
      let usedFallback = false;

      // Fallback: if canonical_name is null/empty, use category_name
      if (!canonicalName || canonicalName.trim() === '') {
        canonicalName = categoryName;
        canonicalSlug = categorySlug;
        usedFallback = true;
        canonicalFallback++;
      } else {
        canonicalSlug = await generateUniqueCategorySlug(canonicalName, connection);
        canonicalPopulated++;
      }

      await connection.query(`
        INSERT INTO product_categories (
          category_key,
          category_name,
          category_slug,
          canonical_name,
          canonical_slug,
          h1,
          seo_title,
          seo_desc,
          menu_order,
          product_count,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          category_name = VALUES(category_name),
          category_slug = VALUES(category_slug),
          canonical_name = VALUES(canonical_name),
          canonical_slug = VALUES(canonical_slug),
          h1 = VALUES(h1),
          seo_title = VALUES(seo_title),
          seo_desc = VALUES(seo_desc),
          menu_order = VALUES(menu_order),
          product_count = VALUES(product_count),
          updated_at = CURRENT_TIMESTAMP
      `, [
        categoryKey,
        categoryName,
        categorySlug,
        canonicalName,
        canonicalSlug,
        h1,
        `${h1} giá tốt - Otofine`,
        `Mua bán ${categoryName.toLowerCase()} ô tô chính hãng, giá tốt tại Otofine. Đa dạng mẫu mã, chất lượng đảm bảo.`,
        menuOrder,
        productCount,
      ]);

      menuOrder++;
    }

    console.log(`[CATEGORY SYNC] Canonical stats: Populated=${canonicalPopulated}, Fallback=${canonicalFallback}, Null=${canonicalNull}`);

    // Log top matched dictionary keywords
    if (dictionaryMatchStats.size > 0) {
      const topMatches = [...dictionaryMatchStats.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, count]) => `${keyword}: ${count}`);
      console.log(`[CATEGORY SYNC] Top dictionary matches: ${topMatches.join(', ')}`);
    }

    await connection.commit();
    console.log(`[CATEGORY SYNC] Synced ${sortedCategories.length} categories`);
    console.log("[CATEGORY SYNC] Sync completed successfully");

    return {
      totalProducts: products.length,
      totalCategories: sortedCategories.length,
    };
  } catch (error) {
    await connection.rollback();
    console.error("[CATEGORY SYNC] Sync failed, transaction rolled back:", error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Keyword rules for priority B matching
 */
const KEYWORD_RULES = [
  { keywords: ["cản sau"], category: "Cản sau" },
  { keywords: ["cản trước"], category: "Cản trước" },
  { keywords: ["má phanh"], category: "Má phanh" },
  { keywords: ["lọc dầu"], category: "Lọc dầu" },
  { keywords: ["lọc gió"], category: "Lọc gió" },
  { keywords: ["đèn pha"], category: "Đèn pha" },
  { keywords: ["lòng vè", "chắn bùn"], category: "Lòng vè chắn bùn" },
];

/**
 * Find category by part_knowledge_id (Priority A)
 */
async function findCategoryByPartKnowledge(partKnowledgeId, connection) {
  if (!partKnowledgeId) return null;

  const [rows] = await connection.query(`
    SELECT category_name
    FROM part_knowledge
    WHERE id = ?
      AND is_active = 1
  `, [partKnowledgeId]);

  if (rows.length === 0) return null;

  const categoryName = rows[0].category_name;
  if (!categoryName) return null;

  // Find matching product category
  const [categories] = await connection.query(`
    SELECT id, category_name
    FROM product_categories
    WHERE category_name = ?
      AND is_active = 1
  `, [categoryName]);

  return categories.length > 0 ? categories[0] : null;
}

/**
 * Find category by keyword rules (Priority B)
 */
function findCategoryByKeywords(partName, connection) {
  const normPartName = partName.toLowerCase();
  
  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (normPartName.includes(keyword.toLowerCase())) {
        return rule.category;
      }
    }
  }
  
  return null;
}

/**
 * Find category by fuzzy match (Priority C)
 */
async function findCategoryByFuzzyMatch(partName, connection) {
  const normPartName = normalizeText(partName);
  
  const [categories] = await connection.query(`
    SELECT id, category_name
    FROM product_categories
    WHERE is_active = 1
  `);

  if (categories.length === 0) return null;

  // Find category with highest overlap
  let bestMatch = null;
  let bestScore = 0;

  for (const cat of categories) {
    const normCatName = normalizeText(cat.category_name);
    const score = calculateOverlapScore(normPartName, normCatName);
    
    if (score > bestScore && score > 0.3) { // Minimum threshold
      bestScore = score;
      bestMatch = cat;
    }
  }

  return bestMatch;
}

/**
 * Calculate overlap score for fuzzy matching
 */
function calculateOverlapScore(a, b) {
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  
  let matches = 0;
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      if (wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA)) {
        matches++;
        break;
      }
    }
  }
  
  return matches / Math.max(wordsA.length, wordsB.length);
}

/**
 * Find or create canonical root category row
 * Returns the canonical root category id
 */
async function findOrCreateCanonicalRoot(connection, canonicalName, originalCategory, createdRootsSet) {
  const normCanonical = normalizeText(canonicalName);
  
  // Try to find existing canonical root by category_key first
  const [existing] = await connection.query(`
    SELECT id, category_name, category_slug
    FROM product_categories
    WHERE category_key = ? AND is_active = 1
  `, [normCanonical]);
  
  if (existing.length > 0) {
    return existing[0].id;
  }
  
  // Create canonical root row if missing
  const categorySlug = await generateUniqueCategorySlug(canonicalName, connection);
  const h1 = generateH1(canonicalName);
  const seoTitle = `Mua bán ${canonicalName.toLowerCase()} ô tô chính hãng, giá tốt tại Otofine`;
  const seoDesc = `Mua bán ${canonicalName.toLowerCase()} ô tô chính hãng, giá tốt tại Otofine. Đa dạng mẫu mã, chất lượng đảm bảo.`;
  
  const [result] = await connection.query(`
    INSERT INTO product_categories (
      category_key, category_name, category_slug, h1, seo_title, seo_desc,
      menu_order, product_count, is_active, canonical_name, canonical_slug
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
  `, [normCanonical, canonicalName, categorySlug, h1, seoTitle, seoDesc, canonicalName, categorySlug]);
  
  createdRootsSet.add(canonicalName);
  return result.insertId;
}

/**
 * Sync product categories using simple data grouping (no mapping, no dictionary)
 */
export async function syncProductCategoryMap() {
  console.log("[CATEGORY SYNC] Starting sync...");

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    console.log("[CATEGORY SYNC] Transaction started");

    // Detect product column names
    const cols = await detectProductColumns(connection);
    console.log(`[CATEGORY SYNC] Using product name column: ${cols.productNameCol}, stock column: ${cols.stockCol}`);

    // Get all sellable products
    const [products] = await connection.query(`
      SELECT id, ${cols.productNameCol} AS partName
      FROM products
      WHERE ${cols.productNameCol} IS NOT NULL
        AND ${cols.productNameCol} != ''
        AND ${cols.stockCol} > 0
    `);
    console.log(`[CATEGORY SYNC] Total products: ${products.length}`);

    // Clean normalizeName (remove accents, keep base characters)
    function normalizeName(name) {
      return name
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // Remove diacritics
        .replace(/đ/g, "d")  // Convert đ to d
        .replace(/[^a-z0-9\s]/g, " ")  // Keep only alphanumeric and spaces
        .replace(/\s+/g, " ")
        .trim();
    }

    // Generate display name (capitalize first letter of each word, keep accents)
    function toDisplayName(name) {
      return name
        .trim()
        .replace(/\s+/g, " ")  // Normalize spaces
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }

    // Group + count with sample raw name
    const categoryMap = new Map();

    for (const product of products) {
      const raw = product.partName?.trim();
      const normalized = normalizeName(raw);
      if (!normalized || normalized.length < 3) continue;

      if (!categoryMap.has(normalized)) {
        categoryMap.set(normalized, {
          count: 1,
          sample: raw
        });
      } else {
        categoryMap.get(normalized).count++;
      }
    }

    const sorted = [...categoryMap.entries()]
      .sort((a, b) => b[1].count - a[1].count);

    console.log(`[CATEGORY SYNC] Total unique categories: ${sorted.length}`);
    console.log(`[CATEGORY SYNC] Top 20 categories:`, sorted.map(([k, v]) => [k, v.count]).slice(0, 20));

    // Sample raw vs normalized
    console.log("[CATEGORY SYNC] Sample raw vs normalized:");
    for (let i = 0; i < Math.min(5, products.length); i++) {
      const raw = products[i].partName;
      const normalized = normalizeName(raw);
      console.log(`  "${raw}" → "${normalized}"`);
    }

    // Clear existing categories
    await connection.query("DELETE FROM product_category_map");
    await connection.query("DELETE FROM product_categories");
    console.log("[CATEGORY SYNC] Cleared existing categories");

    // Insert categories
    for (const [normalized, data] of sorted) {
      const displayName = toDisplayName(data.sample);
      const slug = normalized.replace(/\s+/g, "-") + "-o-to";

      await connection.query(`
        INSERT INTO product_categories
        (category_key, category_name, category_slug, product_count, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          category_name = VALUES(category_name),
          category_slug = VALUES(category_slug),
          product_count = VALUES(product_count),
          is_active = VALUES(is_active)
      `, [normalized, displayName, slug, data.count]);
    }

    console.log(`[CATEGORY SYNC] Inserted ${sorted.length} categories`);

    // Map products to categories using same normalization logic
    console.log("[CATEGORY SYNC] Mapping products to categories...");

    // Load category map for lookup
    const [categories] = await connection.query(`
      SELECT id, category_key
      FROM product_categories
    `);
    const categoryByKey = new Map(categories.map(c => [c.category_key, c.id]));

    let mappedCount = 0;

    for (const product of products) {
      const normalized = normalizeName(product.partName || "");
      if (!normalized) continue;

      const categoryId = categoryByKey.get(normalized);
      if (categoryId) {
        await connection.query(`
          INSERT INTO product_category_map
          (product_id, category_id, is_primary, confidence, match_source)
          VALUES (?, ?, 1, 1.0, 'auto')
          ON DUPLICATE KEY UPDATE
            category_id = VALUES(category_id),
            updated_at = CURRENT_TIMESTAMP
        `, [product.id, categoryId]);
        mappedCount++;
        const { queueSearchIndexSync } = await import("./search/searchIndexDispatcher.js");
        queueSearchIndexSync(product.id, { source: "categorySync", reason: "category" });
      }
    }

    console.log(`[CATEGORY SYNC] Mapped ${mappedCount} products to categories`);

    // Recalculate product_count in product_categories
    await connection.query(`
      UPDATE product_categories pc
      SET product_count = (
        SELECT COUNT(*)
        FROM product_category_map pcm
        WHERE pcm.category_id = pc.id
      )
    `);
    console.log("[CATEGORY SYNC] Recalculated product_count");

    await connection.commit();

    console.log("[CATEGORY SYNC] Sync completed successfully");

    return {
      totalProducts: products.length,
      categoriesCreated: sorted.length,
    };
  } catch (error) {
    await connection.rollback();
    console.error("[CATEGORY SYNC] Sync failed, transaction rolled back:", error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update product counts for all categories
 * Counts only visible/sellable products (stock > 0)
 */
export async function updateCategoryCounts() {
  console.log("[CATEGORY SYNC] Updating product counts...");

  // Detect product column names
  const cols = await detectProductColumns(pool);
  console.log(`[CATEGORY SYNC] Using product name column: ${cols.productNameCol}, stock column: ${cols.stockCol}`);

  const [categories] = await pool.query(`
    SELECT id, category_name
    FROM product_categories
    WHERE is_active = 1
  `);

  for (const category of categories) {
    const categoryName = category.category_name;
    const normCategory = normalizeText(categoryName);

    // Simple WHERE clause: partName REGEXP AND stock > 0
    const whereClause = `WHERE REPLACE(REPLACE(p.${cols.productNameCol}, 'đ', 'd'), 'Đ', 'd') REGEXP ? AND ${cols.stockCol} > 0`;
    const params = [`^${normCategory}(\\\\s|$)`];

    // Log final SQL for debugging
    console.log(`[CATEGORY SYNC] Count SQL: SELECT COUNT(DISTINCT p.id) AS count FROM products p ${whereClause}`);

    // Count visible products matching this category
    const [countRows] = await pool.query(`
      SELECT COUNT(DISTINCT p.id) AS count
      FROM products p
      ${whereClause}
    `, params);
    const count = countRows[0]?.count || 0;

    await pool.query(`
      UPDATE product_categories
      SET product_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [count, category.id]);
  }

  console.log(`[CATEGORY SYNC] Updated counts for ${categories.length} categories`);
  return { updated: categories.length };
}
