import { pool } from "./config/db.js";

async function init() {
  try {
    console.log("Tạo bảng Admin...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Admin (
        id INT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        passwordHash VARCHAR(255) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      INSERT IGNORE INTO Admin (id, email, passwordHash)
      VALUES (1, 'admin@otofine.com', '$2a$10$placeholderhash1234567890123456789012345678901234567890');
    `);

    console.log("Tạo bảng shops...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        name VARCHAR(255),
        avatar VARCHAR(500),
        cover VARCHAR(500),
        phone VARCHAR(50),
        email VARCHAR(255),
        zalo VARCHAR(50),
        website VARCHAR(255),

        provinceId INT,
        districtId INT,
        wardId INT,
        addressDetail VARCHAR(500),

        descriptionHtml LONGTEXT,
        salePolicy LONGTEXT,
        warrantyPolicy LONGTEXT,

        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    console.log("Tạo bảng shops thành công!");

    console.log("Thêm cột shopId vào bảng products (nếu chưa có)...");

    await pool.query(`
      ALTER TABLE products 
      ADD COLUMN shopId INT NULL;
    `);

    console.log("Hoàn tất khởi tạo database!");
  } catch (err) {
    console.error("Lỗi:", err);
  } finally {
    process.exit();
  }
}

init();
