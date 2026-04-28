/**
 * Structured logging for sync jobs (JSON-friendly lines in production).
 * @param {string} scope
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
export function syncLog(scope, level, message, meta = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    scope,
    level,
    message,
    ...(meta != null ? { meta } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logInfo(scope, message, meta) {
  syncLog(scope, "info", message, meta);
}

export function logWarn(scope, message, meta) {
  syncLog(scope, "warn", message, meta);
}

export function logError(scope, message, meta) {
  syncLog(scope, "error", message, meta);
}
