#!/usr/bin/env node
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const API = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:3001/api").replace(/\/+$/, "");
const phone = process.argv[2] || "+84987654321";

async function main() {
  console.info("API:", API, "phone:", phone);

  const req = await axios.post(`${API}/rfq/history/request-otp`, { phone });
  console.info("request-otp:", req.data);

  const code = req.data.devOtpCode;
  if (!code) {
    console.warn("Set RFQ_OTP_DEV_RETURN=true for automated verify");
    return;
  }

  const ver = await axios.post(`${API}/rfq/history/verify-otp`, { phone, otp: code });
  const token = ver.data.historyToken;
  console.info("verify-otp ok, expires:", ver.data.expiresAt, "rfqCount:", ver.data.buyerSummary?.rfqCount);

  const list = await axios.get(`${API}/rfq/history/requests`, {
    headers: { "X-RFQ-History-Token": token },
  });
  console.info("list total:", list.data.total, "summary:", list.data.summary);

  const summary = await axios.get(`${API}/rfq/history/summary`, {
    headers: { "X-RFQ-History-Token": token },
  });
  console.info("summary:", summary.data);
  if (list.data.items?.[0]) {
    console.info("first item:", list.data.items[0].publicId, list.data.items[0].buyerPhase);
    const open = await axios.post(
      `${API}/rfq/history/requests/${list.data.items[0].publicId}/open`,
      {},
      { headers: { "X-RFQ-History-Token": token } },
    );
    console.info("open ok publicId:", open.data.publicId);
  }

  console.info("\nHistory API smoke test passed.");
}

main().catch((e) => {
  console.error("FAILED:", e.response?.data || e.message);
  process.exit(1);
});
