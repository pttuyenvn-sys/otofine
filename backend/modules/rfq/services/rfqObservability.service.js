/**
 * In-process counters (single-instance MVP). Dual-write with rfqLog.metric for search pipelines.
 */

const counters = {};

export function rfqCounterInc(name, n = 1) {
  counters[name] = (counters[name] || 0) + n;
}

export function getRfqCountersSnapshot() {
  return { ...counters, at: new Date().toISOString() };
}
