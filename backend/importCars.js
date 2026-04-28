import xlsx from "xlsx";
import { pool } from "./config/db.js";

async function run() {
  const workbook = xlsx.readFile("cars.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  for (const car of data) {
    console.log("🔄 Sync:", car.ten_xe);

    // 1. UPSERT car_models
    await pool.execute(
      `INSERT INTO car_models (hang_xe, ten_xe)
   VALUES (?, ?)
   ON DUPLICATE KEY UPDATE id = id`,
      [car.hang_xe, car.ten_xe],
    );

    // 2. Lấy lại id CHÍNH XÁC
    const [rows] = await pool.execute(
      `SELECT id FROM car_models 
   WHERE hang_xe = ? AND ten_xe = ?`,
      [car.hang_xe, car.ten_xe],
    );

    const carId = rows[0].id;

    if (rows.length === 0) {
      const [res] = await pool.execute(
        `INSERT INTO car_models (hang_xe, ten_xe) VALUES (?, ?)`,
        [car.hang_xe, car.ten_xe],
      );
      carId = res.insertId;
    } else {
      carId = rows[0].id;
    }

    // 2. XÓA mapping cũ
    await pool.execute(
      `DELETE FROM car_model_attributes WHERE car_model_id = ?`,
      [carId],
    );

    // 3. INSERT mapping mới
    const attrs = [
      ...(car.dong_co || "").split(","),
      ...(car.hop_so || "").split(","),
      ...(car.so_cau || "").split(","),
      ...(car.kieu_dang || "").split(","),
    ]
      .map((a) => a.trim())
      .filter((a) => a);

    for (const attrName of attrs) {
      const [attrRow] = await pool.execute(
        `SELECT id FROM attributes WHERE name = ?`,
        [attrName],
      );

      if (attrRow.length > 0) {
        await pool.execute(
          `INSERT IGNORE INTO car_model_attributes (car_model_id, attribute_id)
           VALUES (?, ?)`,
          [carId, attrRow[0].id],
        );
      }
    }

    // 4. XÓA specs cũ
    await pool.execute(`DELETE FROM car_model_specs WHERE car_model_id = ?`, [
      carId,
    ]);

    // 5. INSERT specs mới
    let cc = null;
    if (car.cc) {
      const raw = String(car.cc).toLowerCase();
      if (raw.includes("l")) {
        cc = Math.round(parseFloat(raw) * 1000);
      } else {
        cc = parseInt(raw.replace(/[^0-9]/g, ""));
      }
    }

    await pool.execute(
      `INSERT INTO car_model_specs (car_model_id, engine_cc, horsepower, torque)
       VALUES (?, ?, ?, ?)`,
      [carId, cc, car.hp || null, car.torque || null],
    );
  }

  console.log("🎉 SYNC DONE");
}

run();
