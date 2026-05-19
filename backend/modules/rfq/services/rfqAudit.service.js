import * as logRepo from "../repositories/rfqStatusLog.repository.js";
import { rfqLog } from "../utils/rfqLogger.js";

export async function audit(conn, row) {
  await logRepo.insertLog(conn, row);
  rfqLog.info("rfq.audit", {
    rfq_request_id: row.rfq_request_id,
    from_status: row.from_status ?? null,
    to_status: row.to_status,
    actor_type: row.actor_type ?? "system",
    actor_shop_id: row.actor_shop_id ?? null,
    meta: row.metadata_json ?? null,
  });
}
