import { pool } from "../config/db.js";
import { generateCategorySeoContent } from "../services/categorySeoComposer.js";

/**
 * Get category SEO content with product data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getCategorySeoContent(req, res) {
  try {
    const { category } = req.params;
    const { page = 1, brand, model, year } = req.query;
    
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // Get products for this category with filters
    const products = await getCategoryProducts(category, { brand, model, year, page });
    
    // Get price range for this category
    const priceRange = await getCategoryPriceRange(category, { brand, model, year });
    
    // Generate SEO content
    const seoContent = generateCategorySeoContent({
      categoryName: category,
      products: products.data,
      filters: { brand, model, year },
      productCount: products.total,
      priceRange
    });

    res.json({
      success: true,
      data: {
        ...seoContent,
        products: products.data,
        pagination: {
          page: parseInt(page),
          total: products.totalPages,
          count: products.total
        }
      }
    });

  } catch (error) {
    console.error("Error in getCategorySeoContent:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to generate category SEO content"
    });
  }
}

/**
 * Get category products with pagination and filters
 * @param {string} category - Category name
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Products with pagination
 */
async function getCategoryProducts(category, filters = {}) {
  const { brand, model, year, page = 1 } = filters;
  const limit = 16;
  const offset = (parseInt(page) - 1) * limit;
  
  let whereConditions = ["p.partName = ?"];
  let params = [category];
  
  if (brand) {
    whereConditions.push("p.brand = ?");
    params.push(brand);
  }
  
  if (model) {
    whereConditions.push("p.model = ?");
    params.push(model);
  }
  
  if (year) {
    whereConditions.push("p.year = ?");
    params.push(year);
  }
  
  const whereClause = whereConditions.join(" AND ");
  
  // Get products
  const [products] = await pool.query(`
    SELECT 
      p.id,
      p.partName,
      p.brand,
      p.model,
      p.year,
      p.price,
      p.description,
      p.imageUrl,
      p.slug,
      p.shortDescription,
      p.subtitleLine1,
      p.subtitleLine2,
      p.summary,
      p.updatedAt
    FROM products p
    WHERE ${whereClause}
    ORDER BY p.updatedAt DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
  
  // Get total count
  const [countResult] = await pool.query(`
    SELECT COUNT(*) as total
    FROM products p
    WHERE ${whereClause}
  `, params);
  
  const total = countResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);
  
  return {
    data: products,
    total,
    totalPages,
    page: parseInt(page)
  };
}

/**
 * Get price range for category products
 * @param {string} category - Category name
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} Price range with min and max
 */
async function getCategoryPriceRange(category, filters = {}) {
  const { brand, model, year } = filters;
  
  let whereConditions = ["p.partName = ? AND p.price IS NOT NULL AND p.price > 0"];
  let params = [category];
  
  if (brand) {
    whereConditions.push("p.brand = ?");
    params.push(brand);
  }
  
  if (model) {
    whereConditions.push("p.model = ?");
    params.push(model);
  }
  
  if (year) {
    whereConditions.push("p.year = ?");
    params.push(year);
  }
  
  const whereClause = whereConditions.join(" AND ");
  
  try {
    const [priceResult] = await pool.query(`
      SELECT 
        MIN(p.price) as minPrice,
        MAX(p.price) as maxPrice,
        AVG(p.price) as avgPrice
      FROM products p
      WHERE ${whereClause}
    `, params);
    
    const result = priceResult[0];
    return {
      min: result.minPrice || null,
      max: result.maxPrice || null,
      avg: result.avgPrice || null
    };
  } catch (error) {
    console.error("Error getting price range:", error);
    return { min: null, max: null, avg: null };
  }
}

/**
 * Get all categories with product counts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getCategoriesWithCounts(req, res) {
  try {
    const [categories] = await pool.query(`
      SELECT 
        p.partName as category,
        COUNT(*) as productCount,
        MIN(p.price) as minPrice,
        MAX(p.price) as maxPrice,
        AVG(p.price) as avgPrice,
        GROUP_CONCAT(DISTINCT p.brand ORDER BY p.brand) as brands
      FROM products p
      WHERE p.partName IS NOT NULL 
        AND TRIM(p.partName) <> ''
        AND p.status = 'active'
      GROUP BY p.partName
      HAVING productCount > 0
      ORDER BY productCount DESC
    `);
    
    res.json({
      success: true,
      data: categories.map(cat => ({
        category: cat.category,
        productCount: cat.productCount,
        priceRange: {
          min: cat.minPrice,
          max: cat.maxPrice,
          avg: cat.avgPrice
        },
        brands: cat.brands ? cat.brands.split(',') : []
      }))
    });

  } catch (error) {
    console.error("Error in getCategoriesWithCounts:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to fetch categories"
    });
  }
}

/**
 * Get related categories for a given category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getRelatedCategories(req, res) {
  try {
    const { category } = req.params;
    
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // Get categories that frequently appear together in the same car models
    const [relatedCategories] = await pool.query(`
      SELECT 
        p2.partName as relatedCategory,
        COUNT(*) as cooccurrenceCount,
        COUNT(DISTINCT pa.carModelId) as modelCount
      FROM products p1
      JOIN product_car_applications pa1 ON p1.id = pa1.productId
      JOIN product_car_applications pa2 ON pa1.carModelId = pa2.carModelId
      JOIN products p2 ON pa2.productId = p2.id
      WHERE p1.partName = ? 
        AND p2.partName != ? 
        AND p2.status = 'active'
      GROUP BY p2.partName
      HAVING cooccurrenceCount >= 3
      ORDER BY cooccurrenceCount DESC, modelCount DESC
      LIMIT 8
    `, [category, category]);
    
    res.json({
      success: true,
      data: relatedCategories.map(cat => ({
        category: cat.relatedCategory,
        cooccurrenceCount: cat.cooccurrenceCount,
        modelCount: cat.modelCount
      }))
    });

  } catch (error) {
    console.error("Error in getRelatedCategories:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to fetch related categories"
    });
  }
}

/**
 * Get category-specific FAQ data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getCategoryFAQ(req, res) {
  try {
    const { category } = req.params;
    
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // Generate FAQ using the category SEO composer
    const { generateCategoryFAQ, detectCategoryProfile } = await import("../services/categorySeoComposer.js");
    
    const profile = detectCategoryProfile(category);
    const faqQuestions = generateCategoryFAQ(profile, category);
    
    // Get real customer questions if available (placeholder for future implementation)
    const customerQuestions = await getCustomerQuestions(category);
    
    res.json({
      success: true,
      data: {
        generated: faqQuestions,
        customer: customerQuestions,
        profile
      }
    });

  } catch (error) {
    console.error("Error in getCategoryFAQ:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to generate category FAQ"
    });
  }
}

/**
 * Get customer questions for a category (placeholder for future implementation)
 * @param {string} category - Category name
 * @returns {Promise<Array>} Customer questions
 */
async function getCustomerQuestions(category) {
  // This would be implemented later based on actual customer data
  // For now, return empty array
  return [];
}

/**
 * Get category metadata for SEO
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export async function getCategoryMetadata(req, res) {
  try {
    const { category } = req.params;
    
    if (!category || typeof category !== "string") {
      return res.status(400).json({ error: "Category parameter is required" });
    }

    // Get basic category info
    const [categoryInfo] = await pool.query(`
      SELECT 
        p.partName as category,
        COUNT(*) as productCount,
        MIN(p.price) as minPrice,
        MAX(p.price) as maxPrice,
        AVG(p.price) as avgPrice,
        GROUP_CONCAT(DISTINCT p.brand ORDER BY COUNT(*) DESC LIMIT 5) as topBrands,
        MIN(p.updatedAt) as oldestProduct,
        MAX(p.updatedAt) as newestProduct
      FROM products p
      WHERE p.partName = ? 
        AND p.status = 'active'
      GROUP BY p.partName
    `, [category]);
    
    if (categoryInfo.length === 0) {
      return res.status(404).json({ 
        error: "Category not found",
        message: "No products found for this category"
      });
    }
    
    const info = categoryInfo[0];
    
    // Generate SEO metadata
    const { generateCategorySeoContent } = await import("../services/categorySeoComposer.js");
    const seoContent = generateCategorySeoContent({
      categoryName: category,
      productCount: info.productCount,
      priceRange: {
        min: info.minPrice,
        max: info.maxPrice,
        avg: info.avgPrice
      }
    });
    
    res.json({
      success: true,
      data: {
        category: info.category,
        productCount: info.productCount,
        priceRange: {
          min: info.minPrice,
          max: info.maxPrice,
          avg: info.avgPrice
        },
        topBrands: info.topBrands ? info.topBrands.split(',') : [],
        lastUpdated: info.newestProduct,
        seo: {
          title: seoContent.title,
          description: seoContent.description,
          sections: seoContent.sections,
          faq: seoContent.faq,
          relatedCategories: seoContent.relatedCategories
        }
      }
    });

  } catch (error) {
    console.error("Error in getCategoryMetadata:", error);
    res.status(500).json({ 
      error: "Internal server error",
      message: "Failed to fetch category metadata"
    });
  }
}
