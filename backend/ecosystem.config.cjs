/**
 * PM2 process definitions — Otofine backend.
 *
 * Usage:
 *   cd backend && pm2 start ecosystem.config.cjs
 *   pm2 start ecosystem.config.cjs --only governance-risk-worker
 *   pm2 logs governance-risk-worker
 */
module.exports = {
  apps: [
    {
      name: "otofine-api",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "governance-risk-worker",
      script: "jobs/riskEvaluation.worker.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "256M",
      min_uptime: "10s",
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        GOVERNANCE_RISK_WORKER_ENABLED: "true",
        GOVERNANCE_RISK_BATCH: "50",
        GOVERNANCE_RISK_SKIP_MINUTES: "10",
        GOVERNANCE_RISK_POLL_MIN_MS: "300000",
        GOVERNANCE_RISK_POLL_MAX_MS: "600000",
      },
    },
  ],
};
