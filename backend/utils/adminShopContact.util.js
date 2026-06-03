import { normalizePhoneVN } from "../modules/rfq/utils/rfqCreateValidation.js";
import { resolveShopZalo } from "./resolveShopZalo.js";

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function digitsOnly(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Comparable contact keys for duplicate detection (groundwork — no DB column).
 * Returns E164 when valid VN mobile, plus trailing digit suffix.
 */
export function buildContactKeys(...rawValues) {
  const keys = new Set();
  for (const raw of rawValues) {
    if (!hasText(raw)) continue;
    const trimmed = String(raw).trim();
    const e164 = normalizePhoneVN(trimmed);
    if (e164) keys.add(e164);
    const digits = digitsOnly(trimmed);
    if (digits.length >= 9) {
      keys.add(digits.slice(-10));
      keys.add(digits.slice(-9));
    }
  }
  return [...keys];
}

function normalizeField(raw) {
  if (!hasText(raw)) {
    return { value: null, normalized: null, present: false };
  }
  const value = String(raw).trim();
  const e164 = normalizePhoneVN(value);
  return {
    value,
    normalized: e164 || digitsOnly(value) || value,
    present: true,
  };
}

function zaloDrift(row) {
  const z = String(row?.zalo || "").trim();
  const zp = String(row?.zaloPhone || row?.zalo_phone || "").trim();
  if (!z && !zp) return false;
  if (!z || !zp) return false;
  const keysZ = buildContactKeys(z);
  const keysP = buildContactKeys(zp);
  return !keysZ.some((k) => keysP.includes(k));
}

function phoneDrift(shopPhone, accountPhone) {
  if (!hasText(shopPhone) || !hasText(accountPhone)) return false;
  const shopKeys = buildContactKeys(shopPhone);
  const accountKeys = buildContactKeys(accountPhone);
  return !shopKeys.some((k) => accountKeys.includes(k));
}

/**
 * Derived contact intelligence from existing shop / account columns.
 * @param {object} row
 */
export function buildContactSummary(row = {}) {
  const shopPhone = normalizeField(row.shopPhone);
  const accountPhone = normalizeField(row.accountPhone ?? row.phone);
  const zaloColumn = normalizeField(row.zalo);
  const zaloPhoneColumn = normalizeField(row.zaloPhone ?? row.zalo_phone);
  const resolvedZalo = resolveShopZalo(row, { phoneFallback: false });
  const zalo = normalizeField(resolvedZalo);

  const driftFlags = [];
  if (phoneDrift(shopPhone.value, accountPhone.value)) {
    driftFlags.push("account_shop_phone_mismatch");
  }
  if (zaloDrift(row)) {
    driftFlags.push("zalo_column_drift");
  }

  const duplicateKeys = buildContactKeys(
    shopPhone.value,
    accountPhone.value,
    zaloColumn.value,
    zaloPhoneColumn.value,
  );

  const primaryPhone = shopPhone.present ? shopPhone.value : accountPhone.present ? accountPhone.value : null;
  const primaryZalo = zalo.present ? zalo.value : null;
  const hasAnyContact = shopPhone.present || accountPhone.present || zalo.present || zaloPhoneColumn.present;
  const storefrontContactReady = shopPhone.present || zalo.present || zaloPhoneColumn.present;

  return {
    shopPhone,
    accountPhone,
    zalo: {
      ...zalo,
      source: zaloColumn.present ? "zalo" : zaloPhoneColumn.present ? "zalo_phone" : null,
    },
    zaloColumns: {
      zalo: zaloColumn,
      zaloPhone: zaloPhoneColumn,
      drift: driftFlags.includes("zalo_column_drift"),
    },
    email: {
      shop: hasText(row.shopEmail) ? String(row.shopEmail).trim() : null,
      account: hasText(row.accountEmail ?? row.email) ? String(row.accountEmail ?? row.email).trim() : null,
    },
    primaryPhone,
    primaryZalo,
    hasAnyContact,
    storefrontContactReady,
    driftFlags,
    duplicateKeys,
  };
}

function detectMatchedField(row, contactKeys) {
  const fields = [
    ["accountPhone", row.accountPhone],
    ["shopPhone", row.shopPhone],
    ["zalo", row.zalo],
    ["zaloPhone", row.zaloPhone],
  ];
  for (const [field, value] of fields) {
    if (!hasText(value)) continue;
    const keys = buildContactKeys(value);
    if (keys.some((k) => contactKeys.includes(k))) {
      return { field, value: String(value).trim() };
    }
  }
  return { field: "unknown", value: null };
}

/**
 * Read-only duplicate phone lookup across shop_accounts + shops.
 * Groundwork for future governance alerts — bounded, single query.
 */
export async function findDuplicatePhoneMatches(pool, { accountId, contactKeys = [] }) {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0 || !contactKeys.length) {
    return { count: 0, matches: [] };
  }

  const suffixes = [...new Set(contactKeys.map((k) => String(k).replace(/\D/g, "").slice(-9)).filter((s) => s.length >= 9))];
  if (!suffixes.length) return { count: 0, matches: [] };

  const orParts = [];
  const params = [id];
  for (const suffix of suffixes) {
    const pattern = `%${suffix}`;
    orParts.push(
      "sa.phone LIKE ?",
      "s.phone LIKE ?",
      "s.zalo LIKE ?",
      "s.zalo_phone LIKE ?",
    );
    params.push(pattern, pattern, pattern, pattern);
  }

  const [rows] = await pool.query(
    `
      SELECT
        sa.id AS accountId,
        sa.name AS accountName,
        sa.phone AS accountPhone,
        s.id AS governanceShopId,
        s.slug,
        s.phone AS shopPhone,
        s.zalo,
        s.zalo_phone AS zaloPhone,
        s.public_status AS shopPublicStatus
      FROM shop_accounts sa
      LEFT JOIN shops s ON s.accountId = sa.id
      WHERE sa.status != 'deleted'
        AND sa.id != ?
        AND (${orParts.join(" OR ")})
      LIMIT 25
    `,
    params,
  );

  const seen = new Set();
  const matches = [];
  for (const row of rows || []) {
    const key = `${row.accountId}:${row.governanceShopId || 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = detectMatchedField(row, contactKeys);
    matches.push({
      accountId: row.accountId,
      governanceShopId: row.governanceShopId != null ? Number(row.governanceShopId) : null,
      name: row.accountName || null,
      slug: row.slug || null,
      shopPublicStatus: row.shopPublicStatus || null,
      matchedField: hit.field,
      matchedValue: hit.value,
    });
  }

  return { count: matches.length, matches };
}
