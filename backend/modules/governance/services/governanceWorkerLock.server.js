import fs from "fs";
import os from "os";
import path from "path";
import {
  logLockAcquired,
  logLockReleased,
  logLockSkipped,
} from "./governanceLogger.server.js";

const DEFAULT_LOCK_PATH = path.join(process.cwd(), "var", "governance-worker.lock");

function resolveLockPath() {
  return process.env.GOVERNANCE_WORKER_LOCK_PATH || DEFAULT_LOCK_PATH;
}

function resolveStaleMs() {
  return Math.max(60_000, Number(process.env.GOVERNANCE_WORKER_LOCK_STALE_MS || 900_000));
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readLock(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Attempt to acquire an exclusive worker lock (file-based, single-host).
 * Stale locks are reclaimed automatically.
 */
export function tryAcquireWorkerLock() {
  const filePath = resolveLockPath();
  ensureDir(filePath);
  const staleMs = resolveStaleMs();
  const now = Date.now();
  const existing = readLock(filePath);

  if (existing?.acquiredAt) {
    const ageMs = now - new Date(existing.acquiredAt).getTime();
    if (ageMs < staleMs && existing.pid !== process.pid) {
      logLockSkipped({ holderPid: existing.pid, ageMs, staleMs });
      return { acquired: false, reason: "held", holder: existing, ageMs };
    }
    if (ageMs < staleMs && existing.pid === process.pid) {
      logLockSkipped({ holderPid: existing.pid, ageMs, staleMs, reason: "same_pid" });
      return { acquired: false, reason: "same_pid", holder: existing, ageMs };
    }
  }

  const lock = {
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
    process: "governance-risk-worker",
  };

  fs.writeFileSync(filePath, `${JSON.stringify(lock)}\n`, "utf8");
  logLockAcquired({ pid: lock.pid, hostname: lock.hostname, staleMs });
  return { acquired: true, lock, filePath };
}

/** Release lock only when owned by the current process. */
export function releaseWorkerLock(expectedPid = process.pid) {
  const filePath = resolveLockPath();
  const existing = readLock(filePath);
  if (!existing) {
    logLockReleased({ pid: expectedPid, released: false, reason: "missing" });
    return false;
  }
  if (Number(existing.pid) !== Number(expectedPid)) {
    logLockReleased({ pid: expectedPid, released: false, reason: "not_owner", holderPid: existing.pid });
    return false;
  }
  try {
    fs.unlinkSync(filePath);
    logLockReleased({ pid: expectedPid, released: true });
    return true;
  } catch {
    logLockReleased({ pid: expectedPid, released: false, reason: "unlink_failed" });
    return false;
  }
}

export function getWorkerLockStatus() {
  const filePath = resolveLockPath();
  const existing = readLock(filePath);
  if (!existing?.acquiredAt) {
    return { locked: false, filePath, staleMs: resolveStaleMs() };
  }
  const ageMs = Date.now() - new Date(existing.acquiredAt).getTime();
  return {
    locked: ageMs < resolveStaleMs(),
    filePath,
    staleMs: resolveStaleMs(),
    ageMs,
    holder: existing,
  };
}
