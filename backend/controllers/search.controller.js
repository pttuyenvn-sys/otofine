/**
 * SEARCH-SINGLE-ENDPOINT-01
 */

import { buildSearchSuggestResponse } from "../services/searchSuggest.service.js";

export async function getSearchSuggest(req, res) {
  try {
    const query = req.query.query || req.query.keyword || req.query.q;
    if (!query || String(query).trim().length < 1) {
      return res.json({ groups: [], viewAll: { label: "", url: "/" }, categories: [] });
    }

    const payload = await buildSearchSuggestResponse(req.query);
    return res.json(payload);
  } catch (error) {
    console.error("[SEARCH] suggest:", error);
    res.status(500).json({ error: "Failed" });
  }
}
