import { publicShopConfig } from "../domains/shopPublic/config/publicShop.config.js";
import {
  findOwnedShop,
  findShopIdBySlug,
  updatePublicPageConfig,
} from "../domains/shopPublic/repositories/sellerPublicPage.repository.js";
import {
  buildSlugValidationState,
  validateAdminStorefrontSlug,
} from "../domains/shopPublic/validators/adminStorefrontSlug.validators.js";
import { fromDbStatus } from "../domains/shopPublic/validators/sellerPublicPage.validators.js";
import {
  buildStorefrontPreviewUrl,
} from "../domains/shopPublic/utils/storefrontPreviewUrl.util.js";
import { insertSlugHistory } from "../domains/shopPublic/repositories/shopSlugHistory.repository.js";
import { getSchemaCapabilities } from "../utils/schemaCapabilities.js";
import { pool } from "../config/db.js";
import {
  evaluateStorefrontReadiness,
  STOREFRONT_READINESS_PUBLISH_MIN,
} from "../utils/storefrontReadiness.util.js";

const READINESS_PUBLISH_MIN = STOREFRONT_READINESS_PUBLISH_MIN;
const BLOCKED_ACCOUNT_STATUSES = new Set(["blocked", "suspended"]);

const STOREFRONT_MODERATION_ACTIONS = new Set([
  "publish_storefront",
  "suspend_storefront",
  "restore_storefront",
  "unpublish_storefront",
  "submit_review",
]);

let _invalidateShop = null;
async function getInvalidateShop() {
  if (!_invalidateShop) {
    const mod = await import("../domains/shopPublic/cache/caches.js");
    _invalidateShop = mod.invalidateShop;
  }
  return _invalidateShop;
}

async function invalidateShopSlugs(...slugs) {
  const invalidateShop = await getInvalidateShop();
  for (const slug of slugs) {
    if (!slug) continue;
    try {
      invalidateShop(slug);
    } catch (err) {
      console.error("[adminShopStorefront] cache invalidation error:", err.message);
    }
  }
}

async function safeInsertSlugHistory(shopId, oldSlug, newSlug) {
  try {
    const caps = await getSchemaCapabilities();
    if (!caps.hasShopSlugHistory) return;
    await insertSlugHistory(shopId, oldSlug, newSlug);
  } catch (err) {
    console.warn("[adminShopStorefront] slug history skipped:", err?.message || err);
  }
}

function mapStorefrontView(row, ownerOfSlug) {
  if (!row) return null;
  const publicStatus = row.public_status ?? null;
  const slug = row.slug ?? null;
  const validationState = buildSlugValidationState({
    slug,
    shopId: row.id,
    ownerOfSlug,
  });

  return {
    shopId: row.id,
    slug,
    publicStatus,
    sellerPublicStatus: publicStatus ? fromDbStatus(publicStatus) : "draft",
    storefrontEnabled: String(publicStatus || "").trim().toLowerCase() === "public",
    shopsiteEnabled: publicShopConfig.enabled,
    subdomainEnabled: publicShopConfig.subdomainEnabled,
    lastUpdatedAt: row.updatedAt || null,
    publishedAt: row.published_at || null,
    storefrontPreview: slug ? buildStorefrontPreviewUrl(slug, publicStatus) : null,
    validationState,
  };
}

export async function getAdminShopStorefront(shopId) {
  const row = await findOwnedShop(shopId);
  if (!row) return null;
  const ownerOfSlug = row.slug ? await findShopIdBySlug(row.slug) : null;
  return mapStorefrontView(row, ownerOfSlug);
}

function normalizePublicStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function isInactivePublicStatus(status) {
  const s = normalizePublicStatus(status);
  return !s || s === "pending" || s === "inactive";
}

function accountBlocked(accountStatus) {
  return BLOCKED_ACCOUNT_STATUSES.has(normalizePublicStatus(accountStatus));
}

async function fetchShopStorefrontModerationContext(shopId) {
  const [rows] = await pool.query(
    `
      SELECT
        s.id,
        s.accountId,
        s.slug,
        s.public_status,
        s.avatar,
        s.cover_image,
        s.cover,
        s.intro_html,
        s.bio,
        s.descriptionHtml,
        s.phone AS shopPhone,
        s.zalo,
        s.zalo_phone AS zaloPhone,
        sa.name AS accountName,
        sa.phone AS accountPhone,
        sa.status AS accountStatus,
        COALESCE(pc.approvedModerationCount, 0) AS approvedModerationCount
      FROM shops s
      LEFT JOIN shop_accounts sa ON sa.id = s.accountId
      LEFT JOIN (
        SELECT
          shopId,
          SUM(CASE WHEN TRIM(LOWER(moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approvedModerationCount
        FROM products
        WHERE shopId IS NOT NULL
        GROUP BY shopId
      ) pc ON pc.shopId = s.id
      WHERE s.id = ?
      LIMIT 1
    `,
    [shopId],
  );
  return rows[0] || null;
}

async function fetchActiveEnforcementSuspension(shopId) {
  const [rows] = await pool.query(
    `
      SELECT id
      FROM admin_shop_suspensions
      WHERE shop_id = ?
        AND lifted_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW(3))
      LIMIT 1
    `,
    [shopId],
  );
  return rows[0] || null;
}

function buildReadinessInput(ctx) {
  return {
    name: ctx.accountName,
    accountName: ctx.accountName,
    avatar: ctx.avatar,
    cover_image: ctx.cover_image,
    cover: ctx.cover,
    intro_html: ctx.intro_html,
    bio: ctx.bio,
    descriptionHtml: ctx.descriptionHtml,
    shopPhone: ctx.shopPhone,
    accountPhone: ctx.accountPhone,
    zalo: ctx.zalo,
    zaloPhone: ctx.zaloPhone,
    slug: ctx.slug,
    approvedModerationCount: ctx.approvedModerationCount,
  };
}

function assertAccountAllowsStorefrontAction(ctx) {
  if (accountBlocked(ctx?.accountStatus)) {
    return {
      ok: false,
      status: 403,
      body: {
        error: "Seller account is blocked",
        code: "ACCOUNT_BLOCKED",
      },
    };
  }
  return { ok: true };
}

function assertReadinessForPublish(ctx) {
  const readiness = evaluateStorefrontReadiness(buildReadinessInput(ctx));
  if (readiness.score < READINESS_PUBLISH_MIN) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Storefront readiness too low",
        code: "READINESS_TOO_LOW",
        readiness,
      },
    };
  }
  return { ok: true, readiness };
}

async function finishStorefrontModeration(shopId, {
  action,
  previousStatus,
  nextStatus,
  unchanged = false,
}) {
  const view = await getAdminShopStorefront(shopId);
  return {
    status: 200,
    body: {
      ok: true,
      action,
      unchanged,
      before: { public_status: previousStatus },
      after: { public_status: nextStatus },
      storefront: view,
    },
  };
}

async function applyPublicStatusChange(shopId, nextStatus, slug) {
  await updatePublicPageConfig(shopId, { public_status: nextStatus });
  if (slug) await invalidateShopSlugs(slug);
}

/**
 * Publish storefront — pending/inactive → public.
 */
export async function publishStorefront(shopId) {
  const ctx = await fetchShopStorefrontModerationContext(shopId);
  if (!ctx) return { status: 404, body: { error: "shop not found" } };

  const previousStatus = ctx.public_status ?? null;
  const status = normalizePublicStatus(previousStatus);

  if (status === "public") {
    return finishStorefrontModeration(shopId, {
      action: "publish_storefront",
      previousStatus,
      nextStatus: "public",
      unchanged: true,
    });
  }

  if (status === "suspended") {
    return {
      status: 409,
      body: {
        error: "Storefront is suspended; use restore_storefront",
        code: "STOREFRONT_SUSPENDED",
      },
    };
  }

  const accountCheck = assertAccountAllowsStorefrontAction(ctx);
  if (!accountCheck.ok) return { status: accountCheck.status, body: accountCheck.body };

  if (!String(ctx.slug || "").trim()) {
    return {
      status: 400,
      body: { error: "assign a slug before publishing storefront", code: "NO_SLUG" },
    };
  }

  const readinessCheck = assertReadinessForPublish(ctx);
  if (!readinessCheck.ok) {
    return { status: readinessCheck.status, body: readinessCheck.body };
  }

  await applyPublicStatusChange(shopId, "public", ctx.slug);
  return finishStorefrontModeration(shopId, {
    action: "publish_storefront",
    previousStatus,
    nextStatus: "public",
  });
}

/**
 * Suspend storefront visibility — public → suspended (does not block seller account).
 */
export async function suspendStorefront(shopId) {
  const ctx = await fetchShopStorefrontModerationContext(shopId);
  if (!ctx) return { status: 404, body: { error: "shop not found" } };

  const previousStatus = ctx.public_status ?? null;
  const status = normalizePublicStatus(previousStatus);

  if (status === "suspended") {
    return finishStorefrontModeration(shopId, {
      action: "suspend_storefront",
      previousStatus,
      nextStatus: "suspended",
      unchanged: true,
    });
  }

  if (status !== "public") {
    return {
      status: 409,
      body: {
        error: "Only public storefronts can be suspended",
        code: "INVALID_STATE",
      },
    };
  }

  await applyPublicStatusChange(shopId, "suspended", ctx.slug);
  return finishStorefrontModeration(shopId, {
    action: "suspend_storefront",
    previousStatus,
    nextStatus: "suspended",
  });
}

/**
 * Restore storefront — suspended → public.
 */
export async function restoreStorefront(shopId) {
  const ctx = await fetchShopStorefrontModerationContext(shopId);
  if (!ctx) return { status: 404, body: { error: "shop not found" } };

  const previousStatus = ctx.public_status ?? null;
  const status = normalizePublicStatus(previousStatus);

  if (status === "public") {
    return finishStorefrontModeration(shopId, {
      action: "restore_storefront",
      previousStatus,
      nextStatus: "public",
      unchanged: true,
    });
  }

  if (status !== "suspended") {
    return {
      status: 409,
      body: {
        error: "Storefront is not suspended",
        code: "INVALID_STATE",
      },
    };
  }

  const accountCheck = assertAccountAllowsStorefrontAction(ctx);
  if (!accountCheck.ok) return { status: accountCheck.status, body: accountCheck.body };

  const enforcement = await fetchActiveEnforcementSuspension(shopId);
  if (enforcement) {
    return {
      status: 409,
      body: {
        error:
          "Shop is enforcement-suspended; reinstate via enforcement before restoring storefront",
        code: "ENFORCEMENT_SUSPENDED",
      },
    };
  }

  if (!String(ctx.slug || "").trim()) {
    return {
      status: 400,
      body: { error: "assign a slug before restoring storefront", code: "NO_SLUG" },
    };
  }

  await applyPublicStatusChange(shopId, "public", ctx.slug);
  return finishStorefrontModeration(shopId, {
    action: "restore_storefront",
    previousStatus,
    nextStatus: "public",
  });
}

/**
 * Submit storefront for admin review — draft/inactive → pending (no auto-publish).
 */
export async function submitStorefrontForReview(shopId) {
  const ctx = await fetchShopStorefrontModerationContext(shopId);
  if (!ctx) return { status: 404, body: { error: "shop not found" } };

  const previousStatus = ctx.public_status ?? null;
  const status = normalizePublicStatus(previousStatus);

  if (status === "public") {
    return finishStorefrontModeration(shopId, {
      action: "submit_review",
      previousStatus,
      nextStatus: "public",
      unchanged: true,
    });
  }

  if (status === "suspended") {
    return {
      status: 409,
      body: {
        error: "Storefront is suspended",
        code: "STOREFRONT_SUSPENDED",
      },
    };
  }

  const accountCheck = assertAccountAllowsStorefrontAction(ctx);
  if (!accountCheck.ok) return { status: accountCheck.status, body: accountCheck.body };

  if (!String(ctx.slug || "").trim()) {
    return {
      status: 400,
      body: {
        error: "assign a slug before submitting for review",
        code: "NO_SLUG",
      },
    };
  }

  const readinessCheck = assertReadinessForPublish(ctx);
  if (!readinessCheck.ok) {
    return { status: readinessCheck.status, body: readinessCheck.body };
  }

  if (status === "pending") {
    return finishStorefrontModeration(shopId, {
      action: "submit_review",
      previousStatus,
      nextStatus: "pending",
      unchanged: true,
    });
  }

  await applyPublicStatusChange(shopId, "pending", ctx.slug);
  return finishStorefrontModeration(shopId, {
    action: "submit_review",
    previousStatus,
    nextStatus: "pending",
  });
}

/**
 * Unpublish storefront — public → pending (draft).
 */
export async function unpublishStorefront(shopId) {
  const ctx = await fetchShopStorefrontModerationContext(shopId);
  if (!ctx) return { status: 404, body: { error: "shop not found" } };

  const previousStatus = ctx.public_status ?? null;
  const status = normalizePublicStatus(previousStatus);

  if (isInactivePublicStatus(previousStatus)) {
    return finishStorefrontModeration(shopId, {
      action: "unpublish_storefront",
      previousStatus,
      nextStatus: "pending",
      unchanged: true,
    });
  }

  if (status !== "public") {
    return {
      status: 409,
      body: {
        error: "Only public storefronts can be unpublished",
        code: "INVALID_STATE",
      },
    };
  }

  await applyPublicStatusChange(shopId, "pending", ctx.slug);
  return finishStorefrontModeration(shopId, {
    action: "unpublish_storefront",
    previousStatus,
    nextStatus: "pending",
  });
}

async function runStorefrontModerationAction(shopId, actionName) {
  switch (actionName) {
    case "publish_storefront":
      return publishStorefront(shopId);
    case "suspend_storefront":
      return suspendStorefront(shopId);
    case "restore_storefront":
      return restoreStorefront(shopId);
    case "unpublish_storefront":
      return unpublishStorefront(shopId);
    case "submit_review":
      return submitStorefrontForReview(shopId);
    default:
      return { status: 400, body: { error: "invalid action" } };
  }
}

/**
 * Admin storefront mutations. shopId MUST be shops.id (integer PK).
 *
 * Actions: create_slug | rename_slug | disable_storefront | enable_storefront
 */
export async function mutateAdminShopStorefront(shopId, { action, slug: rawSlug }) {
  const shop = await findOwnedShop(shopId);
  if (!shop) return { status: 404, body: { error: "shop not found" } };

  const actionName = String(action || "").trim();
  if (STOREFRONT_MODERATION_ACTIONS.has(actionName)) {
    return runStorefrontModerationAction(shopId, actionName);
  }

  const allowed = new Set(["create_slug", "rename_slug", "disable_storefront", "enable_storefront"]);
  if (!allowed.has(actionName)) {
    return { status: 400, body: { error: "invalid action" } };
  }

  const previousSlug = shop.slug || null;
  const previousStatus = shop.public_status || null;
  let slugsToInvalidate = [];

  if (actionName === "create_slug") {
    if (shop.slug) {
      return { status: 409, body: { error: "shop already has a slug; use rename_slug" } };
    }
    const owner = await findShopIdBySlug(rawSlug);
    const validated = validateAdminStorefrontSlug(rawSlug, shopId, owner);
    if (!validated.ok) {
      return { status: 400, body: { error: validated.error, code: validated.code } };
    }
    await updatePublicPageConfig(shopId, { slug: validated.slug });
    slugsToInvalidate = [validated.slug];
  }

  if (actionName === "rename_slug") {
    if (!shop.slug) {
      return { status: 409, body: { error: "shop has no slug; use create_slug" } };
    }
    const owner = await findShopIdBySlug(rawSlug);
    const validated = validateAdminStorefrontSlug(rawSlug, shopId, owner);
    if (!validated.ok) {
      return { status: 400, body: { error: validated.error, code: validated.code } };
    }
    if (validated.slug === shop.slug) {
      const view = await getAdminShopStorefront(shopId);
      return { status: 200, body: { ok: true, unchanged: true, storefront: view } };
    }
    await updatePublicPageConfig(shopId, { slug: validated.slug });
    await safeInsertSlugHistory(shopId, previousSlug, validated.slug);
    slugsToInvalidate = [previousSlug, validated.slug];
  }

  if (actionName === "disable_storefront") {
    const status = String(shop.public_status || "").trim().toLowerCase();
    if (status === "suspended") {
      return {
        status: 409,
        body: {
          error: "Shop is enforcement-suspended; reinstate via enforcement before changing storefront visibility",
          code: "ENFORCEMENT_SUSPENDED",
        },
      };
    }
    if (status === "pending") {
      const view = await getAdminShopStorefront(shopId);
      return { status: 200, body: { ok: true, unchanged: true, storefront: view } };
    }
    await updatePublicPageConfig(shopId, { public_status: "pending" });
    if (previousSlug) slugsToInvalidate = [previousSlug];
  }

  if (actionName === "enable_storefront") {
    if (!shop.slug) {
      return { status: 400, body: { error: "assign a slug before enabling storefront", code: "NO_SLUG" } };
    }
    const status = String(shop.public_status || "").trim().toLowerCase();
    if (status === "suspended") {
      return {
        status: 409,
        body: {
          error: "Shop is enforcement-suspended; use enforcement reinstate, not enable_storefront",
          code: "ENFORCEMENT_SUSPENDED",
        },
      };
    }
    if (status === "public") {
      const view = await getAdminShopStorefront(shopId);
      return { status: 200, body: { ok: true, unchanged: true, storefront: view } };
    }
    await updatePublicPageConfig(shopId, { public_status: "public" });
    slugsToInvalidate = [shop.slug];
  }

  await invalidateShopSlugs(...slugsToInvalidate);

  const view = await getAdminShopStorefront(shopId);
  return {
    status: 200,
    body: {
      ok: true,
      action: actionName,
      before: { slug: previousSlug, publicStatus: previousStatus },
      storefront: view,
    },
  };
}
