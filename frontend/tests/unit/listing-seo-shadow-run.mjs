import assert from "node:assert/strict";
import { buildListingSeoIdentity } from "../../lib/listing/buildListingSeoIdentity.ts";
import { normalizeListingIdentity } from "../../lib/listing/normalizeListingIdentity.ts";
import { buildListingSeo } from "../../lib/listing/buildListingSeo.ts";
import { seoIdentityFromMarketplaceEntity } from "../../lib/listing/adapters/seoIdentityFromMarketplaceEntity.ts";
import { buildLegacyListingSeoFromEntity } from "../../lib/listing/adapters/legacyListingSeoFromEntity.ts";
import { compareListingSeoShadow } from "../../lib/listing/adapters/identityShadowCompare.ts";
import { runListingSeoShadow } from "../../lib/listing/adapters/listingSeoShadowEntry.ts";
import {
  LISTING_SEO_OWNERSHIP_BEFORE,
  LISTING_SEO_OWNERSHIP_AFTER,
} from "../../lib/listing/listingSeoOwnershipMap.ts";

function ok(msg) {
  console.log("PASS:", msg);
}

try {
  // buildListingSeoIdentity consumes ListingIdentity only
  const id = normalizeListingIdentity({
    category: "Má phanh",
    brand: "Toyota",
    model: "Vios",
    year: "2016",
  });
  const seo = buildListingSeoIdentity(id);
  assert.strictEqual(seo.h1, seo.displayLabel);
  assert.ok(seo.title.endsWith("| Otofine"));
  assert.strictEqual(seo.description, seo.h1);
  assert.ok(seo.canonicalPath.startsWith("/"));
  ok("buildListingSeoIdentity shape");

  // buildListingSeo delegates
  assert.deepStrictEqual(buildListingSeo(id), seo);
  ok("buildListingSeo delegates to buildListingSeoIdentity");

  // Category entity
  const catEntity = {
    kind: "category",
    requestSlug: "ma-phanh-o-to",
    categoryMeta: { canonicalName: "Má phanh", categoryName: "Má phanh" },
  };
  const catLegacy = buildLegacyListingSeoFromEntity(catEntity);
  const catShadow = seoIdentityFromMarketplaceEntity(catEntity);
  assert.ok(catLegacy && catShadow);
  assert.strictEqual(compareListingSeoShadow(catLegacy, catShadow).equal, true);
  ok("Category SEO shadow parity");

  // Brand vehicle entity
  const brandEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-kia",
    vehicleSeo: { parsed: { brand: "Kia" } },
  };
  const brandCmp = compareListingSeoShadow(
    buildLegacyListingSeoFromEntity(brandEntity),
    seoIdentityFromMarketplaceEntity(brandEntity),
  );
  assert.strictEqual(brandCmp.equal, true);
  ok("Brand SEO shadow parity");

  // Brand+Model
  const bmEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-kia-sedona",
    vehicleSeo: { parsed: { brand: "Kia", model: "Sedona" } },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(bmEntity),
      seoIdentityFromMarketplaceEntity(bmEntity),
    ).equal,
    true,
  );
  ok("Brand+Model SEO shadow parity");

  // Brand+Model+Year single
  const bmyEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-toyota-vios-2016",
    vehicleSeo: { parsed: { brand: "Toyota", model: "Vios", year: "2016" } },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(bmyEntity),
      seoIdentityFromMarketplaceEntity(bmyEntity),
    ).equal,
    true,
  );
  ok("Brand+Model+Year SEO shadow parity");

  // Location
  const locEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-kia-sedona-tai-ha-noi",
    vehicleSeo: {
      parsed: { brand: "Kia", model: "Sedona", locationName: "Hà Nội" },
    },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(locEntity),
      seoIdentityFromMarketplaceEntity(locEntity),
    ).equal,
    true,
  );
  ok("Location SEO shadow parity");

  // Category + location
  const catLocEntity = {
    kind: "category",
    requestSlug: "ma-phanh-o-to-tai-ha-noi",
    categoryMeta: {
      canonicalName: "Má phanh",
      cbmLocation: "Hà Nội",
    },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(catLocEntity),
      seoIdentityFromMarketplaceEntity(catLocEntity),
    ).equal,
    true,
  );
  ok("Category+Location SEO shadow parity");

  // CBMY category entity
  const cbmyEntity = {
    kind: "category",
    requestSlug: "can-truoc-kia-sedona-2014-2020",
    categoryMeta: {
      canonicalName: "Cản trước",
      cbmBrand: "Kia",
      cbmModel: "Sedona",
      cbmYear: "2014-2020",
    },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(cbmyEntity),
      seoIdentityFromMarketplaceEntity(cbmyEntity),
    ).equal,
    true,
  );
  ok("CBMY SEO shadow parity");

  // Brand+Model+Year + location
  const bmyLocEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-toyota-vios-2016-tai-ha-noi",
    vehicleSeo: {
      parsed: { brand: "Toyota", model: "Vios", year: "2016", locationName: "Hà Nội" },
    },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(bmyLocEntity),
      seoIdentityFromMarketplaceEntity(bmyLocEntity),
    ).equal,
    true,
  );
  ok("Brand+Model+Year+Location SEO shadow parity");

  // Vehicle year range (BMY range URL)
  const bmyRangeEntity = {
    kind: "vehicle",
    requestSlug: "phu-tung-kia-sedona-2014-2020",
    vehicleSeo: { parsed: { brand: "Kia", model: "Sedona", year: "2014-2020" } },
  };
  assert.strictEqual(
    compareListingSeoShadow(
      buildLegacyListingSeoFromEntity(bmyRangeEntity),
      seoIdentityFromMarketplaceEntity(bmyRangeEntity),
    ).equal,
    true,
  );
  ok("Brand+Model+YearRange SEO shadow parity");

  // Product out of scope
  assert.strictEqual(buildLegacyListingSeoFromEntity({ kind: "product" }), null);
  assert.strictEqual(seoIdentityFromMarketplaceEntity({ kind: "product" }), null);
  ok("Product remains out of ListingIdentity SEO scope");

  // Shadow entry flag gating
  const prev = process.env.LISTING_IDENTITY_SHADOW;
  delete process.env.LISTING_IDENTITY_SHADOW;
  assert.strictEqual(runListingSeoShadow({ entity: bmEntity }), null);
  process.env.LISTING_IDENTITY_SHADOW = "true";
  const shadowRun = runListingSeoShadow({ entity: bmEntity });
  assert.ok(shadowRun?.equal);
  ok("SEO shadow entry flag gating");

  if (prev === undefined) delete process.env.LISTING_IDENTITY_SHADOW;
  else process.env.LISTING_IDENTITY_SHADOW = prev;

  // Ownership map present
  assert.ok(LISTING_SEO_OWNERSHIP_BEFORE.length >= 4);
  assert.ok(LISTING_SEO_OWNERSHIP_AFTER.length >= 4);
  ok("SEO ownership map exported");

  console.log("Listing SEO shadow unit checks passed.");
} catch (err) {
  console.error("Listing SEO shadow tests failed:", err?.message ?? err);
  process.exitCode = 2;
}
