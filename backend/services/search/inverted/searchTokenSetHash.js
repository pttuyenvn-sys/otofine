/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — token set hash for skip-rebuild.
 */

import crypto from "crypto";

/**
 * @param {Array<{ token: string, token_type: string, weight?: number }>} rows
 */
export function computeInvertedTokenSetHash(rows) {
  const parts = [...rows]
    .sort(
      (a, b) =>
        a.token_type.localeCompare(b.token_type)
        || a.token.localeCompare(b.token)
        || String(a.weight ?? 0).localeCompare(String(b.weight ?? 0)),
    )
    .map((r) => `${r.token_type}\x1f${r.token}\x1f${r.weight ?? 0}`);
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}
