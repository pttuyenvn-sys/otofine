import express from "express";
import {
  rfqBuyerRfqAccess,
  rfqConversationAccess,
} from "../middlewares/rfqConversationAccess.middleware.js";
import {
  rfqConvMessageSendRateLimit,
  rfqConvReadRateLimit,
  rfqConvUnreadSummaryRateLimit,
} from "../middlewares/rfqConversationRateLimit.middleware.js";
import * as ctrl from "../controllers/rfq.conversation.controller.js";

/**
 * Conversation APIs — dispatchId is the canonical room anchor.
 * Text + read cursors via poll; WebSocket / push for chat deferred.
 */
const router = express.Router();

router.get(
  "/unread-summary",
  rfqBuyerRfqAccess,
  rfqConvUnreadSummaryRateLimit,
  ctrl.unreadSummary,
);
router.post(
  "/:dispatchId/read",
  rfqConversationAccess,
  rfqConvReadRateLimit,
  ctrl.markRead,
);
router.get(
  "/:dispatchId/messages",
  rfqConversationAccess,
  rfqConvReadRateLimit,
  ctrl.listMessages,
);
router.post(
  "/:dispatchId/messages",
  rfqConversationAccess,
  rfqConvMessageSendRateLimit,
  ctrl.postMessage,
);
router.get(
  "/:dispatchId",
  rfqConversationAccess,
  rfqConvReadRateLimit,
  ctrl.getConversation,
);

export default router;
