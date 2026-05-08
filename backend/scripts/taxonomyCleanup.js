import { pool } from "../config/db.js";

/**
 * Phase 2 Taxonomy Cleanup Script
 * Analyzes product_categories table and generates taxonomy cleanup suggestions
 */

// Ignore tokens - words to strip when matching
const IGNORE_TOKENS = [
  'trước', 'sau', 'trái', 'phải', 'trong', 'ngoài', 'bên',
  'có led', 'không led', 'led', 'đèn', 'máy', 'động cơ'
];

// Categories that should remain separate (true distinct parts)
const SEPARATE_PARTS = [
  'cản', 'đèn', 'gương', 'bánh xe', 'cửa'
];

/**
 * Deep normalize text for matching
 */
function deepNormalize(str) {
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
 * Remove ignore tokens from text
 */
function removeIgnoreTokens(text) {
  let result = text;
  for (const token of IGNORE_TOKENS) {
    const normToken = deepNormalize(token);
    const regex = new RegExp(`\\b${normToken}\\b`, 'gi');
    result = result.replace(regex, '').trim();
  }
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Calculate similarity between two strings (Jaccard index)
 */
function calculateSimilarity(str1, str2) {
  const set1 = new Set(str1.split(' '));
  const set2 = new Set(str2.split(' '));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Group categories by canonical form
 */
function groupCategoriesByCanonical(categories) {
  const groups = new Map();
  const canonicalMap = new Map(); // original -> canonical

  for (const cat of categories) {
    const normName = deepNormalize(cat.category_name);
    const withoutTokens = removeIgnoreTokens(normName);
    
    // Check if this is a separate part
    let isSeparate = false;
    for (const part of SEPARATE_PARTS) {
      if (normName.startsWith(deepNormalize(part))) {
        isSeparate = true;
        break;
      }
    }

    // Generate canonical key
    let canonicalKey;
    if (isSeparate) {
      canonicalKey = normName; // Keep separate parts as-is
    } else {
      canonicalKey = withoutTokens || normName;
    }

    // Find or create group
    if (!groups.has(canonicalKey)) {
      groups.set(canonicalKey, {
        canonicalKey,
        categories: [],
        totalCount: 0,
        isSeparate
      });
    }

    const group = groups.get(canonicalKey);
    group.categories.push(cat);
    group.totalCount += cat.product_count || 0;
    canonicalMap.set(cat.category_name, canonicalKey);
  }

  return { groups, canonicalMap };
}

/**
 * Generate suggested dictionary inserts
 */
function generateDictionaryInserts(groups) {
  const inserts = [];
  let priority = 100;

  for (const [key, group] of groups) {
    if (group.isSeparate || group.categories.length <= 1) continue;

    // Use the category with highest product_count as canonical display name
    const canonicalCat = group.categories
      .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0];

    for (const cat of group.categories) {
      if (cat.category_name !== canonicalCat.category_name) {
        const normKeyword = deepNormalize(cat.category_name);
        const normCanonical = deepNormalize(canonicalCat.category_name);
        
        inserts.push({
          match_keyword: normKeyword,
          canonical_name: canonicalCat.category_name,
          canonical_slug: deepNormalize(canonicalCat.category_name) + '-o-to',
          priority: priority--,
          is_active: 1,
          original_count: cat.product_count || 0,
          canonical_count: canonicalCat.product_count || 0
        });
      }
    }
  }

  return inserts.sort((a, b) => b.canonical_count - a.canonical_count);
}

async function main() {
  console.log("[TAXONOMY CLEANUP] Starting Phase 2 taxonomy cleanup...\n");

  try {
    // Load all categories from product_categories
    const [categories] = await pool.query(`
      SELECT id, category_name, category_slug, product_count
      FROM product_categories
      WHERE is_active = 1
      ORDER BY product_count DESC
    `);

    console.log(`[TAXONOMY CLEANUP] Loaded ${categories.length} categories from database\n`);

    // Group categories by canonical form
    const { groups, canonicalMap } = groupCategoriesByCanonical(categories);
    console.log(`[TAXONOMY CLEANUP] Grouped into ${groups.size} canonical groups\n`);

    // Sort groups by total count
    const sortedGroups = [...groups.entries()]
      .sort((a, b) => b[1].totalCount - a[1].totalCount);

    // Output top 100 canonical categories
    console.log("=".repeat(80));
    console.log("TOP 100 CANONICAL CATEGORIES");
    console.log("=".repeat(80));
    console.log();

    const top100 = sortedGroups.slice(0, 100);
    top100.forEach(([key, group], index) => {
      const canonicalCat = group.categories
        .sort((a, b) => (b.product_count || 0) - (a.product_count || 0))[0];
      
      console.log(`${index + 1}. ${canonicalCat.category_name}`);
      console.log(`   Canonical key: ${key}`);
      console.log(`   Total products: ${group.totalCount}`);
      console.log(`   Variants: ${group.categories.map(c => c.category_name).join(', ')}`);
      console.log(`   Separate: ${group.isSeparate ? 'YES' : 'NO'}`);
      console.log();
    });

    // Output unmapped noisy categories (singletons with low count)
    console.log("=".repeat(80));
    console.log("UNMAPPED NOISY CATEGORIES (singletons with < 10 products)");
    console.log("=".repeat(80));
    console.log();

    const singletons = sortedGroups.filter(([key, group]) => 
      group.categories.length === 1 && group.totalCount < 10
    );

    singletons.forEach(([key, group]) => {
      const cat = group.categories[0];
      console.log(`- ${cat.category_name} (${cat.product_count} products)`);
    });
    console.log(`Total: ${singletons.length} noisy categories\n`);

    // Generate suggested dictionary inserts
    const inserts = generateDictionaryInserts(groups);

    console.log("=".repeat(80));
    console.log("SUGGESTED DICTIONARY INSERTS");
    console.log("=".repeat(80));
    console.log();

    if (inserts.length === 0) {
      console.log("No new dictionary entries suggested.\n");
    } else {
      console.log("-- Run this SQL to insert new dictionary entries:\n");
      console.log("INSERT INTO category_dictionary (match_keyword, canonical_name, canonical_slug, priority, is_active) VALUES");
      
      const values = inserts.map((insert, index) => {
        const isLast = index === inserts.length - 1;
        return `  ('${insert.match_keyword}', '${insert.canonical_name}', '${insert.canonical_slug}', ${insert.priority}, ${insert.is_active})${isLast ? ';' : ','}`;
      });
      
      console.log(values.join('\n'));
      console.log();
      console.log(`Total: ${inserts.length} suggested entries\n`);
    }

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total categories: ${categories.length}`);
    console.log(`Canonical groups: ${groups.size}`);
    console.log(`Separate parts groups: ${[...groups.values()].filter(g => g.isSeparate).length}`);
    console.log(`Merged groups: ${[...groups.values()].filter(g => !g.isSeparate && g.categories.length > 1).length}`);
    console.log(`Singletons: ${[...groups.values()].filter(g => g.categories.length === 1).length}`);
    console.log(`Noisy singletons (< 10 products): ${singletons.length}`);
    console.log(`Suggested dictionary inserts: ${inserts.length}`);
    console.log();

    process.exit(0);
  } catch (error) {
    console.error("[TAXONOMY CLEANUP] Error:", error);
    process.exit(1);
  }
}

main();
