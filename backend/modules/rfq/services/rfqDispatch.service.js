import crypto from "crypto";
import { pool } from "../../../config/db.js";
import { rfqDispatchTuning } from "../../../config/rfq.config.js";
import * as dispatchRepo from "../repositories/rfqDispatch.repository.js";
import * as notifRepo from "../repositories/rfqNotification.repository.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import * as audit from "./rfqAudit.service.js";
import { rfqLog } from "../utils/rfqLogger.js";
import { rfqCounterInc } from "./rfqObservability.service.js";
import { scheduleZaloEscalationJob } from "./rfqEscalation.schedule.js";
import { sendPush } from "../../../services/onesignalService.js";

/** Wave dispatch — respects max_dispatches_per_rfq, excludes shops already dispatched, env tuning only */
async function appendDispatchWaveInternal(rfqRequestId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tuning = rfqDispatchTuning;

    const [[waveRow]] = await conn.query(
      `SELECT COALESCE(MAX(wave), 0) AS mx FROM rfq_dispatches WHERE rfq_request_id = ?`,
      [rfqRequestId],
    );
    const nextWave = Number(waveRow?.mx || 0) + 1;

    const [[cntRow]] = await conn.query(
      `SELECT COUNT(*) AS c FROM rfq_dispatches WHERE rfq_request_id = ?`,
      [rfqRequestId],
    );
    const existing = Number(cntRow?.c || 0);
    const remainingSlots = Math.max(0, tuning.maxDispatchesPerRfq - existing);
    const waveCap = Math.min(tuning.wave1ShopCap, remainingSlots);

    let excludeIds = [];
    if (existing > 0) {
      const [rows] = await conn.query(`SELECT shop_id FROM rfq_dispatches WHERE rfq_request_id = ?`, [
        rfqRequestId,
      ]);
      excludeIds = rows.map((r) => r.shop_id);
    }

    const shopIds = waveCap > 0 ? await dispatchRepo.pickShopIdsForMatching(waveCap, excludeIds) : [];

    const respondBy = new Date(Date.now() + tuning.respondByHours * 3600 * 1000);
    const dispatchIds = [];

    for (const shopId of shopIds) {

      const [[shopRow]] = await conn.query(
        `
          SELECT onesignal_player_id
          FROM shops
          WHERE id = ?
          LIMIT 1
        `,
        [shopId]
      );

      const playerId = shopRow?.onesignal_player_id;

      console.log("SHOP PLAYER:", shopId, playerId);

      const dispatchId = await dispatchRepo.insertDispatch(conn, {
        rfq_request_id: rfqRequestId,
        shop_id: shopId,
        wave: nextWave,
        status: "web_notified",
        escalation_level: nextWave,
        web_notified_at: new Date(),
        match_score: null,
        respond_by: respondBy,
      });
      dispatchIds.push(dispatchId);

      if (playerId) {
        // Shop push URL: always /rfq/shop/:dispatchId — dispatchId is the
        // canonical shop conversation anchor; never use rfq_request_id here.
        await sendPush({
          playerIds: [playerId],

          title: "Có khách hỏi",

          message: "Giá phụ tùng ô tô",

          url: `/rfq/shop/${dispatchId}`,
        });

        console.log(
          "SHOP PUSH SENT:",
          shopId,
          dispatchId
        );
      }

      await notifRepo.insertNotification(conn, {
        rfq_request_id: rfqRequestId,
        dispatch_id: dispatchId,
        channel: "in_app",
        recipient_type: "shop",
        recipient_shop_id: shopId,
        payload_json: {
          kind: "rfq_web_inbox",
          dispatchId,
          rfqRequestId,
          wave: nextWave,
        },
        status: "sent",
      });
    }

    if (shopIds.length > 0) {
      await reqRepo.setStatus(conn, rfqRequestId, "dispatching");
    } else if (existing === 0) {
      await reqRepo.setStatus(conn, rfqRequestId, "open");
    }

    if (shopIds.length > 0) {
      await audit.audit(conn, {
        rfq_request_id: rfqRequestId,
        from_status: existing > 0 ? "dispatching" : "open",
        to_status: "dispatching",
        actor_type: "system",
        metadata_json: {
          dispatchedShops: shopIds.length,
          shopIds,
          wave: nextWave,
          tuningSnapshot: {
            wave1ShopCap: tuning.wave1ShopCap,
            maxDispatchesPerRfq: tuning.maxDispatchesPerRfq,
            respondByHours: tuning.respondByHours,
          },
        },
      });
    } else if (existing === 0) {
      await audit.audit(conn, {
        rfq_request_id: rfqRequestId,
        from_status: "open",
        to_status: "open",
        actor_type: "system",
        metadata_json: {
          noShopsMatched: true,
          wave: nextWave,
          tuningSnapshot: {
            wave1ShopCap: tuning.wave1ShopCap,
            maxDispatchesPerRfq: tuning.maxDispatchesPerRfq,
          },
        },
      });
    }

    await conn.commit();

    rfqLog.metric("rfq.dispatch.wave_completed", {
      rfq_request_id: rfqRequestId,
      dispatched: shopIds.length,
      shop_ids: shopIds,
      wave: nextWave,
    });

    for (const id of dispatchIds) {
      rfqCounterInc("dispatch_created");
      try {
        await scheduleZaloEscalationJob(id);
      } catch (err) {
        console.error("[RFQ] schedule Zalo escalation:", err?.message || err);
      }
    }

    return { dispatched: shopIds.length, wave: nextWave };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function runDispatchForOpenRequest(rfqRequestId) {
  return appendDispatchWaveInternal(rfqRequestId);
}

/** Admin / ops — thêm một wave shops chưa có dispatch (tuân max_dispatches_per_rfq). */
export async function appendDispatchWaveForRfq(rfqRequestId) {
  return appendDispatchWaveInternal(rfqRequestId);
}

export function generatePublicId() {
  return crypto.randomBytes(16).toString("hex");
}
