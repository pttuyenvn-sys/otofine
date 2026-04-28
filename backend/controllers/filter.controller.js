import { pool } from "../config/db.js";

/* =========================
Gợi ý SEO Home: hãng hot + dòng xe hot
- score hãng = product_count + views + search_volume
- score dòng = product_count + views
(views / search_volume: placeholder 0 khi chưa có bảng analytics; mở rộng SQL sau)
========================= */
export async function getVehicleHotSuggestions(req, res) {
  try {
    const [brandRows] = await pool.query(
      `
      SELECT
        cm.hang_xe AS name,
        COUNT(DISTINCT pa.productId) AS product_count
      FROM product_car_applications pa
      INNER JOIN car_models cm ON cm.id = pa.carModelId
      WHERE cm.hang_xe IS NOT NULL AND TRIM(cm.hang_xe) != ''
      GROUP BY cm.hang_xe
      ORDER BY product_count DESC, name ASC
      LIMIT 8
      `,
    );

    const [modelRows] = await pool.query(
      `
      SELECT
        cm.hang_xe AS brand,
        cm.ten_xe AS model,
        COUNT(DISTINCT pa.productId) AS product_count
      FROM product_car_applications pa
      INNER JOIN car_models cm ON cm.id = pa.carModelId
      WHERE cm.hang_xe IS NOT NULL
        AND TRIM(cm.hang_xe) != ''
        AND cm.ten_xe IS NOT NULL
        AND TRIM(cm.ten_xe) != ''
      GROUP BY cm.hang_xe, cm.ten_xe
      ORDER BY product_count DESC, brand ASC, model ASC
      LIMIT 12
      `,
    );

    const viewsPlaceholder = 0;
    const searchVolumePlaceholder = 0;

    const brands = (brandRows || []).map((r) => {
      const productCount = Number(r.product_count) || 0;
      const v = viewsPlaceholder;
      const svol = searchVolumePlaceholder;
      return {
        name: r.name,
        product_count: productCount,
        views: v,
        search_volume: svol,
        score: productCount + v + svol,
      };
    });

    const models = (modelRows || []).map((r) => {
      const productCount = Number(r.product_count) || 0;
      const v = viewsPlaceholder;
      return {
        brand: r.brand,
        model: r.model,
        product_count: productCount,
        views: v,
        score: productCount + v,
      };
    });

    res.json({ brands, models });
  } catch (err) {
    console.error("getVehicleHotSuggestions", err);
    res.status(500).json({ brands: [], models: [] });
  }
}

/* =========================
Hãng xe có sản phẩm thật
========================= */
export async function getBrands(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        cm.hang_xe,
        COUNT(*) AS total
      FROM product_car_applications pa
      JOIN car_models cm ON cm.id = pa.carModelId
      GROUP BY cm.hang_xe
      ORDER BY total DESC, cm.hang_xe ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

/* =========================
Tên xe theo hãng có sản phẩm
========================= */
export async function getModels(req, res) {
  try {
    const { brand } = req.query;

    const [rows] = await pool.query(
      `
      SELECT
        cm.ten_xe,
        COUNT(*) AS total
      FROM product_car_applications pa
      JOIN car_models cm ON cm.id = pa.carModelId
      WHERE cm.hang_xe = ?
      GROUP BY cm.ten_xe
      ORDER BY total DESC, cm.ten_xe ASC
      `,
      [brand],
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

/* =========================
Năm SX theo xe
========================= */
export async function getYears(req, res) {
  try {
    const { brand, model } = req.query;

    const [rows] = await pool.query(
      `
      SELECT DISTINCT pa.year_from, pa.year_to
      FROM product_car_applications pa
      JOIN car_models cm ON cm.id = pa.carModelId
      WHERE cm.hang_xe = ?
      AND cm.ten_xe = ?
    `,
      [brand, model],
    );

    let years = [];

    rows.forEach((r) => {
      if (r.year_from === null || r.year_to === null) {
        return;
      }

      for (let y = r.year_from; y <= r.year_to; y++) {
        years.push(y);
      }
    });

    years = [...new Set(years)].sort((a, b) => b - a);

    res.json(years);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

/* =========================
Thông số xe
========================= */
export async function getSpecs(req, res) {
  try {
    const { brand, model } = req.query;

    const [rows] = await pool.query(
      `
      SELECT
        s.engine_cc,
        a.name,
        t.code
      FROM car_models cm
      LEFT JOIN car_model_specs s
        ON s.car_model_id = cm.id

      LEFT JOIN car_model_attributes cma
        ON cma.car_model_id = cm.id

      LEFT JOIN attributes a
        ON a.id = cma.attribute_id

      LEFT JOIN attribute_types t
        ON t.id = a.attribute_type_id

      WHERE cm.hang_xe = ?
      AND cm.ten_xe = ?
    `,
      [brand, model],
    );

    const result = {
      engine: [],
      gearbox: [],
      drivetrain: [],
      bodyType: [],
      cc: [],
    };

    rows.forEach((r) => {
      if (r.engine_cc) result.cc.push(r.engine_cc);

      if (r.code === "dong_co") result.engine.push(r.name);
      if (r.code === "hop_so") result.gearbox.push(r.name);
      if (r.code === "so_cau") result.drivetrain.push(r.name);
      if (r.code === "kieu_dang") result.bodyType.push(r.name);
    });

    result.engine = [...new Set(result.engine)];
    result.gearbox = [...new Set(result.gearbox)];
    result.drivetrain = [...new Set(result.drivetrain)];
    result.bodyType = [...new Set(result.bodyType)];
    result.cc = [...new Set(result.cc)];

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({});
  }
}
