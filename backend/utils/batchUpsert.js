/**
 * Chunked INSERT ... ON DUPLICATE KEY UPDATE for mysql2.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} sqlTemplate Full SQL with single VALUES row: INSERT INTO t (a,b) VALUES ? ON DUPLICATE KEY UPDATE ...
 * @param {any[][]} rows
 * @param {number} [chunkSize]
 */
export async function executeBatchValues(conn, sqlTemplate, rows, chunkSize = 150) {
  if (!rows.length) return 0;
  let done = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    await conn.query(sqlTemplate, [slice]);
    done += slice.length;
  }
  return done;
}
