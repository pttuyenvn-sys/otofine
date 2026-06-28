/**
 * Home SEO content render gate — CMS article vs dynamic fallback.
 * Pure helper for Home.jsx + unit tests (ARCH-MP-03B.9H).
 */

/**
 * @param {unknown} finalArticle
 * @returns {{ render: boolean, mode: "cms" | "dynamic" | null }}
 */
export function resolveHomeSeoRender(finalArticle) {
  if (!finalArticle) {
    return { render: false, mode: null };
  }
  if (
    typeof finalArticle === "object" &&
    finalArticle.source === "dynamic" &&
    finalArticle.content
  ) {
    return { render: true, mode: "dynamic" };
  }
  return { render: true, mode: "cms" };
}
