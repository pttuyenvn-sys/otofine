/**
 * Structured RFQ logs — parse-friendly JSON lines for staging/production collectors.
 */

function line(level, event, fields = {}) {
  return JSON.stringify({
    ts: new Date().toISOString(),
    svc: "rfq",
    level,
    event,
    ...fields,
  });
}

export const rfqLog = {
  info(event, fields) {
    console.info(line("info", event, fields));
  },
  warn(event, fields) {
    console.warn(line("warn", event, fields));
  },
  error(event, fields) {
    console.error(line("error", event, fields));
  },
  metric(event, fields) {
    console.info(line("metric", event, fields));
  },
};
