import { publicShopConfig } from "../config/publicShop.config.js";

/**
 * Hard gate. When PUBLIC_SHOPSITE_ENABLED is falsy every request to
 * the public-shopsite namespace returns 404 — externally indistinguish-
 * able from "this URL doesn't exist".
 *
 * The flag is also re-checked in server.js BEFORE mounting the router
 * (so when it's off, nothing ever runs through). This middleware is
 * the second line of defense for hot-reload scenarios where the flag
 * was flipped at runtime.
 */
export function publicShopsiteEnabledOrNotFound(req, res, next) {
  if (!publicShopConfig.enabled) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}
