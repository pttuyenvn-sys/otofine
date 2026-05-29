/**
 * Structured governance event logging (JSON lines).
 * Events: worker_run, moderation_action, slow_query, evaluation_failure
 */

/**
 * @param {'info'|'warn'|'error'} level
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
export function logGovernanceEvent(level, event, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    svc: "governance",
    level,
    event,
    ...(Object.keys(meta).length ? { meta } : {}),
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

export function logWorkerRun(meta) {
  logGovernanceEvent("info", "worker_run", meta);
}

export function logModerationAction(meta) {
  logGovernanceEvent("info", "moderation_action", meta);
}

export function logSlowQuery(meta) {
  logGovernanceEvent("warn", "slow_query", meta);
}

export function logEvaluationFailure(meta) {
  logGovernanceEvent("error", "evaluation_failure", meta);
}

export function logLockAcquired(meta) {
  logGovernanceEvent("info", "lock_acquired", meta);
}

export function logLockReleased(meta) {
  logGovernanceEvent("info", "lock_released", meta);
}

export function logLockSkipped(meta) {
  logGovernanceEvent("warn", "lock_skipped", meta);
}

export function logDuplicateActionPrevented(meta) {
  logGovernanceEvent("info", "duplicate_action_prevented", meta);
}

export function logRetrySafe(meta) {
  logGovernanceEvent("info", "retry_safe", meta);
}
