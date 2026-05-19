import express from "express";
import { registerBuyerPushSubscription } from "../controllers/rfqPush.controller.js";

const router = express.Router();

router.post("/register", registerBuyerPushSubscription);

export default router;
