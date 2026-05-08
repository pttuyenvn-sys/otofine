import express from "express";
import { getAvailableLocations, getFilteredLocations } from "../controllers/location.controller.js";

const router = express.Router();

router.get("/available", getAvailableLocations);
router.get("/filtered", getFilteredLocations);

export default router;
