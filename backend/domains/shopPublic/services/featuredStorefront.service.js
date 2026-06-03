import { getSchemaCapabilities } from "../../../utils/schemaCapabilities.js";
import {
  compactFeaturedStorefront,
  isFeaturedStorefront,
} from "../../../utils/featuredStorefront.util.js";
import { listFeaturedStorefrontCandidates } from "../repositories/featuredStorefront.repository.js";
import { toShopCardDto } from "./shopDirectory.service.js";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 12;

function mapRowToFeaturedInput(row) {
  return {
    name: row.name,
    accountName: row.name,
    avatar: row.avatar,
    cover_image: row.cover_image ?? row.cover,
    cover: row.cover,
    intro_html: row.intro_html,
    bio: row.bio,
    descriptionHtml: row.descriptionHtml,
    shopPhone: row.shopPhone ?? row.phone,
    accountPhone: row.accountPhone,
    zalo: row.zalo,
    zaloPhone: row.zaloPhone,
    slug: row.slug,
    publicStatus: row.publicStatus,
    shopPublicStatus: row.publicStatus,
    accountStatus: row.accountStatus,
    productCount: row.productCount,
    approvedModerationCount: row.approvedModerationCount,
    rejectedModerationCount: row.rejectedModerationCount,
    approvedWithImageCount: row.approvedWithImageCount,
    approvedWithPriceCount: row.approvedWithPriceCount,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt,
    shopUpdatedAt: row.shopUpdatedAt ?? row.updatedAt,
    verifiedAt: row.verified_at,
    rfqCount30d: row.rfqCount30d,
    hasEnforcementSuspension: Boolean(Number(row.hasEnforcementSuspension)),
  };
}

/**
 * Featured storefront discovery — deterministic, capped, read-only.
 */
export async function getFeaturedStorefronts(input = {}) {
  const rawLimit = Number(input.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  const caps = await getSchemaCapabilities();
  const rows = await listFeaturedStorefrontCandidates({
    includeStorefrontEvents: caps.hasStorefrontEvents,
    includeEnforcement: caps.hasAdminShopSuspensions,
  });

  const evaluated = rows
    .map((row) => ({
      row,
      featured: isFeaturedStorefront(mapRowToFeaturedInput(row)),
    }))
    .filter(({ featured }) => featured.eligible);

  evaluated.sort((a, b) => {
    if (b.featured.score !== a.featured.score) return b.featured.score - a.featured.score;
    return Number(a.row.id) - Number(b.row.id);
  });

  const items = evaluated.slice(0, limit).map(({ row, featured }) => ({
    ...toShopCardDto(row),
    featured: {
      score: featured.score,
      reasons: featured.reasons,
    },
  }));

  return {
    items,
    total: evaluated.length,
    limit,
  };
}

export { compactFeaturedStorefront, isFeaturedStorefront };
