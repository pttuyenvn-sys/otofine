/**
 * Phase 8.1 — RFQ supplier matching: barrel.
 *
 * Stable public surface for the matching engine. Other modules
 * (admin ops, future dispatch wiring, ML training exports) should
 * import from here, never from the internal files directly.
 */

export {
  matchRfqToShops,
  matchRfqToShopsByInput,
} from "./rfqMatchEngine.service.js";

export {
  scoreShopForRfq,
  classifyTier,
  MAX_SCORE,
  SCORE_MAX,
  TIERS,
} from "./rfqMatchScorer.js";

export {
  loadMatchInputFromRfqId,
  buildMatchInputFromPayload,
  extractKeywords,
} from "./rfqMatchInputs.normalizer.js";

export { matchLog } from "./rfqMatchLogger.js";
