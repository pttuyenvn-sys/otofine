/**
 * Backward-compatible wrapper — canonical logic lives in riskEvaluation.service.js.
 * SAFE MODE: flag evaluation/storage only; no automatic enforcement actions.
 */
export {
  FLAG_CODES as FLAGS,
  evaluateAndStoreProductRisk as evaluateAndStoreFlags,
  evaluateAndStoreProductRisk as evaluateProductRisk,
  evaluateProductRiskRules,
  storeProductRiskFlags,
} from "./riskEvaluation.service.js";
