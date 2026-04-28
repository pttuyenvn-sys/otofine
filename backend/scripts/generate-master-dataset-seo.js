/**
 * Generate SEO page-feed artifacts from Otofine Master Dataset 2026.
 *
 * Usage:
 *   npm run dataset:seo
 */
import path from "path";
import {
  BACKEND_ROOT,
  MASTER_DATASET_PATH,
  parseArgs,
  readJsonFile,
  resolvePath,
  writeJsonFile,
} from "./dataset-common.js";
import { validateKnowledgeDataset } from "../services/knowledgeDatasetValidator.service.js";

function rowToSeoPage(row) {
  const title = `${row.category_name}: dấu hiệu hỏng, cách chọn và lưu ý thay thế`;
  const description = `${row.category_name} thuộc ${row.system_group}. Xem chức năng, dấu hiệu hỏng, kinh nghiệm chọn mua và các lỗi thường gặp khi thay thế.`;
  return {
    slug: row.slug,
    route: `/kien-thuc-phu-tung/${row.slug}`,
    title,
    description,
    h1: row.category_name,
    priority: row.seo_priority,
    system_group: row.system_group,
    keywords: row.keywords,
    internal_links: [
      ...row.cross_sell.map((text) => ({ text, type: "cross_sell" })),
      ...row.upsell.map((text) => ({ text, type: "upsell" })),
    ],
    jsonld: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      inLanguage: "vi-VN",
      about: row.category_name,
      mainEntityOfPage: `/kien-thuc-phu-tung/${row.slug}`,
    },
    faq_jsonld: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: String(row.faq_text || "")
        .split("||")
        .map((q) => q.trim())
        .filter(Boolean)
        .map((question) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: {
            "@type": "Answer",
            text: row.buying_guide_text,
          },
        })),
    },
  };
}

const args = parseArgs();
const input = resolvePath(args.input) || MASTER_DATASET_PATH;
const output =
  resolvePath(args.output) ||
  path.join(BACKEND_ROOT, "data", "knowledge", "otofine-master-dataset-2026-seo-pages.json");
const dataset = readJsonFile(input);
const validation = validateKnowledgeDataset(dataset);

if (!validation.ok) {
  console.error(
    JSON.stringify(
      {
        input,
        output,
        generated_count: 0,
        error_count: validation.errors.length,
        errors: validation.errors.slice(0, 50),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const pages = dataset.rows.filter((row) => row.is_active !== false).map(rowToSeoPage);
writeJsonFile(output, {
  version: dataset.version,
  brand: dataset.brand,
  locale: dataset.locale,
  generated_at: new Date().toISOString(),
  route_strategy: "feed_only_pending_frontend_route",
  pages,
});

console.log(
  JSON.stringify(
    {
      input,
      output,
      generated_count: pages.length,
      route_strategy: "feed_only_pending_frontend_route",
    },
    null,
    2,
  ),
);
