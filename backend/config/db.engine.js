/**
 * Otofine Knowledge Engine & migrations: chọn dialect theo env.
 * - mysql (mặc định): toàn bộ API hiện tại dùng mysql2 pool.
 * - mssql: bảng part_knowledge + repository hỗ trợ T-SQL (kết nối riêng).
 *
 * DB_ENGINE: mysql | mssql | sqlserver
 */
export function getDbEngine() {
  const raw = (
    process.env.DB_ENGINE ||
    process.env.DB_TYPE ||
    "mysql"
  )
    .toLowerCase()
    .trim();
  if (
    raw === "mssql" ||
    raw === "sqlserver" ||
    raw === "microsoft sql server" ||
    raw === "azuresql"
  ) {
    return "mssql";
  }
  return "mysql";
}
