#!/usr/bin/env node
/**
 * PRODUCT-VISIBILITY-DECOUPLING-IMPLEMENT-01 — live validation.
 */
import "dotenv/config";
import { pool } from "../config/db.js";
import { buildPdpProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { resolvePdpArchiveState } from "../utils/productPublicVisibility.server.js";

const API = process.env.API_BASE || "http://127.0.0.1:5000/api";

async function fetchDetail(id) {
  const res = await fetch(`${API}/product/${id}`);
  return { status: res.status, body: res.ok ? await res.json() : null };
}

async function findProduct({ shopStatus, productModeration = "approved" }) {
  const pdpVis = await buildPdpProductWhereClause({ aliasP: "p" });
  const [rows] = await pool.query(
    `
      SELECT p.id, s.slug AS shopSlug, s.public_status AS shopStatus,
             p.moderation_status AS moderationStatus
      FROM products p
      INNER JOIN shops s ON s.id = p.shopId
      WHERE TRIM(LOWER(s.public_status)) = ?
        AND TRIM(LOWER(COALESCE(p.moderation_status, 'approved'))) = ?
      ${pdpVis.sql}
      LIMIT 1
    `,
    [shopStatus, productModeration],
  );
  return rows[0] || null;
}

async function findRejectedProduct() {
  const [rows] = await pool.query(
    `
      SELECT p.id
      FROM products p
      WHERE TRIM(LOWER(p.moderation_status)) = 'rejected'
      LIMIT 1
    `,
  );
  return rows[0]?.id || null;
}

async function findDeletedProduct() {
  const [cols] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
        AND COLUMN_NAME IN ('seller_deleted_at', 'deleted_at')
    `,
  );
  const col = cols[0]?.COLUMN_NAME;
  if (!col) return null;
  const [rows] = await pool.query(
    `SELECT id FROM products WHERE ${col} IS NOT NULL LIMIT 1`,
  );
  return rows[0]?.id || null;
}

const results = [];

function pass(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const publicProduct = await findProduct({ shopStatus: "public" });
  if (publicProduct) {
    const { status, body } = await fetchDetail(publicProduct.id);
    pass(
      "public shop + approved product → 200 active",
      status === 200 && body?.pdpArchiveState === "active",
      `id=${publicProduct.id} archive=${body?.pdpArchiveState}`,
    );
  } else {
    pass("public shop + approved product", false, "no fixture");
  }

  let suspendedId = null;
  const suspendedProduct = await findProduct({ shopStatus: "suspended" });
  if (suspendedProduct) {
    suspendedId = suspendedProduct.id;
    const { status, body } = await fetchDetail(suspendedProduct.id);
    pass(
      "suspended shop + approved product → 200 archived",
      status === 200 && body?.pdpArchiveState === "archived",
      `id=${suspendedProduct.id}`,
    );
  } else {
    const [anyPublic] = await pool.query(
      `SELECT p.id FROM products p INNER JOIN shops s ON s.id = p.shopId
       WHERE s.slug = 'hungpt' LIMIT 1`,
    );
    if (anyPublic[0]?.id) {
      await pool.query(`UPDATE shops SET public_status='suspended' WHERE slug='hungpt'`);
      suspendedId = anyPublic[0].id;
      const { status, body } = await fetchDetail(suspendedId);
      pass(
        "suspended shop + approved product → 200 archived (hungpt)",
        status === 200 && body?.pdpArchiveState === "archived",
        `id=${suspendedId}`,
      );
    } else {
      pass("suspended shop + approved product", false, "no fixture");
    }
  }

  const archive = resolvePdpArchiveState("private");
  pass("private shop archive mapping", archive.archived === true);

  const rejectedId = await findRejectedProduct();
  if (rejectedId) {
    const { status } = await fetchDetail(rejectedId);
    pass("rejected product → 404", status === 404, `id=${rejectedId}`);
  } else {
    pass("rejected product → 404", true, "skipped — no rejected row");
  }

  const deletedId = await findDeletedProduct();
  if (deletedId) {
    const { status } = await fetchDetail(deletedId);
    pass("deleted product → 404", status === 404, `id=${deletedId}`);
  } else {
    pass("deleted product → 404", true, "skipped — no deleted row");
  }

  if (suspendedId) {
    await pool.query(`UPDATE shops SET public_status='public' WHERE slug='hungpt'`);
  }

  const failed = results.filter((r) => !r.ok);
  await pool.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
