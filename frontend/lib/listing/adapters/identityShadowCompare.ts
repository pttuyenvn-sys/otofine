/**
 * Pure shadow diff between legacy listing builders and ListingIdentity egress.
 * No side effects, no logging (ARCH-MP-03B.1 / ARCH-MP-03B.2).
 */

import type { ListingSeoIdentity } from "../ListingIdentity.types";

export type ShadowComparable = {
  h1: string;
  url: string;
  query: string;
};

export type ShadowFieldName = "h1" | "url" | "query";

export type SeoShadowFieldName = "h1" | "title" | "description" | "canonical";

export type ShadowFieldDiff = {
  field: ShadowFieldName;
  legacy: string;
  next: string;
};

export type SeoShadowFieldDiff = {
  field: SeoShadowFieldName;
  legacy: string;
  next: string;
};

export type ShadowComparisonResult = {
  equal: boolean;
  diffs: ShadowFieldDiff[];
  legacy: ShadowComparable;
  next: ShadowComparable;
};

export type SeoShadowComparisonResult = {
  equal: boolean;
  diffs: SeoShadowFieldDiff[];
  legacy: ListingSeoIdentity;
  next: ListingSeoIdentity;
};

function normalizeComparable(value: ShadowComparable): ShadowComparable {
  return {
    h1: String(value.h1 ?? "").trim(),
    url: String(value.url ?? "").trim(),
    query: String(value.query ?? "").trim(),
  };
}

function normalizeSeoIdentity(value: ListingSeoIdentity): ListingSeoIdentity {
  return {
    displayLabel: String(value.displayLabel ?? "").trim(),
    h1: String(value.h1 ?? "").trim(),
    title: String(value.title ?? "").trim(),
    description: String(value.description ?? "").trim(),
    canonicalPath: String(value.canonicalPath ?? "").trim(),
  };
}

/**
 * Compare legacy vs ListingIdentity-derived H1, URL path, and query string.
 */
export function compareListingIdentityShadow(
  legacyInput: ShadowComparable,
  nextInput: ShadowComparable,
): ShadowComparisonResult {
  const legacy = normalizeComparable(legacyInput);
  const next = normalizeComparable(nextInput);

  const fields: ShadowFieldName[] = ["h1", "url", "query"];
  const diffs: ShadowFieldDiff[] = [];

  for (const field of fields) {
    if (legacy[field] !== next[field]) {
      diffs.push({
        field,
        legacy: legacy[field],
        next: next[field],
      });
    }
  }

  return {
    equal: diffs.length === 0,
    diffs,
    legacy,
    next,
  };
}

/**
 * Compare legacy vs ListingIdentity SEO identity (ARCH-MP-03B.2).
 */
export function compareListingSeoShadow(
  legacyInput: ListingSeoIdentity,
  nextInput: ListingSeoIdentity,
): SeoShadowComparisonResult {
  const legacy = normalizeSeoIdentity(legacyInput);
  const next = normalizeSeoIdentity(nextInput);

  const fields: SeoShadowFieldName[] = ["h1", "title", "description", "canonical"];
  const diffs: SeoShadowFieldDiff[] = [];

  for (const field of fields) {
    const legacyValue = field === "canonical" ? legacy.canonicalPath : legacy[field];
    const nextValue = field === "canonical" ? next.canonicalPath : next[field];
    if (legacyValue !== nextValue) {
      diffs.push({
        field,
        legacy: legacyValue,
        next: nextValue,
      });
    }
  }

  return {
    equal: diffs.length === 0,
    diffs,
    legacy,
    next,
  };
}

/**
 * Build next-side comparable values from ListingIdentity egress outputs.
 */
export function buildNextShadowComparable(input: {
  displayLabel: string;
  path: string;
  queryString: string;
}): ShadowComparable {
  return {
    h1: input.displayLabel,
    url: input.path,
    query: input.queryString,
  };
}

/**
 * Build legacy-side comparable values from precomputed legacy builder outputs.
 */
export function buildLegacyShadowComparable(input: {
  h1: string;
  path: string;
  queryString: string;
}): ShadowComparable {
  return {
    h1: input.h1,
    url: input.path,
    query: input.queryString,
  };
}
