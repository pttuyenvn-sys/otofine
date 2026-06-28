/**
 * SEARCH-INVERTED-RUNTIME-CANARY-01 — legacy vs inverted comparison.
 */

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} k
 */
export function topKOverlap(a, b, k) {
  const sliceA = a.slice(0, k);
  if (!sliceA.length) return 1;
  const setB = new Set(b.slice(0, k));
  let hit = 0;
  for (const id of sliceA) if (setB.has(id)) hit += 1;
  return hit / sliceA.length;
}

/**
 * @param {number[]} legacyTop100
 * @param {number[]} invertedCandidates
 */
export function candidateRecall(legacyTop100, invertedCandidates) {
  const legacy = legacyTop100.slice(0, 100);
  if (!legacy.length) return 1;
  const candSet = new Set(invertedCandidates);
  let hit = 0;
  for (const id of legacy) if (candSet.has(id)) hit += 1;
  return hit / legacy.length;
}

/**
 * @param {object} suggest
 * @param {number[]} topIds
 * @param {object} [inventory]
 */
export function buildCompareSnapshot(suggest, topIds, inventory = {}) {
  const groups = (suggest?.groups || []).map((g) => ({
    title: g.title,
    count: Number(g.count) || 0,
    url: g.url,
    canonical_name: g.canonical_name,
    canonical_slug: g.canonical_slug,
    brand: g.brand,
    model: g.model,
    year: g.year,
    productIds: (g.products || []).map((p) => Number(p.id)).filter(Boolean),
  }));

  const categories = (suggest?.categories || []).map((c) => ({
    id: c.id ?? c.category_id,
    name: c.name ?? c.category_name,
    slug: c.slug ?? c.canonical_slug,
    url: c.url,
    count: c.count ?? c.total_count,
  }));

  const vehicleGroups = (inventory?.vehicleGroups || []).map((g) => ({
    title: g.title,
    brand: g.brand,
    model: g.model,
    year: g.year,
    count: g.total_count ?? g.count,
    canonical_slug: g.canonical_slug,
  }));

  const categoryGroups = (inventory?.categoryGroups || []).map((g) => ({
    name: g.name ?? g.category_name,
    slug: g.canonical_slug ?? g.slug,
    count: g.total_count ?? g.count,
  }));

  return {
    topIds: topIds.map(Number).filter(Boolean),
    groups,
    viewAll: suggest?.viewAll || { label: "", url: "/" },
    categories,
    vehicleGroups,
    categoryGroups,
    allPopupProductIds: groups.flatMap((g) => g.productIds),
    groupCount: groups.length,
    popupProductCount: groups.reduce((n, g) => n + g.productIds.length, 0),
  };
}

/**
 * @param {ReturnType<typeof buildCompareSnapshot>} legacy
 * @param {ReturnType<typeof buildCompareSnapshot>} inverted
 */
export function compareSnapshots(legacy, inverted) {
  const parity = {
    top1: topKOverlap(legacy.topIds, inverted.topIds, 1),
    top3: topKOverlap(legacy.topIds, inverted.topIds, 3),
    top5: topKOverlap(legacy.topIds, inverted.topIds, 5),
    top10: topKOverlap(legacy.topIds, inverted.topIds, 10),
    top20: topKOverlap(legacy.topIds, inverted.topIds, 20),
  };

  /** @type {string[]} */
  const mismatchReasons = [];
  /** @type {string[]} */
  const mismatchTypes = [];

  const legacyTop10 = new Set(legacy.topIds.slice(0, 10));
  const invertedTop10 = new Set(inverted.topIds.slice(0, 10));
  for (const id of legacyTop10) {
    if (!invertedTop10.has(id)) {
      mismatchTypes.push("missing_product");
      mismatchReasons.push(`missing_in_inverted_top10:${id}`);
      break;
    }
  }
  for (const id of invertedTop10) {
    if (!legacyTop10.has(id)) {
      mismatchTypes.push("extra_product");
      mismatchReasons.push(`extra_in_inverted_top10:${id}`);
      break;
    }
  }

  if (parity.top10 < 1 && !mismatchTypes.includes("different_order")) {
    mismatchTypes.push("different_order");
    mismatchReasons.push("top10_ranking_order");
  }

  if (legacy.viewAll?.url !== inverted.viewAll?.url) {
    mismatchTypes.push("wrong_url");
    mismatchReasons.push(`view_all_url:${legacy.viewAll?.url}|${inverted.viewAll?.url}`);
  }

  const maxGroups = Math.max(legacy.groups.length, inverted.groups.length);
  for (let i = 0; i < maxGroups; i += 1) {
    const lg = legacy.groups[i];
    const ig = inverted.groups[i];
    if (!lg || !ig) {
      mismatchTypes.push("wrong_vehicle");
      mismatchReasons.push(`group_count:${legacy.groups.length}|${inverted.groups.length}`);
      break;
    }
    if (lg.url !== ig.url) {
      mismatchTypes.push("wrong_url");
      mismatchReasons.push(`group_url:${lg.url}|${ig.url}`);
    }
    if (lg.canonical_slug !== ig.canonical_slug) {
      mismatchTypes.push("wrong_canonical");
      mismatchReasons.push(`group_canonical:${lg.canonical_slug}|${ig.canonical_slug}`);
    }
    if (lg.brand !== ig.brand || lg.model !== ig.model) {
      mismatchTypes.push("wrong_vehicle");
      mismatchReasons.push(`vehicle:${lg.brand}/${lg.model}|${ig.brand}/${ig.model}`);
    }
    if (lg.count !== ig.count) {
      mismatchTypes.push("wrong_popup");
      mismatchReasons.push(`popup_count:${lg.title}:${lg.count}|${ig.count}`);
    }
    const lp = lg.productIds.join(",");
    const ip = ig.productIds.join(",");
    if (lp !== ip) {
      mismatchTypes.push("wrong_popup");
      mismatchReasons.push(`popup_products:${lg.title}`);
    }
  }

  if (legacy.categoryGroups.length !== inverted.categoryGroups.length) {
    mismatchTypes.push("wrong_category");
    mismatchReasons.push(`category_group_count:${legacy.categoryGroups.length}|${inverted.categoryGroups.length}`);
  } else {
    for (let i = 0; i < legacy.categoryGroups.length; i += 1) {
      const lc = legacy.categoryGroups[i];
      const ic = inverted.categoryGroups[i];
      if (lc.slug !== ic.slug || lc.name !== ic.name) {
        mismatchTypes.push("wrong_category");
        mismatchReasons.push(`category:${lc.name}|${ic.name}`);
        break;
      }
    }
  }

  const uniqueTypes = [...new Set(mismatchTypes)];

  return {
    parity,
    mismatchTypes: uniqueTypes,
    mismatchReasons,
    shouldLog:
      parity.top10 < 1
      || uniqueTypes.some((t) =>
        ["wrong_url", "wrong_canonical", "wrong_popup", "missing_product"].includes(t),
      ),
  };
}

/**
 * @param {object} metrics
 */
export function meetsCanaryPassConditions(metrics) {
  return (
    metrics.avgTop10Parity >= 0.99
    && metrics.avgTop20Parity >= 0.995
    && metrics.avgRecall >= 0.99
    && metrics.missingProducts === 0
    && metrics.wrongUrls === 0
    && metrics.wrongPopup === 0
  );
}
