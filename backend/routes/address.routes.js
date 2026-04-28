import express from "express";
import { getProvinces, getWards } from "../controllers/address.controller.js";

const router = express.Router();

router.get("/provinces", getProvinces);
router.get("/wards", getWards);

export default router;
