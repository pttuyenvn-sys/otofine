// productList.controller.js — chỉ HTTP; logic ở services/productList.service.js
import * as productListService from "../services/productList.service.js";

export async function getProductList(req, res) {
  try {
    const body = await productListService.getProductList(req.query);
    res.json(body);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      page: 1,
      totalPages: 1,
      data: [],
    });
  }
}

export async function getBrands(req, res) {
  try {
    const rows = await productListService.getBrands();
    res.json(rows);
  } catch (err) {
    res.status(500).json([]);
  }
}

export async function getModels(req, res) {
  try {
    const { brand } = req.query;
    const rows = await productListService.getModels(brand);
    res.json(rows);
  } catch (err) {
    res.status(500).json([]);
  }
}
