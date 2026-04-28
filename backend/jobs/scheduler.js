import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { logError, logInfo } from "../utils/syncLogger.js";
import { runNightlyRebuild } from "./nightlyRebuild.js";

const SCOPE = "scheduler";

/**
 * Default 03:00 every day (server clock). Override with SYNC_CRON.
 * Timezone: SYNC_TZ or Asia/Ho_Chi_Minh.
 * @param {object} [opts]
 * @param {string} [opts.cronExpression]
 * @param {string} [opts.timezone]
 * @returns {import('node-cron').ScheduledTask}
 */
export function startSyncScheduler(opts = {}) {
  const cronExpression =
    opts.cronExpression || process.env.SYNC_CRON || "0 3 * * *";
  const timezone = opts.timezone || process.env.SYNC_TZ || "Asia/Ho_Chi_Minh";

  const task = cron.schedule(
    cronExpression,
    async () => {
      try {
        logInfo(SCOPE, "cron tick: runNightlyRebuild");
        await runNightlyRebuild();
      } catch (e) {
        logError(SCOPE, "cron runNightlyRebuild failed", {
          err: String(e?.message || e),
        });
      }
    },
    { scheduled: true, timezone },
  );

  logInfo(SCOPE, "scheduler started", { cronExpression, timezone });
  return task;
}

/**
 * @param {import('node-cron').ScheduledTask | undefined} task
 */
export function stopSyncScheduler(task) {
  if (task && typeof task.stop === "function") {
    task.stop();
    logInfo(SCOPE, "scheduler stopped");
  }
}

const __filename = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  startSyncScheduler();
}

export default { startSyncScheduler, stopSyncScheduler };
