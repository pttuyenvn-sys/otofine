# Phase 1A Slice 1 — Implementation Files

> **Scope:** schema_migrations table + migration runner only  
> **Files to create:**
> - `backend/migrations/051_schema_migrations.sql`
> - `backend/scripts/run-admin-migration.js`
> - `backend/migrations/051_schema_migrations.rollback.sql`
>
> **package.json entry to add:**
> - `"migrate:admin:foundation": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql"`
> - `"migrate:admin:foundation:dry": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql --dry-run"`
>
> **No other files are touched.**

---

## File 1: `backend/migrations/051_schema_migrations.sql`

```sql
-- =====================================================================
-- Migration 051 — Schema migrations tracking table
-- =====================================================================
--
-- ADDITIVE ONLY. Creates a single new table.
-- No existing tables are modified.
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to re-run.
--
-- Purpose:
--   Provides a persistent record of which migration files have been
--   applied to this database, along with their SHA-256 checksum at
--   the time of application. The run-admin-migration.js runner reads
--   this table to skip already-applied files and to detect checksum
--   drift (file modified after being applied).
--
-- Columns:
--   id          — auto-increment surrogate key
--   filename    — basename of the SQL file (e.g. "051_schema_migrations.sql")
--                 unique; acts as the idempotency key
--   applied_at  — wall-clock timestamp at apply time (UTC, ms precision)
--   checksum    — SHA-256 hex digest of the SQL file contents at apply time
--                 NULL is permitted for files applied before checksums were added
--   applied_by  — optional free-text label (e.g. "admin-runner v1", "manual")
--
-- Rollback: see 051_schema_migrations.rollback.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  filename    VARCHAR(255)   NOT NULL,
  applied_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checksum    CHAR(64)       NULL     COMMENT 'SHA-256 hex of file contents at apply time',
  applied_by  VARCHAR(100)   NULL     COMMENT 'Runner label or "manual"',
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_filename (filename)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Tracks applied SQL migrations with checksums for drift detection';
```

---

## File 2: `backend/migrations/051_schema_migrations.rollback.sql`

```sql
-- =====================================================================
-- Rollback for Migration 051 — schema_migrations
-- =====================================================================
--
-- WARNING: Only run this if you are rolling back the entire
-- admin foundation. Once other admin migrations (052+) are applied,
-- this table cannot be dropped without first rolling back all
-- dependent migrations.
--
-- Safe to run if: only migration 051 has been applied and no other
-- admin_ tables exist.
--
-- Pre-flight check before running:
--   SELECT COUNT(*) FROM schema_migrations;
--   -- If count > 1, other migrations are tracked here. Do NOT drop.
--   -- If count = 1 (only '051_schema_migrations.sql' row), safe to drop.
--
-- =====================================================================

DROP TABLE IF EXISTS schema_migrations;
```

---

## File 3: `backend/scripts/run-admin-migration.js`

```js
#!/usr/bin/env node
/**
 * Admin Foundation migration runner.
 *
 * Features:
 *   - Idempotent: skips files already recorded in schema_migrations
 *   - SHA-256 checksum: verifies file integrity; warns on drift
 *   - MySQL DDL note: DDL statements (CREATE TABLE, ALTER TABLE, etc.) cause
 *     an implicit COMMIT in InnoDB regardless of any surrounding BEGIN/COMMIT.
 *     ROLLBACK on error applies only to DML following the last DDL in a file.
 *     For admin migrations 051-056 (pure CREATE TABLE), rollback on error has
 *     no effect on schema; the IF NOT EXISTS + INSERT retry path on the next
 *     run handles any partial-failure state safely.
 *   - Dry-run: --dry-run flag prints what would run without executing
 *   - Single-file mode: --file <name> applies only that migration
 *   - Self-bootstrapping: creates schema_migrations if it does not exist
 *
 * Usage:
 *   node scripts/run-admin-migration.js --file 051_schema_migrations.sql
 *   node scripts/run-admin-migration.js --file 051_schema_migrations.sql --dry-run
 *   node scripts/run-admin-migration.js --file 052_admin_accounts.sql
 *
 * npm script (add to package.json):
 *   "migrate:admin:foundation": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql"
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const RUNNER_LABEL = "admin-runner v1";

/**
 * Admin platform migration files in strict execution order.
 * Only files listed here are managed by this runner.
 * Files not in this list are never touched.
 */
const ADMIN_MIGRATION_FILES = [
  "051_schema_migrations.sql",
  "052_admin_accounts.sql",
  "053_admin_rbac.sql",
  "054_admin_audit_log.sql",
  "055_admin_feature_flags.sql",
  "056_admin_job_queue.sql",
];

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const fileArgIdx = args.indexOf("--file");

// B1: explicit guard — --file with no following value is an error, not a fallback
if (fileArgIdx !== -1 && !args[fileArgIdx + 1]) {
  console.error("[admin-migration] ERROR: --file requires a filename argument.");
  process.exit(1);
}

const SINGLE_FILE = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

if (SINGLE_FILE && !ADMIN_MIGRATION_FILES.includes(SINGLE_FILE)) {
  console.error(
    `[admin-migration] ERROR: "${SINGLE_FILE}" is not in the managed file list.\n` +
      `  Managed files:\n` +
      ADMIN_MIGRATION_FILES.map((f) => `    - ${f}`).join("\n"),
  );
  process.exit(1);
}

const filesToProcess = SINGLE_FILE
  ? [SINGLE_FILE]
  : [...ADMIN_MIGRATION_FILES];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hex digest of a string.
 * @param {string} content
 * @returns {string} 64-char hex string
 */
function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Build a mysql2 connection from environment variables.
 * @returns {Promise<mysql.Connection>}
 */
async function createConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    multipleStatements: true,
  });
}

// ---------------------------------------------------------------------------
// Bootstrap: ensure schema_migrations table exists
// ---------------------------------------------------------------------------

/**
 * Create schema_migrations if it does not already exist.
 * This is the only DDL operation the runner performs outside a transaction
 * because the table must exist before we can check migration state.
 *
 * Uses the same CREATE TABLE IF NOT EXISTS SQL as migration 051 itself,
 * so running 051 after bootstrap is a no-op (IF NOT EXISTS guard).
 */
async function ensureSchemaTable(conn) {
  const bootstrapSQL = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
      filename    VARCHAR(255)   NOT NULL,
      applied_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      checksum    CHAR(64)       NULL,
      applied_by  VARCHAR(100)   NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE = InnoDB
      DEFAULT CHARSET = utf8mb4
      COLLATE = utf8mb4_unicode_ci
      COMMENT = 'Tracks applied SQL migrations with checksums for drift detection'
  `;
  await conn.query(bootstrapSQL);
}

// ---------------------------------------------------------------------------
// State queries
// ---------------------------------------------------------------------------

/**
 * Return a Map<filename, {checksum, applied_at}> for all already-applied files.
 * @param {mysql.Connection} conn
 * @returns {Promise<Map<string, {checksum: string|null, applied_at: Date}>>}
 */
async function loadAppliedMigrations(conn) {
  const [rows] = await conn.query(
    "SELECT filename, checksum, applied_at FROM schema_migrations",
  );
  const map = new Map();
  for (const row of rows) {
    map.set(row.filename, { checksum: row.checksum, applied_at: row.applied_at });
  }
  return map;
}

/**
 * Record a migration as applied in schema_migrations.
 * Called after the migration SQL executes. Because DDL causes an implicit
 * COMMIT, this INSERT runs in auto-commit mode for DDL-only migrations.
 * ON DUPLICATE KEY UPDATE handles the race condition where two concurrent
 * runners both pass the loadAppliedMigrations check.
 * @param {mysql.Connection} conn
 * @param {string} filename
 * @param {string} checksum
 */
async function recordMigration(conn, filename, checksum) {
  await conn.query(
    `INSERT INTO schema_migrations (filename, checksum, applied_by)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       checksum   = VALUES(checksum),
       applied_at = CURRENT_TIMESTAMP(3),
       applied_by = VALUES(applied_by)`,
    [filename, checksum, RUNNER_LABEL],
  );
}

// ---------------------------------------------------------------------------
// Core: apply a single migration file
// ---------------------------------------------------------------------------

/**
 * Apply a single migration file.
 *
 * BEGIN/COMMIT wraps DML portions. For DDL-only migrations (051-056, all
 * pure CREATE TABLE), each DDL statement causes an implicit COMMIT in
 * MySQL InnoDB — the explicit BEGIN/COMMIT and ROLLBACK apply only to
 * any DML that follows the last DDL in the file. For migrations 051-056
 * there is no such DML, so ROLLBACK on error has no practical effect on
 * schema state. The IF NOT EXISTS guard on every CREATE TABLE and the
 * ON DUPLICATE KEY UPDATE in recordMigration ensure a safe retry on the
 * next run if a partial failure occurs.
 *
 * @param {mysql.Connection} conn
 * @param {string} filename  basename only
 * @param {string} sql       full file contents
 * @param {string} checksum  SHA-256 of sql
 */
async function applyMigration(conn, filename, sql, checksum) {
  await conn.beginTransaction();
  try {
    await conn.query(sql);
    await recordMigration(conn, filename, checksum);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tag = DRY_RUN ? "[admin-migration:dry-run]" : "[admin-migration]";

  console.log(`${tag} Starting — ${new Date().toISOString()}`);
  if (DRY_RUN) {
    console.log(`${tag} DRY-RUN mode: no SQL will be executed`);
  }
  if (SINGLE_FILE) {
    console.log(`${tag} Single-file mode: ${SINGLE_FILE}`);
  }

  // Verify all target SQL files exist before connecting to DB.
  const missing = filesToProcess.filter(
    (f) => !fs.existsSync(path.join(MIGRATIONS_DIR, f)),
  );
  if (missing.length > 0) {
    console.error(`${tag} ERROR: Migration file(s) not found:`);
    missing.forEach((f) => console.error(`  - ${path.join(MIGRATIONS_DIR, f)}`));
    process.exit(1);
  }

  if (DRY_RUN) {
    // In dry-run mode, just print what would happen without a DB connection.
    for (const filename of filesToProcess) {
      const fullPath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksum = sha256(sql);
      console.log(`${tag} WOULD APPLY: ${filename} (sha256: ${checksum.slice(0, 12)}...)`);
    }
    console.log(`${tag} Dry run complete — 0 changes made`);
    process.exit(0);
  }

  const conn = await createConnection();
  let applied = 0;
  let skipped = 0;
  let driftWarnings = 0;

  try {
    await ensureSchemaTable(conn);
    const alreadyApplied = await loadAppliedMigrations(conn);

    for (const filename of filesToProcess) {
      const fullPath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksum = sha256(sql);

      if (alreadyApplied.has(filename)) {
        const recorded = alreadyApplied.get(filename);

        // Checksum drift check: warn if file changed after being applied.
        if (recorded.checksum && recorded.checksum !== checksum) {
          console.warn(
            `${tag} DRIFT WARNING: ${filename}\n` +
              `  Recorded checksum : ${recorded.checksum}\n` +
              `  Current checksum  : ${checksum}\n` +
              `  Applied at        : ${recorded.applied_at}\n` +
              `  The file was modified after being applied. ` +
              `Investigate before re-running.`,
          );
          driftWarnings++;
        } else {
          console.log(`${tag} SKIP (already applied): ${filename}`);
          skipped++;
        }
        continue;
      }

      console.log(`${tag} APPLY: ${filename} (sha256: ${checksum.slice(0, 12)}...)`);
      await applyMigration(conn, filename, sql, checksum);
      console.log(`${tag} OK: ${filename}`);
      applied++;
    }
  } finally {
    await conn.end();
  }

  console.log(
    `${tag} Done — applied: ${applied}, skipped: ${skipped}, drift warnings: ${driftWarnings}`,
  );

  if (driftWarnings > 0) {
    console.error(
      `${tag} ATTENTION: ${driftWarnings} drift warning(s). ` +
        `Review the warnings above before applying further migrations.`,
    );
    process.exit(2); // distinct exit code: warnings present, not a hard failure
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[admin-migration] FATAL:", err.message);
  process.exit(1);
});
```

---

## package.json entry (additive — append to `"scripts"` block)

```json
"migrate:admin:foundation": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql",
"migrate:admin:foundation:dry": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql --dry-run"
```

> **Slice 1 note:** Both scripts explicitly target `051_schema_migrations.sql` because migrations
> 052–056 are not yet deployed. When all 6 files are on disk (Slice 2+), update to
> `node scripts/run-admin-migration.js` without `--file` to enable run-all mode.

---

## Verification queries (run after applying 051)

```sql
-- 1. Confirm table was created
SHOW TABLES LIKE 'schema_migrations';
-- Expected: 1 row

-- 2. Confirm structure
DESCRIBE schema_migrations;
-- Expected columns: id, filename, applied_at, checksum, applied_by

-- 3. Confirm the runner recorded itself
SELECT id, filename, checksum, applied_by, applied_at
FROM schema_migrations;
-- Expected: 1 row with filename = '051_schema_migrations.sql'

-- 4. Regression: no existing tables altered
-- (Run counts from pre-deploy baseline in §1.5 of runbook)
SELECT COUNT(*) FROM products;
SELECT COUNT(*) FROM shops;
```

---

## Exact execution commands

```bash
# Step 1: Dry run first — verify file list and checksums without touching DB
cd /var/www/otofine/backend
node scripts/run-admin-migration.js --dry-run

# Step 2: Apply only migration 051
node scripts/run-admin-migration.js --file 051_schema_migrations.sql

# Step 3: Verify
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  -e "SELECT id, filename, LEFT(checksum,16) AS chk, applied_by, applied_at FROM schema_migrations;"

# Step 4: Idempotency check — re-run should SKIP, not fail
node scripts/run-admin-migration.js --file 051_schema_migrations.sql
# Expected output: [admin-migration] SKIP (already applied): 051_schema_migrations.sql

# Step 5: Drift detection check — modify file, re-run, confirm warning
# (Do NOT actually modify in production — test only on dev DB)
```

---

## Rollback command

```bash
mysql -u{DB_USER} -p{DB_PASSWORD} {DB_NAME} \
  < /var/www/otofine/backend/migrations/051_schema_migrations.rollback.sql
```
