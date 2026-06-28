/**
 * Minimal Node ESM loader to support Next/Webpack-style `@/` imports in unit scripts.
 *
 * Usage:
 *   node --experimental-loader ./alias-loader.mjs ./some-script.mjs
 */

import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const FRONTEND_ROOT = "/var/www/otofine/frontend";

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveAliasToFile(relPath) {
  const base = path.join(FRONTEND_ROOT, relPath);

  const candidates = [
    base,
    `${base}.js`,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.js"),
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];

  for (const p of candidates) {
    if (await fileExists(p)) return p;
  }
  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2); // remove "@/"
    const abs = await resolveAliasToFile(rel);
    if (!abs) {
      throw new Error(`alias-loader: cannot resolve ${specifier}`);
    }
    return {
      url: pathToFileURL(abs).href,
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

