#!/usr/bin/env node
/**
 * RFQ guest uploads retention — xóa file trong uploads/rfq/ quá cũ (không đụng DB URL refs).
 * Chạy cron weekly. Bật với RFQ_UPLOAD_RETENTION_DAYS > 0.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const days = Number(process.env.RFQ_UPLOAD_RETENTION_DAYS || 0);
const dir = path.join(process.cwd(), "uploads", "rfq");

function main() {
  if (!days || days < 7) {
    console.info("[rfq-retention] RFQ_UPLOAD_RETENTION_DAYS off or too low — noop");
    return;
  }
  if (!fs.existsSync(dir)) {
    console.info("[rfq-retention] no dir", dir);
    return;
  }
  const cutoff = Date.now() - days * 86400 * 1000;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(p);
        n += 1;
      }
    } catch {
      /* skip */
    }
  }
  console.info("[rfq-retention] deleted files:", n, "older_than_days:", days);
}

main();
