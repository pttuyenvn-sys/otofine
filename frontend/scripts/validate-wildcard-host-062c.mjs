#!/usr/bin/env node
/**
 * ARCH-06.2C — wildcard storefront host validation.
 *
 * Usage:
 *   node scripts/validate-wildcard-host-062c.mjs [validSlug]
 */

const validSlug = process.argv[2] || "phutungoto355";
const apexBase = "https://otofine.com";

const TEST_HOSTS = [
  "abcxyz.otofine.com",
  "random.otofine.com",
  "foo.otofine.com",
  `${validSlug}.otofine.com`,
];

function parseMeta(html, headers) {
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ||
    null;

  const robotsContent =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i)?.[1] ||
    headers.get("x-robots-tag") ||
    null;

  return { canonical, robots: robotsContent };
}

async function probeHost(host) {
  const url = `https://${host}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": "otofine-arch-062c-validator/1.0" },
    redirect: "manual",
  });
  const html = await res.text();
  const meta = parseMeta(html, res.headers);
  return { status: res.status, ...meta };
}

async function probeApex() {
  const res = await fetch(`${apexBase}/`, {
    headers: { "User-Agent": "otofine-arch-062c-validator/1.0" },
    redirect: "manual",
  });
  return { status: res.status };
}

console.log(`\nARCH-06.2C validation — valid slug=${validSlug}\n`);

const rows = [];
for (const host of TEST_HOSTS) {
  const r = await probeHost(host);
  const isValidHost = host.startsWith(`${validSlug}.`);
  const ok = isValidHost ? r.status === 200 : r.status === 404;
  rows.push({ host, ...r, ok });
}

const apex = await probeApex();
const apexOk = apex.status === 200;

console.log("| Host | Status | Canonical | Robots |");
console.log("| ---- | ------ | --------- | ------ |");
for (const r of rows) {
  console.log(
    `| ${r.host} | ${r.status} ${r.ok ? "PASS" : "FAIL"} | ${r.canonical || "—"} | ${r.robots || "—"} |`,
  );
}
console.log(`| otofine.com/ | ${apex.status} ${apexOk ? "PASS" : "FAIL"} | — | — |`);

const failed = rows.filter((r) => !r.ok).length + (apexOk ? 0 : 1);
console.log(failed === 0 ? "\nAll checks PASS\n" : `\n${failed} check(s) FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
