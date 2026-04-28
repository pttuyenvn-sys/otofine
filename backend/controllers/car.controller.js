import * as carService from "../services/carModel.service.js";
import { pool } from "../config/db.js";

/* GET /api/car/brands */
export async function getBrands(req, res) {
  const data = await carService.getBrands();
  res.json(data);
}

/* GET /api/car/models?brand=Toyota */
export async function getModelsByBrand(req, res) {
  try {
    const { brand } = req.query;
    if (!brand) {
      return res.status(400).json({ message: "brand is required" });
    }
    const data = await carService.getModelsByBrand(brand);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export const getCarAttributes = async (req, res) => {
  try {
    const { carModelId } = req.query;

    const [rows] = await pool.query(
      `
      SELECT 
        at.code,
        a.name
      FROM car_model_attributes cma
      JOIN attributes a ON a.id = cma.attribute_id
      JOIN attribute_types at ON at.id = a.attribute_type_id
      WHERE cma.car_model_id = ?
    `,
      [carModelId],
    );

    const [spec] = await pool.query(
      `
      SELECT engine_cc 
      FROM car_model_specs 
      WHERE car_model_id = ?
    `,
      [carModelId],
    );

    const result = {
      dong_co: [],
      hop_so: [],
      so_cau: [],
      kieu_dang: [],
      cc: [],
    };

    rows.forEach((r) => {
      if (result[r.code]) {
        result[r.code].push(r.name);
      }
    });

    if (spec.length && spec[0].engine_cc) {
      result.cc.push(String(spec[0].engine_cc));
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error load attributes" });
  }
};
