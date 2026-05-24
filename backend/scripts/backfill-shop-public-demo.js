#!/usr/bin/env node
/**
 * One-off helper: assign a slug + public_status to an existing shop so
 * the public storefront can be smoke-tested. Idempotent.
 *
 * Usage:
 *   node scripts/backfill-shop-public-demo.js --id 2 --slug cuahangoto355
 *
 * Defaults to shop id=2 ("Phụ tùng ô tô 355") with slug "cuahangoto355"
 * because that row matches the mockup the UI was prototyped against.
 */
import { pool } from "../config/db.js";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const shopId = Number(arg("id", 2));
const slug = String(arg("slug", "cuahangoto355")).toLowerCase();

const DEMO_BIO = "Chuyên phụ tùng - đồ chơi - chăm sóc ô tô chính hãng";
const DEMO_INTRO = `
<p>Cửa hàng ô tô 355 là đại lý phụ tùng ô tô uy tín tại Hà Nội với hơn 5 năm kinh nghiệm trong ngành. Chúng tôi cung cấp đầy đủ các loại phụ tùng, đồ chơi và phụ kiện cho hầu hết các dòng xe phổ thông tại Việt Nam.</p>
<h3>Cam kết của chúng tôi</h3>
<ul>
  <li>100% sản phẩm chính hãng, có nguồn gốc rõ ràng</li>
  <li>Giá cả cạnh tranh, minh bạch</li>
  <li>Tư vấn nhiệt tình bởi đội ngũ kỹ thuật giàu kinh nghiệm</li>
  <li>Giao hàng toàn quốc, đổi trả trong 7 ngày</li>
</ul>
<h3>Sản phẩm chủ lực</h3>
<p>Nhớt động cơ, phụ tùng động cơ, hệ thống phanh, đèn chiếu sáng, phụ kiện nội thất và đồ chơi xe hơi cho các dòng xe Toyota, Honda, Mazda, Ford, Hyundai, Kia.</p>
`.trim();
const DEMO_WORKING_HOURS =
  "08:00 - 18:00 (Thứ 2 - Thứ 7) | Chủ nhật: 08:00 - 12:00";
const DEMO_COVER =
  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80";
const DEMO_FACEBOOK = "https://facebook.com/cuahangoto355";
const DEMO_ZALO_PHONE = "0965 123 456";

async function main() {
  const [existing] = await pool.query("SELECT id, name FROM shops WHERE id = ?", [shopId]);
  if (existing.length === 0) {
    throw new Error(`Shop id=${shopId} not found`);
  }
  console.log(`Backfilling shop id=${shopId} (${existing[0].name}) → slug='${slug}'`);

  await pool.query(
    `
      UPDATE shops SET
        slug          = COALESCE(?, slug),
        public_status = 'public',
        published_at  = COALESCE(published_at, NOW()),
        verified_at   = COALESCE(verified_at, NOW()),
        bio           = COALESCE(NULLIF(bio, ''), ?),
        intro_html    = COALESCE(NULLIF(intro_html, ''), ?),
        working_hours = COALESCE(NULLIF(working_hours, ''), ?),
        cover_image   = COALESCE(NULLIF(cover_image, ''), ?),
        facebook_url  = COALESCE(NULLIF(facebook_url, ''), ?),
        zalo_phone    = COALESCE(NULLIF(zalo_phone, ''), ?)
      WHERE id = ?
    `,
    [
      slug,
      DEMO_BIO,
      DEMO_INTRO,
      DEMO_WORKING_HOURS,
      DEMO_COVER,
      DEMO_FACEBOOK,
      DEMO_ZALO_PHONE,
      shopId,
    ],
  );

  const [verify] = await pool.query(
    "SELECT id, name, slug, public_status, published_at, verified_at FROM shops WHERE id = ?",
    [shopId],
  );
  console.log("Done:", verify[0]);
  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-shop-public-demo] FAILED:", err.message);
  process.exit(1);
});
