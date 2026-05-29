import fs from "fs";
import path from "path";

const DEFAULT_HEARTBEAT_PATH = path.join(process.cwd(), "var", "governance-worker-heartbeat.json");

function resolveHeartbeatPath() {
  return process.env.GOVERNANCE_WORKER_HEARTBEAT_PATH || DEFAULT_HEARTBEAT_PATH;
}

function resolveStaleMs() {
  const pollMax = Number(process.env.GOVERNANCE_RISK_POLL_MAX_MS || 600_000);
  const buffer = Number(process.env.GOVERNANCE_WORKER_STALE_BUFFER_MS || 120_000);
  return Math.max(300_000, pollMax + buffer);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Worker process writes heartbeat after each tick lifecycle event.
 * @param {Record<string, unknown>} patch
 */
export function writeWorkerHeartbeat(patch = {}) {
  const filePath = resolveHeartbeatPath();
  ensureDir(filePath);

  let existing = {};
  try {
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch {
    existing = {};
  }

  const payload = {
    process: "governance-risk-worker",
    pid: process.pid,
    updatedAt: new Date().toISOString(),
    ...existing,
    ...patch,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 0)}\n`, "utf8");
  return payload;
}

/**
 * API process reads cross-process worker heartbeat.
 */
export function readWorkerHeartbeat() {
  const filePath = resolveHeartbeatPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Derive worker online/offline from heartbeat freshness.
 */
export function getWorkerStatusFromHeartbeat() {
  const heartbeat = readWorkerHeartbeat();
  const staleMs = resolveStaleMs();
  const now = Date.now();

  if (!heartbeat?.updatedAt) {
    return {
      online: false,
      status: "offline",
      staleMs,
      heartbeat: null,
      ageMs: null,
    };
  }

  const ageMs = now - new Date(heartbeat.updatedAt).getTime();
  const online = ageMs <= staleMs;

  return {
    online,
    status: online ? String(heartbeat.status || "online") : "offline",
    staleMs,
    heartbeat,
    ageMs,
  };
}
