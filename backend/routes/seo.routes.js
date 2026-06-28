import express from "express";
import { getSitemapData, getYearRangeLinks } from "../controllers/seo.controller.js";

const router = express.Router();

router.get("/sitemap-data", getSitemapData);
router.get("/year-range-links", getYearRangeLinks);

export default router;
