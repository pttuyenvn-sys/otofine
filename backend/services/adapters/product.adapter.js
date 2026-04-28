// backend/services/adapters/product.adapter.js

export function mapProduct(row, carsByProduct = {}) {
  return {
    ProductID: row.id,
    ShopID: row.shop_id,

    PartNumber: row.part_number,
    PartName: row.part_name,

    Stock: row.stock,
    Price: row.price,

    PartCategory: row.category,
    Origin: row.origin,

    ShortDescription: row.short_description,
    FullDescription: row.full_description,

    Weight: row.weight,
    Length: row.length,
    Width: row.width,
    Height: row.height,

    ImagePath: row.image_path || null,
    DateCreated: row.created_at,

    // ⚠️ GIỮ NGUYÊN SHAPE CŨ
    cars: carsByProduct[row.id] || [],
  };
}
