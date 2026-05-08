import express from "express";

import { getVehicleSeoPageCtrl } from "../controllers/vehicleSeo.controller.js";

const router = express.Router();

router.get("/vehicle-seo/:slug", getVehicleSeoPageCtrl);

export default router;