#!/usr/bin/env node
/**
 * Fetch brand logos from Simple Icons, Wikimedia Commons, and car-makes-icons;
 * normalize to monochrome watermark SVGs (#334155) in public/brands/.
 *
 * Usage: node scripts/generate-brand-watermarks.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../public/brands");
const WATERMARK_COLOR = "#334155";
const USER_AGENT = "OtofineBrandWatermarkGenerator/1.0 (+https://otofine.vn)";

const SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@11.0.0/icons";
const CAR_MAKES = "https://raw.githubusercontent.com/stephenwadeauto/car-makes-icons/master/svgs";
const WIKIMEDIA = "https://upload.wikimedia.org/wikipedia/commons";

/** @type {Array<{ name: string, file: string, source: string, slug?: string, url?: string, embedded?: string }>} */
const BRANDS = [
  { name: "Toyota", file: "toyota.svg", source: "simple-icons", slug: "toyota" },
  { name: "Kia", file: "kia.svg", source: "simple-icons", slug: "kia" },
  { name: "Mazda", file: "mazda.svg", source: "simple-icons", slug: "mazda" },
  { name: "Hyundai", file: "hyundai.svg", source: "simple-icons", slug: "hyundai" },
  {
    name: "Mercedes-Benz",
    file: "mercedes-benz.svg",
    source: "embedded",
    embedded: `<circle cx="12" cy="12" r="9.5" stroke="${WATERMARK_COLOR}" stroke-width="1.2" fill="none"/>
  <path d="M12 3.2v17.6M3.8 14.2l16.4-9.5M3.8 9.8l16.4 9.5" stroke="${WATERMARK_COLOR}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
  },
  { name: "Lexus", file: "lexus.svg", source: "car-makes", slug: "lexus" },
  { name: "Honda", file: "honda.svg", source: "simple-icons", slug: "honda" },
  { name: "BMW", file: "bmw.svg", source: "simple-icons", slug: "bmw" },
  { name: "Peugeot", file: "peugeot.svg", source: "simple-icons", slug: "peugeot" },
  { name: "Mitsubishi", file: "mitsubishi.svg", source: "simple-icons", slug: "mitsubishi" },
  { name: "Ford", file: "ford.svg", source: "simple-icons", slug: "ford" },
  { name: "Chevrolet", file: "chevrolet.svg", source: "simple-icons", slug: "chevrolet" },
  { name: "Audi", file: "audi.svg", source: "simple-icons", slug: "audi" },
  {
    name: "Land Rover",
    file: "land-rover.svg",
    source: "embedded",
    embedded: `<ellipse cx="12" cy="12" rx="10" ry="6.5" stroke="${WATERMARK_COLOR}" stroke-width="1.1" fill="none"/>
  <ellipse cx="12" cy="12" rx="7" ry="4.2" stroke="${WATERMARK_COLOR}" stroke-width="0.85" fill="none" opacity="0.55"/>`,
  },
  { name: "Nissan", file: "nissan.svg", source: "simple-icons", slug: "nissan" },
  { name: "Suzuki", file: "suzuki.svg", source: "simple-icons", slug: "suzuki" },
  { name: "Daewoo", file: "daewoo.svg", source: "car-makes", slug: "daewoo" },
  { name: "Volkswagen", file: "volkswagen.svg", source: "simple-icons", slug: "volkswagen" },
  {
    name: "VinFast",
    file: "vinfast.svg",
    source: "embedded",
    embedded: `<path d="M7 18 12 6l5 12h-2.2l-1.8-5.2L9.2 18H7z" fill="${WATERMARK_COLOR}"/>`,
  },
  { name: "Volvo", file: "volvo.svg", source: "simple-icons", slug: "volvo" },
  { name: "Jaguar", file: "jaguar.svg", source: "simple-icons", slug: "jaguar" },
  { name: "Porsche", file: "porsche.svg", source: "simple-icons", slug: "porsche" },
  { name: "Bentley", file: "bentley.svg", source: "simple-icons", slug: "bentley" },
  { name: "Mini", file: "mini.svg", source: "simple-icons", slug: "mini" },
  {
    name: "Beijing",
    file: "beijing.svg",
    source: "embedded",
    embedded: `<circle cx="12" cy="12" r="9" stroke="${WATERMARK_COLOR}" stroke-width="1.1" fill="none"/>
  <path d="M12 4.5v15M4.5 12h15" stroke="${WATERMARK_COLOR}" stroke-width="0.95" stroke-linecap="round" fill="none"/>
  <circle cx="12" cy="12" r="2.2" stroke="${WATERMARK_COLOR}" stroke-width="0.95" fill="none"/>`,
  },
  { name: "Isuzu", file: "isuzu.svg", source: "car-makes", slug: "isuzu" },
];

const GENERIC_CAR = {
  name: "Generic",
  file: "generic-car.svg",
  embedded: `<path d="M3.4 14.2h17.2l-2.1-3.3H12l-1.4 1.6H7.4L6 10.8H3.4v3.4z" fill="${WATERMARK_COLOR}" opacity="0.9"/>
  <circle cx="7.4" cy="15.4" r="1.9" stroke="${WATERMARK_COLOR}" stroke-width="0.95" fill="none"/>
  <circle cx="16.6" cy="15.4" r="1.9" stroke="${WATERMARK_COLOR}" stroke-width="0.95" fill="none"/>
  <path d="M8.6 11.8h2.1l1-1.4h2.8l0.7 1.4h2.3" stroke="${WATERMARK_COLOR}" stroke-width="0.8" stroke-linecap="round" fill="none"/>`,
};

const SOURCE_LABELS = {
  "simple-icons": "Simple Icons",
  "car-makes": "car-makes-icons",
  embedded: "Custom symbol",
  wikimedia: "Wikimedia Commons",
};

async function fetchText(url, retries = 3) {
  let lastError;
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/svg+xml,text/plain,*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.includes("<title>Wikimedia Error</title>")) {
        throw new Error("HTML error page");
      }
      return text;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchBrandRaw(brand) {
  if (brand.source === "embedded") {
    return { raw: null, sourceLabel: SOURCE_LABELS.embedded };
  }
  if (brand.source === "simple-icons") {
    const url = `${SIMPLE_ICONS}/${brand.slug}.svg`;
    return { raw: await fetchText(url), sourceLabel: SOURCE_LABELS["simple-icons"], url };
  }
  if (brand.source === "car-makes") {
    const url = `${CAR_MAKES}/${brand.slug}.svg`;
    return { raw: await fetchText(url), sourceLabel: SOURCE_LABELS["car-makes"], url };
  }
  if (brand.source === "wikimedia") {
    return { raw: await fetchText(brand.url), sourceLabel: SOURCE_LABELS.wikimedia, url: brand.url };
  }
  throw new Error(`Unknown source: ${brand.source}`);
}

function extractViewBox(svg) {
  const match = svg.match(/viewBox=["']([^"']+)["']/i);
  return match ? match[1] : "0 0 24 24";
}

function stripSvgEnvelope(svg) {
  const match = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1] : svg;
}

function normalizeColors(fragment) {
  let out = fragment;

  out = out.replace(/<text[\s\S]*?<\/text>/gi, "");
  out = out.replace(/<image[\s\S]*?\/>/gi, "");
  out = out.replace(/<image[\s\S]*?<\/image>/gi, "");

  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<linearGradient[\s\S]*?<\/linearGradient>/gi, "");
  out = out.replace(/<radialGradient[\s\S]*?<\/radialGradient>/gi, "");
  out = out.replace(/<filter[\s\S]*?<\/filter>/gi, "");
  out = out.replace(/<clipPath[\s\S]*?<\/clipPath>/gi, "");

  out = out.replace(/fill:\s*#fff(?:fff)?(?![0-9a-f])/gi, "fill:none");
  out = out.replace(/fill=["']#fff(?:fff)?["']/gi, 'fill="none"');
  out = out.replace(/fill=["']white["']/gi, 'fill="none"');

  out = out.replace(/fill=["'](?!none|transparent)[^"']*["']/gi, `fill="${WATERMARK_COLOR}"`);
  out = out.replace(/stroke=["'](?!none|transparent)[^"']*["']/gi, `stroke="${WATERMARK_COLOR}"`);

  out = out.replace(/style=["']([^"']*)["']/gi, (_m, style) => {
    let s = style
      .replace(/fill:\s*(?!none|transparent)[^;"']+/gi, `fill:${WATERMARK_COLOR}`)
      .replace(/stroke:\s*(?!none|transparent)[^;"']+/gi, `stroke:${WATERMARK_COLOR}`)
      .replace(/fill:\s*#fff(?:fff)?(?![0-9a-f])/gi, "fill:none")
      .replace(/fill:\s*white/gi, "fill:none");
    return `style="${s}"`;
  });

  out = out.replace(/url\s*\(\s*#[^)]+\)/gi, WATERMARK_COLOR);

  out = out.replace(
    /<(path|circle|rect|ellipse|polygon|polyline)(\s[^>]*?)(\/?)>/gi,
    (full, tag, attrs, slash) => {
      if (/fill\s*=/.test(attrs) || /stroke\s*=/.test(attrs)) return full;
      return `<${tag}${attrs} fill="${WATERMARK_COLOR}"${slash}>`;
    },
  );

  return out.trim();
}

function cleanMetadata(svg) {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
    .replace(/<title[\s\S]*?<\/title>/gi, "")
    .replace(/<desc[\s\S]*?<\/desc>/gi, "")
    .replace(/<sodipodi:[\s\S]*?\/>/gi, "")
    .replace(/<sodipodi:[\s\S]*?<\/sodipodi:[^>]+>/gi, "")
    .replace(/<inkscape:[\s\S]*?\/>/gi, "")
    .replace(/<inkscape:[\s\S]*?<\/inkscape:[^>]+>/gi, "")
    .replace(/\sxmlns:[a-z]+="[^"]*"/gi, "");
}

function buildWatermarkSvg({ inner, viewBox = "0 0 24 24" }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none">\n${inner}\n</svg>\n`;
}

function normalizeFetchedSvg(raw) {
  const cleaned = cleanMetadata(raw);
  const viewBox = extractViewBox(cleaned);
  const inner = normalizeColors(stripSvgEnvelope(cleaned));
  return buildWatermarkSvg({ inner, viewBox });
}

function normalizeEmbedded(inner, viewBox = "0 0 24 24") {
  return buildWatermarkSvg({ inner, viewBox });
}

function validateSvg(content, file) {
  const issues = [];
  if (!content.includes("<svg")) issues.push("missing svg root");
  if (!content.includes("</svg>")) issues.push("unclosed svg");
  if (/<image[^>]+(?:href|xlink:href)=["'][^"']+\.(png|jpe?g|gif|webp)/i.test(content)) {
    issues.push("contains raster image");
  }
  if (content.length < 80) issues.push("file too small");
  const openTags = (content.match(/<(path|circle|rect|ellipse|polygon|polyline|g)\b/gi) || []).length;
  if (openTags === 0 && !file.includes("generic")) issues.push("no drawable elements");
  if (/\/\s+fill=/.test(content)) issues.push("malformed tag");
  return issues;
}

function printTable(rows) {
  const headers = ["Brand", "File", "Status"];
  const toCells = (row) => [row.name, row.file, row.status];
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(toCells(r)[i]).length)),
  );

  const line = (cells) => cells.map((c, i) => String(c).padEnd(colWidths[i])).join(" | ");
  console.log("\n" + line(headers));
  console.log(colWidths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) console.log(line(toCells(row)));
}

async function processBrand(brand) {
  try {
    let svg;
    let status;

    if (brand.source === "embedded") {
      svg = normalizeEmbedded(brand.embedded);
      status = `OK (${SOURCE_LABELS.embedded})`;
    } else {
      const { raw, sourceLabel } = await fetchBrandRaw(brand);
      svg = normalizeFetchedSvg(raw);
      status = `OK (${sourceLabel})`;
    }

    const issues = validateSvg(svg, brand.file);
    if (issues.length) {
      status = `WARN: ${issues.join(", ")}`;
    }

    await writeFile(join(OUT_DIR, brand.file), svg, "utf8");
    return { name: brand.name, file: brand.file, status };
  } catch (err) {
    return { name: brand.name, file: brand.file, status: `FAIL: ${err.message}` };
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const rows = [];
  for (const brand of BRANDS) {
    rows.push(await processBrand(brand));
  }

  const genericSvg = normalizeEmbedded(GENERIC_CAR.embedded);
  const genericIssues = validateSvg(genericSvg, GENERIC_CAR.file);
  await writeFile(join(OUT_DIR, GENERIC_CAR.file), genericSvg, "utf8");
  rows.push({
    name: GENERIC_CAR.name,
    file: GENERIC_CAR.file,
    status: genericIssues.length
      ? `WARN: ${genericIssues.join(", ")}`
      : `OK (${SOURCE_LABELS.embedded})`,
  });

  printTable(rows);

  const failed = rows.filter((r) => r.status.startsWith("FAIL"));
  if (failed.length) {
    process.exitCode = 1;
  }
}

main();
