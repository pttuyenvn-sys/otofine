/**
 * Primary fitment ownership — business lock on product_car_applications.is_primary.
 *
 * Invariant: each product with ≥1 fitment row must have exactly one is_primary = 1.
 * Default rule when caller does not specify: first row in the submitted cars[] array.
 */

/**
 * @param {unknown[]} cars
 * @returns {number} index of primary row, or -1 when empty
 */
export function resolvePrimaryIndex(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return -1;

  const explicit = cars.findIndex((c) => {
    if (!c || typeof c !== "object") return false;
    const v = c.is_primary ?? c.isPrimary;
    return v === true || v === 1 || v === "1";
  });
  if (explicit >= 0) return explicit;
  return 0;
}

/**
 * @param {unknown} executor mysql2 pool or connection
 * @param {number} productId
 */
export async function assertExactlyOnePrimaryFitment(executor, productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("PRIMARY_FITMENT_INVARIANT: invalid productId");
  }

  const [[row]] = await executor.query(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_primary = 1 THEN 1 ELSE 0 END) AS primary_count
    FROM product_car_applications
    WHERE productId = ?
    `,
    [id],
  );

  const total = Number(row?.total) || 0;
  const primaryCount = Number(row?.primary_count) || 0;

  if (total === 0) return;

  if (primaryCount !== 1) {
    const err = new Error(
      `PRIMARY_FITMENT_INVARIANT: product ${id} has ${primaryCount} primary row(s) among ${total} fitment(s)`,
    );
    err.code = "PRIMARY_FITMENT_INVARIANT";
    throw err;
  }
}

/**
 * @param {unknown} executor
 * @returns {Promise<{ ok: boolean, violations: { productId: number, total: number, primaryCount: number }[] }>}
 */
export async function auditPrimaryFitmentIntegrity(executor) {
  const [rows] = await executor.query(
    `
    SELECT
      productId,
      COUNT(*) AS total,
      SUM(CASE WHEN is_primary = 1 THEN 1 ELSE 0 END) AS primary_count
    FROM product_car_applications
    GROUP BY productId
    HAVING total > 0 AND primary_count <> 1
    ORDER BY productId
    `,
  );

  const violations = (rows || []).map((r) => ({
    productId: Number(r.productId),
    total: Number(r.total),
    primaryCount: Number(r.primary_count),
  }));

  return { ok: violations.length === 0, violations };
}

/**
 * Replace all fitment rows for a product (DELETE + INSERT with primary flags).
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} productId
 * @param {unknown[]} cars
 */
export async function replaceProductCarApplications(executor, productId, cars = []) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("replaceProductCarApplications: invalid productId");
  }

  await executor.query(`DELETE FROM product_car_applications WHERE productId = ?`, [
    id,
  ]);

  if (!Array.isArray(cars) || cars.length === 0) {
    return;
  }

  const primaryIdx = resolvePrimaryIndex(cars);

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const carModelId = Number(c?.carModelId);
    if (!Number.isFinite(carModelId) || carModelId <= 0) continue;

    const year_from = c?.year_from ?? null;
    const year_to = c?.year_to ?? null;
    const is_primary = i === primaryIdx ? 1 : 0;

    await executor.query(
      `
      INSERT INTO product_car_applications
        (productId, carModelId, year_from, year_to, is_primary)
      VALUES (?, ?, ?, ?, ?)
      `,
      [id, carModelId, year_from, year_to, is_primary],
    );
  }

  await assertExactlyOnePrimaryFitment(executor, id);
}

/**
 * Insert fitment rows for a newly created product (no DELETE).
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {unknown[]} cars
 */
export async function insertProductCarApplications(conn, productId, cars = []) {
  if (!Array.isArray(cars) || cars.length === 0) return;

  const id = Number(productId);
  const primaryIdx = resolvePrimaryIndex(cars);

  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const carModelId = Number(c?.carModelId);
    if (!Number.isFinite(carModelId) || carModelId <= 0) continue;

    const is_primary = i === primaryIdx ? 1 : 0;

    await conn.query(
      `
      INSERT INTO product_car_applications
        (productId, carModelId, year_from, year_to, is_primary)
      VALUES (?, ?, ?, ?, ?)
      `,
      [id, carModelId, c.year_from, c.year_to, is_primary],
    );
  }

  await assertExactlyOnePrimaryFitment(conn, id);
}
