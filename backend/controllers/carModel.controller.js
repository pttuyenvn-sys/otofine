// controllers/carModel.controller.js
import * as carModelService from "../services/carModel.service.js";

export async function getBrands(req, res) {
  const brands = await carModelService.getBrands();
  res.json(brands);
}

export async function getModels(req, res) {
  const { brand } = req.query;

  if (brand) {
    const models = await carModelService.getModelsByBrand(brand);
    return res.json(models);
  }

  const all = await carModelService.getAllModels();
  res.json(all);
}
