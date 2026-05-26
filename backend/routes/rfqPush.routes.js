import express from "express";
import {
  registerBuyerPushSubscription,
  registerBuyerPushHistorySession,
  postReminderAttributionEvent,
} from "../controllers/rfqPush.controller.js";
import { rfqHistoryAuth } from "../modules/rfq/middlewares/rfqHistory.middleware.js";

const router = express.Router();

router.post("/register", registerBuyerPushSubscription);
router.post("/register-history", rfqHistoryAuth, registerBuyerPushHistorySession);
router.post("/reminder-event", postReminderAttributionEvent);

export default router;
