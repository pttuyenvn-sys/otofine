import { pool } from "../../../config/db.js";

export async function insertVehicle(conn, { customerProfileId, vehicle }) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO customer_vehicles (customer_profile_id, brand_label, model_label, year, car_model_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      customerProfileId,
      vehicle?.brand ?? null,
      vehicle?.model ?? null,
      vehicle?.year ?? null,
      vehicle?.carModelId ?? null,
    ],
  );
  return r.insertId;
}
