import * as productCardService from "../services/productCard.service.js";

export async function getProductCardList(req, res) {
  try {
    const body = await productCardService.getProductCardList(req.query);
    res.json(body);
  } catch (err) {
    console.error("getProductCardList:", err);
    res.status(500).json({
      data: [],
      nextCursor: null,
      hasMore: false,
    });
  }
}
