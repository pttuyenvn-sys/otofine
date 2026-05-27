# Phase 1A Slice 1 — Pre-Deploy Review

> **Review scope:** `051_schema_migrations.sql`, `051_schema_migrations.rollback.sql`, `run-admin-migration.js`, `package.json` script additions  
> **Date:** 2026-05-26  
> **Reviewer:** Pre-deploy automated code review  
> **Verdict:** BLOCKED — 3 corrections required before deploy (see §1). None affect architecture.

---

## Summary

| Severity | Count | Description |
|---|---|---|
| BLOCKER | 3 | Must fix before deploy |
| CORRECTION | 2 | Must fix before deploy (code quality/safety) |
| RISK | 3 | Should document; no code change required |
| OBSERVATION | 4 | Low severity; informational |

---

## §1 — BLOCKERS

### B1: `--file` with no value silently falls back to run-all

**File:** `run-admin-migration.js` — CLI arg parsing block  
**Severity:** BLOCKER

**Problem:**

```js
const fileArgIdx = args.indexOf("--file");
const SINGLE_FILE = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;
```

When `--file` is the last argument and no value follows, `args[fileArgIdx + 1]` is `undefined`. `SINGLE_FILE` is `undefined`, which is **falsy**. The guard on the next line is:

```js
if (SINGLE_FILE && !ADMIN_MIGRATION_FILES.includes(SINGLE_FILE)) {
```

Because `SINGLE_FILE` is falsy, the guard is skipped entirely. Execution then reaches:

```js
const filesToProcess = SINGLE_FILE
  ? [SINGLE_FILE]
  : [...ADMIN_MIGRATION_FILES];
```

Because `SINGLE_FILE` is `undefined` (falsy), `filesToProcess` becomes all 6 admin migration files. An operator who types:

```bash
node scripts/run-admin-migration.js --file
```

intending to get an error will instead silently trigger a run-all attempt. In Slice 1 context this then hits the missing-files exit (B2), but once all 6 files exist this silently runs all 6 without any error.

**Correction required:**

```js
if (fileArgIdx !== -1 && !args[fileArgIdx + 1]) {
  console.error("[admin-migration] ERROR: --file requires a filename argument.");
  process.exit(1);
}
```

Insert this check immediately after the `fileArgIdx` line, before `SINGLE_FILE` is used.

---

### B2: No-arg run exits with error when 052–056 are absent from disk

**File:** `run-admin-migration.js` — missing-files check block  
**Severity:** BLOCKER

**Problem:**

The missing-files check runs **before** the dry-run branch:

```js
const missing = filesToProcess.filter(
  (f) => !fs.existsSync(path.join(MIGRATIONS_DIR, f)),
);
if (missing.length > 0) {
  console.error(`${tag} ERROR: Migration file(s) not found:`);
  missing.forEach((f) => console.error(`  - ${path.join(MIGRATIONS_DIR, f)}`));
  process.exit(1);       // ← hard exit before dry-run branch is reached
}

if (DRY_RUN) { ... }
```

In Slice 1, only `051_schema_migrations.sql` exists on disk. Files 052–056 are not deployed yet. This means **any invocation without `--file`** — including `npm run migrate:admin:foundation:dry` — fails immediately with:

```
[admin-migration] ERROR: Migration file(s) not found:
  - /var/www/otofine/backend/migrations/052_admin_accounts.sql
  - ...
```

This makes the `migrate:admin:foundation` and `migrate:admin:foundation:dry` npm scripts **non-functional in Slice 1** until all 6 files are deployed. The runbook's "dry run first" step (`node scripts/run-admin-migration.js --dry-run`) will fail if run without `--file`.

**Impact on runbook:**

The execution commands in `phase-1a-slice1-files.md` use `--file 051_schema_migrations.sql` explicitly, so those steps are correct. The risk is the broader `npm run migrate:admin:foundation:dry` entry in the proposed package.json addition and any future operator who runs the script without reading the runbook carefully.

**Correction required (choose one):**

Option A — Rename the package.json script to require `--file` always in Slice 1:
```json
"migrate:admin:foundation": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql"
```
Reverts to `node scripts/run-admin-migration.js` when all 6 files are deployed.

Option B — Make the missing-files check warn-and-skip instead of fatal for no-arg mode, reserving the hard exit for `--file` with a named missing file:
```
if --file MODE and file is missing → hard exit (intentional target is absent)
if no-arg MODE and some files are missing → warn + skip missing, apply present ones
```

Option A is simpler and requires no logic change. The review recommends **Option A** for Slice 1 specifically.

---

### B3: "Transactional execution" claim is factually incorrect for DDL

**File:** `run-admin-migration.js` — JSDoc and `applyMigration` function  
**Severity:** BLOCKER (documentation/operational hazard)

**Problem:**

The JSDoc at the top and the `applyMigration` inline comment both claim:

```
* - Transactional: wraps each file in BEGIN/COMMIT; rolls back on error
```

```js
* Execution order:
*   1. BEGIN
*   2. Execute all statements from the SQL file
*   3. INSERT into schema_migrations
*   4. COMMIT
*   On any error: ROLLBACK then re-throw
```

This description is **incorrect** for all migrations in the admin set (051–056), which are composed entirely of DDL statements (`CREATE TABLE`). In MySQL InnoDB, **DDL statements cause an implicit COMMIT**. When `conn.beginTransaction()` issues `BEGIN`, and then `conn.query(sql)` executes `CREATE TABLE IF NOT EXISTS schema_migrations`, the DDL immediately issues an implicit COMMIT — the transaction ends at that point. Any subsequent `ROLLBACK` in the catch block applies only to DML issued after the DDL; it **cannot undo a CREATE TABLE**.

**Operational consequence:** If an incident occurs during migration 052, 053, or any future DDL migration, an operator who reads this comment will believe that the ROLLBACK undid the schema change. It did not. They may skip the manual rollback steps in the runbook under this false assumption, leaving the database in a partially-applied state without realizing it.

**For migration 051 specifically**, this is safe in practice because:
- `CREATE TABLE IF NOT EXISTS` is always idempotent
- If the INSERT into `schema_migrations` fails after the implicit commit, the next run finds the table (IF NOT EXISTS → no-op) and successfully inserts the record

But the comment still needs to be corrected because operators and future contributors will copy this pattern to non-idempotent DDL scenarios.

**Correction required:**

Replace the `applyMigration` JSDoc with an accurate description:

```js
/**
 * Apply a single migration file.
 *
 * NOTE: MySQL DDL statements (CREATE TABLE, ALTER TABLE, etc.) cause an
 * implicit COMMIT regardless of any surrounding BEGIN/COMMIT block. For
 * DDL-only migrations, the "transaction" provides ROLLBACK coverage only
 * for any DML statements that follow the last DDL in the file. For all
 * admin migrations 051–056 (pure CREATE TABLE), this means ROLLBACK on
 * error has no effect — the table will exist and the runner will correctly
 * record it on the next run via the IF NOT EXISTS + INSERT retry path.
 *
 * Execution order:
 *   1. BEGIN
 *   2. Execute SQL file (DDL causes implicit commit at each DDL statement)
 *   3. INSERT into schema_migrations (inside auto-commit if no DML follows)
 *   4. COMMIT
 *   On error: ROLLBACK (effective only for DML after the last DDL)
 */
```

Also update the top-level JSDoc feature list:

```
 *   - Transactional: BEGIN/COMMIT wraps each file; ROLLBACK on DML errors
 *     (note: DDL causes implicit MySQL commit — see applyMigration JSDoc)
```

---

## §2 — CORRECTIONS REQUIRED

### C1: `splitStatements` is dead code with a logic bug

**File:** `run-admin-migration.js` — `splitStatements` function (lines ~186–191)  
**Severity:** CORRECTION

**Problem:**

`splitStatements` is defined but **never called anywhere in the file**. The runner passes the full SQL string directly to `conn.query()` with `multipleStatements: true`, matching the pattern used by all existing migration runners (`run-rfq-migration.js`, `run-seo-migrations.js`, `run-auth-migration.js`). The function is unreachable.

Additionally, the function contains a logical error in its filter predicate:

```js
.filter((s) => s.length > 0 && !s.replace(/--[^\n]*/g, "").trim() === "");
```

Due to JavaScript operator precedence, `!s.replace(/--[^\n]*/g, "").trim()` is evaluated as `Boolean(!string)` first, producing `false` (all non-empty strings are truthy, so their negation is `false`). The expression then becomes `false === ""` which is always `false`. The filter condition evaluates to:

```js
s.length > 0 && false  // → always false
```

This would filter out all statements. If this function were ever called, it would silently return an empty array, causing all SQL to be silently dropped with no error.

**Correction required:**

Remove the entire `splitStatements` function. It is not used and must not be called.

---

### C2: Drift warning path double-counts as both `driftWarnings` and `skipped`

**File:** `run-admin-migration.js` — drift check block  
**Severity:** CORRECTION

**Problem:**

When a drift warning is detected, the code executes:

```js
if (recorded.checksum && recorded.checksum !== checksum) {
  console.warn(`${tag} DRIFT WARNING: ...`);
  driftWarnings++;
}
// falls through to:
skipped++;
continue;
```

The `skipped++` and `continue` are outside the if/else — they execute unconditionally for any already-applied file, whether it drifted or not. This means the final summary line:

```
[admin-migration] Done — applied: 0, skipped: 1, drift warnings: 1
```

reports the drifted file as both a drift warning and a skip. An operator reading the logs may interpret "skipped: 1" as "1 file was safely skipped" when it was actually skipped due to drift and requires investigation.

**Correction required:**

Move `skipped++` inside the else branch so drifted files are counted in `driftWarnings` only:

```js
if (recorded.checksum && recorded.checksum !== checksum) {
  console.warn(`...`);
  driftWarnings++;
} else {
  console.log(`${tag} SKIP (already applied): ${filename}`);
  skipped++;
}
continue;
```

---

## §3 — RISKS

### R1: No env var validation before `createConnection`

**File:** `run-admin-migration.js` — `createConnection`  
**Severity:** RISK

If `dotenv.config()` fails silently (wrong CWD, missing `.env` file), `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are all `undefined`. `mysql.createConnection` with `undefined` credentials returns `ER_ACCESS_DENIED_ERROR`. The error is caught by `main().catch()` and produces `[admin-migration] FATAL: Access denied...` — a confusing message when the actual problem is missing environment variables.

This is the same pattern used by all 6 existing migration runners and is therefore consistent with project convention. It does not require a code change before deploy.

**Recommended mitigation:** The runbook's pre-deploy checklist (§1.2 and §3.3) verifies `.env` integrity before running the migration. No code change required for Slice 1.

**Note:** `dotenv.config()` is safe when invoked via `npm run migrate:admin:foundation` because npm sets CWD to the package.json directory (`/var/www/otofine/backend`). It is unsafe only if run via direct `node` invocation from another CWD. The runbook specifies `cd /var/www/otofine/backend` before all node invocations, which is sufficient.

---

### R2: `ensureSchemaTable` bootstrap SQL is duplicated from `051_schema_migrations.sql`

**File:** `run-admin-migration.js` — `ensureSchemaTable` function  
**Severity:** RISK (maintenance debt only, not a deploy blocker)

The `CREATE TABLE IF NOT EXISTS` SQL inside `ensureSchemaTable` is a verbatim duplicate of the SQL in `051_schema_migrations.sql`. If a future developer modifies `051_schema_migrations.sql` (e.g., adds a column) without also updating the bootstrap SQL, the bootstrap creates the old schema and migration 051 becomes a no-op (IF NOT EXISTS), silently leaving the new column absent.

This is a Slice 1 non-issue because both copies are currently in sync. However, any future change to `051_schema_migrations.sql` must also update `ensureSchemaTable`. This should be documented with a comment.

**Recommended mitigation (no code change required for deploy):** Add a comment to `ensureSchemaTable`:

```js
// SYNC REQUIRED: This SQL must remain identical to 051_schema_migrations.sql.
// If you modify 051_schema_migrations.sql, update this function to match.
```

---

### R3: Exit code 2 (drift warnings) is not documented in PM2 or monitoring context

**File:** `run-admin-migration.js` — exit code block  
**Severity:** RISK (operational only)

The runner exits with code `2` when drift warnings are detected. This is a valid and intentional design. However:

- PM2 does not manage this runner (it is invoked manually per the runbook) — no PM2 concern.
- No CI/CD pipeline exists for this project — no pipeline concern.
- The runbook's execution commands do not capture or check the exit code explicitly.

If an operator runs `node scripts/run-admin-migration.js --file 051_schema_migrations.sql` and drift is detected, the terminal will show the warning but the shell exit code `$?` will be `2`, not `1`. Shell error handling that checks `[ $? -ne 0 ]` will correctly treat this as non-zero. No code change required.

**Recommended mitigation:** The runbook execution commands should add `echo "Exit code: $?"` after each migration run step, so the operator explicitly sees the exit code and can distinguish code 0 (success), code 1 (fatal error), and code 2 (drift warning).

---

## §4 — OBSERVATIONS

### O1: `migration 051` records itself via the runner, not via its own SQL

**Observation:** The SQL file `051_schema_migrations.sql` creates the `schema_migrations` table but does NOT insert a record of itself. The INSERT is performed by `recordMigration` in the JavaScript runner. This means:

- If `051_schema_migrations.sql` is applied manually (e.g., directly via `mysql < 051_schema_migrations.sql`), the table is created but `051_schema_migrations.sql` is **not recorded** in it. On the next runner invocation, the runner will attempt to re-apply it, encounter `IF NOT EXISTS` (no-op), then successfully insert the record. The net result is correct, but the re-apply attempt produces an unnecessary `APPLY` log line.
- This is the intended behavior and is documented in the plan. No correction needed.

---

### O2: `.rollback.sql` file naming is a new convention with no existing precedent

**Observation:** `051_schema_migrations.rollback.sql` is the first `.rollback.sql` file in the `migrations/` directory. Existing runners only process specifically-named files; none glob `*.rollback.sql`. No risk of accidental execution. The convention is clean and forward-compatible with future rollback automation if needed.

---

### O3: `ADMIN_MIGRATION_FILES` array includes files that are not yet deployed

**Observation:** The `ADMIN_MIGRATION_FILES` constant includes 052–056, none of which exist on disk in Slice 1. This is intentional — the runner is designed to manage all 6 admin migrations across multiple deployment slices. Because of B2, using the runner without `--file` will fail until all 6 files exist. This is acceptable given the correction in B2 (Option A: update the package.json script to pass `--file 051` for Slice 1).

---

### O4: `package.json` script name `migrate:admin:foundation:dry` will fail in Slice 1

**Observation:** The proposed script:

```json
"migrate:admin:foundation:dry": "node scripts/run-admin-migration.js --dry-run"
```

runs without `--file`, which triggers B2 immediately (missing 052–056). This script should not be added to `package.json` in Slice 1 as currently written. Either apply the B2 correction (Option A) to make it:

```json
"migrate:admin:foundation:dry": "node scripts/run-admin-migration.js --file 051_schema_migrations.sql --dry-run"
```

Or defer adding the no-arg dry-run script until all 6 migration files are deployed.

---

## §5 — MySQL 8.0 Compatibility Verification

| Feature used | MySQL 8.0.44 compatible? | Notes |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | Yes | Supported since 5.0 |
| `DATETIME(3)` fractional seconds | Yes | Supported since 5.6.4 |
| `INT UNSIGNED AUTO_INCREMENT` | Yes | Standard |
| `CHAR(64)` for SHA-256 | Yes | Fixed-length; efficient for exact-match lookups |
| `utf8mb4_unicode_ci` | Yes | Standard on 8.0 |
| `ON DUPLICATE KEY UPDATE` | Yes | Supported since 4.1 |
| `mysql2` `beginTransaction` / `commit` / `rollback` | Yes | mysql2 v3, Node 20 |
| `multipleStatements: true` | Yes | Confirmed in all existing runners |
| `crypto.createHash('sha256')` | Yes | Node built-in, no external dep |

No MySQL 8.0 compatibility blockers found.

---

## §6 — Existing Migration Compatibility

| Check | Result |
|---|---|
| `schema_migrations` table name conflicts with existing tables | No — confirmed by grep of all migration files |
| New runner touches existing migration files | No — hardcoded `ADMIN_MIGRATION_FILES` list only |
| New npm scripts conflict with existing script names | No — no `migrate:admin:*` entries exist in package.json |
| `.rollback.sql` file picked up by existing runners | No — existing runners reference named files explicitly |
| `run-admin-migration.js` imports from existing modules | No — only `fs`, `path`, `crypto`, `url` (built-in) + `mysql2`, `dotenv` (already in dependencies) |

No conflicts with existing migration infrastructure.

---

## §7 — Production Coupling Verification

| Check | Result |
|---|---|
| `051_schema_migrations.sql` modifies existing tables | No — `CREATE TABLE IF NOT EXISTS` only |
| Runner reads from existing application tables | No |
| Runner modifies existing application tables | No |
| Runner mounts any Express routes or middleware | No — standalone Node script |
| Runner is loaded by `server.js` | No |
| Runner affects PM2 process lifecycle | No |
| Runner touches storefront, RFQ, SEO, or seller tables | No |
| `.env` additions required for runner | No — uses existing `DB_*` vars |

No accidental coupling to production application code or data.

---

## §8 — Required Corrections Summary

Before deploying Slice 1, the following must be addressed in `run-admin-migration.js` and the proposed `package.json` additions:

| ID | File | Change |
|---|---|---|
| B1 | `run-admin-migration.js` | Add explicit `--file` missing-value guard (exit 1 when `--file` has no argument) |
| B2 | `package.json` + `run-admin-migration.js` docs | Update Slice 1 npm scripts to pass `--file 051_schema_migrations.sql` explicitly, OR change missing-file behavior in no-arg mode to warn-and-skip |
| B3 | `run-admin-migration.js` | Replace JSDoc "transactional" claim with accurate DDL/implicit-commit description |
| C1 | `run-admin-migration.js` | Remove `splitStatements` function entirely |
| C2 | `run-admin-migration.js` | Move `skipped++` inside the else branch so drifted files are not also counted as skipped |

The SQL files (`051_schema_migrations.sql`, `051_schema_migrations.rollback.sql`) require **no changes**. They are correct.

None of the required corrections affect architecture, scope, or the migration strategy. All are isolated to `run-admin-migration.js`.
