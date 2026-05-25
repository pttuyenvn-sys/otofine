/**
 * Phase 8.1 — RFQ supplier matching: observability shim.
 *
 * Bridges the matching engine into BOTH log streams that ops uses:
 *
 *   1. The structured JSON `rfqLog` stream that the rest of the
 *      RFQ module writes to (parsed by the staging collector).
 *
 *   2. The plain-text `[shopsite] event=` stream that all the
 *      discovery / storefront infra writes to (parsed by the
 *      shopsite ops dashboard).
 *
 * RFQ matching legitimately spans both domains — it's an intelligence
 * layer that reads shop signals to dispatch RFQs — so we emit on both
 * channels. Downstream consumers can pick whichever they prefer
 * without having to grep two formats.
 */

import { rfqLog } from "../utils/rfqLogger.js";

/**
 * Format key=value tokens for the `[shopsite]` stream. Strings get
 * double-quoted only if they contain spaces; arrays are JSON-encoded.
 */
function fmtToken(k, v) {
  if (v == null) return `${k}=`;
  if (Array.isArray(v)) return `${k}=${JSON.stringify(v)}`;
  const s = String(v);
  return /\s/.test(s) ? `${k}="${s}"` : `${k}=${s}`;
}

function shopsiteLine(event, fields = {}) {
  const tokens = [`event=${event}`];
  for (const [k, v] of Object.entries(fields)) tokens.push(fmtToken(k, v));
  // eslint-disable-next-line no-console
  console.info(`[shopsite] ${tokens.join(" ")}`);
}

export const matchLog = {
  started(fields) {
    rfqLog.info("rfq.match.started", fields);
    shopsiteLine("rfq.match.started", fields);
  },
  completed(fields) {
    rfqLog.metric("rfq.match.completed", fields);
    shopsiteLine("rfq.match.completed", fields);
  },
  zeroResults(fields) {
    rfqLog.warn("rfq.match.zero-results", fields);
    shopsiteLine("rfq.match.zero-results", fields);
  },
  topSuppliers(fields) {
    rfqLog.metric("rfq.match.top-suppliers", fields);
    shopsiteLine("rfq.match.top-suppliers", fields);
  },
  failed(fields) {
    rfqLog.error("rfq.match.failed", fields);
    shopsiteLine("rfq.match.failed", fields);
  },
};
