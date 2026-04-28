import express from "express";
import { getSeoPageBySlugCtrl } from "../controllers/seoPage.controller.js";

const router = express.Router();

router.get("/seo-page/:slug", getSeoPageBySlugCtrl);

export default router;
