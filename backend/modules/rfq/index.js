import { rfqFlags } from "../../config/rfq.config.js";
import publicRouter from "./routes/rfq.public.routes.js";
import shopRouter from "./routes/rfq.shop.routes.js";

/**
 * Mount RFQ HTTP routes. No-op when RFQ_MODULE_ENABLED is false (default).
 */
export function mountRfqRoutes(app) {
  if (!rfqFlags.RFQ_MODULE_ENABLED) {
    console.info("[RFQ] RFQ_MODULE_ENABLED=false — routes not mounted.");
    return;
  }
  app.use("/api/rfq", publicRouter);
  app.use("/api/shop/rfq", shopRouter);
}

export { rfqFlags } from "../../config/rfq.config.js";
