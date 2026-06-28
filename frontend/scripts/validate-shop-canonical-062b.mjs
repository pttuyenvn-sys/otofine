#!/usr/bin/env node
/**
 * ARCH-06.2B — shop canonical + robots validation.
 *
 * Usage:
 *   node scripts/validate-shop-canonical-062b.mjs [slug] [baseHost]
 *
 * Defaults: phutungoto355, https://otofine.com
 */

const slug = process.argv[2] || "phutungoto355";
const apexBase = (process.argv[3] || "https://otofine.com").replace(/\/$/, "");
const subdomainBase = `https://${slug}.otofine.com`;

const ROUTES = [
  { label: "/", subPath: "", apexPath: `/shops/${slug}`, subdomainPath: "/" },
  { label: "/san-pham", subPath: "san-pham", apexPath: `/shops/${slug}/san-pham`, subdomainPath: "/san-pham" },
  { label: "/gioi-thieu", subPath: "gioi-thieu", apexPath: `/shops/${slug}/gioi-thieu`, subdomainPath: "/gioi-thieu" },
  { label: "/lien-he", subPath: "lien-he", apexPath: `/shops/${slug}/lien-he`, subdomainPath: "/lien-he" },
];

function expectedSubdomainCanonical(subPath) {
  return subPath ? `${subdomainBase}/${subPath}` : `${subdomainBase}/`;
}

function parseMeta(html) {
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ||
    null;

  const robotsContent =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i)?.[1] ||
    null;

  const jsonLdUrls = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      const graph = data["@graph"] || [data];
      for (const node of graph) {
        if (node.url) jsonLdUrls.push(node.url);
      }
    } catch {
      /* skip malformed */
    }
  }

  return { canonical, robots: robotsContent, jsonLdUrls: [...new Set(jsonLdUrls)] };
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "otofine-arch-062b-validator/1.0" },
    redirect: "manual",
  });
  const html = await res.text();
  return { status: res.status, ...parseMeta(html) };
}

function fmt(ok) {
  return ok ? "PASS" : "FAIL";
}

console.log(`\nARCH-06.2B validation — slug=${slug}\n`);

const rows = [];

for (const route of ROUTES) {
  const apexUrl = `${apexBase}${route.apexPath}`;
  const subUrl = `${subdomainBase}${route.subdomainPath}`;
  const expectedCanon = expectedSubdomainCanonical(route.subPath);

  const [apex, sub] = await Promise.all([fetchPage(apexUrl), fetchPage(subUrl)]);

  const subCanonOk = sub.canonical === expectedCanon || sub.canonical === expectedCanon.replace(/\/$/, "");
  const apexCanonOk =
    apex.canonical === expectedCanon || apex.canonical === expectedCanon.replace(/\/$/, "");
  const apexRobotsOk = /^noindex,\s*follow$/i.test(apex.robots || "");
  const subRobotsOk = /^noindex,\s*nofollow$/i.test(sub.robots || "");
  const apexStatusOk = apex.status === 200;
  const subStatusOk = sub.status === 200;
  const jsonLdOk =
    sub.jsonLdUrls.length === 0 ||
    sub.jsonLdUrls.every((u) => u.startsWith(subdomainBase));

  rows.push({
    url: subUrl,
    host: "subdomain",
    route: route.label,
    status: sub.status,
    canonical: sub.canonical,
    robots: sub.robots,
    ok: subStatusOk && subCanonOk && subRobotsOk,
  });

  rows.push({
    url: apexUrl,
    host: "apex",
    route: route.label,
    status: apex.status,
    canonical: apex.canonical,
    robots: apex.robots,
    ok: apexStatusOk && apexCanonOk && apexRobotsOk,
    jsonLdNote: route.label === "/" ? (jsonLdOk ? "json-ld ok" : `json-ld: ${sub.jsonLdUrls.join(", ")}`) : "",
  });
}

console.log("| URL | Canonical | Robots | Status |");
console.log("| --- | --------- | ------ | ------ |");
for (const r of rows) {
  console.log(`| ${r.url} | ${r.canonical || "—"} | ${r.robots || "—"} | ${fmt(r.ok)} (${r.status}) |`);
}

const failed = rows.filter((r) => !r.ok);
console.log(failed.length === 0 ? "\nAll checks PASS\n" : `\n${failed.length} check(s) FAILED\n`);

process.exit(failed.length === 0 ? 0 : 1);
