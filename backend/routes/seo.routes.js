import express from "express";
import { getSitemapData } from "../controllers/seo.controller.js";

const router = express.Router();

router.get("/sitemap-data", getSitemapData);

export default router;
