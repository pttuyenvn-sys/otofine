import { rfqFlags } from "../../config/rfq.config.js";
import publicRouter from "./routes/rfq.public.routes.js";
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
  app.use("/api/rfq", publicRouter);
  app.use("/api/rfq/conversations", conversationRouter);
  // Phase 8.2 — RFQ Assist (soft rollout). Endpoints mount unconditionally
  // but the rollout evaluator (rfqAssistRollout) inside the service gates
  // every request by RFQ_ASSIST_ENABLED, so ops can hot-flip without restart.
  app.use("/api/rfq/assist", assistRouter);
  app.use("/api/shop/rfq", shopRouter);
}

export { rfqFlags } from "../../config/rfq.config.js";
