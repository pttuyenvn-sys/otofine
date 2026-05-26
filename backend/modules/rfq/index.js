import { rfqFlags } from "../../config/rfq.config.js";
import { logRfqR2StartupConfig } from "./utils/rfqR2Observability.js";
import publicRouter from "./routes/rfq.public.routes.js";
import historyRouter from "./routes/rfq.history.routes.js";
import shopRouter from "./routes/rfq.shop.routes.js";
import conversationRouter from "./routes/rfq.conversation.routes.js";
import assistRouter from "./routes/rfq.assist.routes.js";

/**
 * Mount RFQ HTTP routes. No-op when RFQ_MODULE_ENABLED is false (default).
 */
export function mountRfqRoutes(app) {
  if (!rfqFlags.RFQ_MODULE_ENABLED) {
    console.info("[RFQ] RFQ_MODULE_ENABLED=false — routes not mounted.");
    return;
  }
  logRfqR2StartupConfig();
  app.use("/api/rfq", publicRouter);
  app.use("/api/rfq/history", historyRouter);
  app.use("/api/rfq/conversations", conversationRouter);
  // Phase 8.2 — RFQ Assist (soft rollout). Endpoints are mounted but
  // gated by RFQ_ASSIST_ENABLED inside rfqAssist.service. Mount even
  // when the flag is off so ops can hot-flip without a restart.
  app.use("/api/rfq/assist", assistRouter);
  app.use("/api/shop/rfq", shopRouter);
}

export { rfqFlags } from "../../config/rfq.config.js";
