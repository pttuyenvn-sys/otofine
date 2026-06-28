/**
 * Vietnamese slugify — shared with frontend/lib/identity/buildProductIdentity.js
 */

const SLUG_MAX_LEN = 140;

export function slugifyVi(text) {
  if (text == null) return "";
  let s = String(text);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX_LEN) {
    s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
  }
  return s;
}
