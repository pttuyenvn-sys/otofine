#!/usr/bin/env node
/**
 * SHOP-AUTH-DECOUPLE-01 — surface classifier smoke test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const axiosSrc = readFileSync(path.join(root, "api/axiosClient.js"), "utf8");
assert.ok(
  axiosSrc.includes("isPublicStorefrontSurface"),
  "axiosClient must gate redirect with isPublicStorefrontSurface",
);
assert.ok(
  axiosSrc.includes("clearOwnerCookie"),
  "axiosClient must clear owner cookie on public storefront auth failure",
);
assert.match(
  axiosSrc,
  /!onPublicStorefront[\s\S]*window\.location\.href = "\/shop\/login"/,
  "redirect only when not on public storefront",
);

const stripSrc = readFileSync(
  path.join(root, "components/shopsite/StorefrontOwnerStrip.jsx"),
  "utf8",
);
assert.ok(
  stripSrc.includes("err?.response?.status === 401"),
  "StorefrontOwnerStrip must handle 401 without assuming redirect",
);

console.log("SHOP-AUTH-DECOUPLE-01 static checks: PASS");
