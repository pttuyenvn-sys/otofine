import axios from "axios";
import { API_BASE } from "@/lib/config";
import {
  clearHistorySession,
  getHistoryToken,
  historySessionHeaders,
  saveHistorySession,
} from "@/lib/rfq/rfqHistorySession";

export async function requestHistoryOtp(phone) {
  const res = await axios.post(`${API_BASE}/rfq/history/request-otp`, { phone });
  return res.data;
}

export async function verifyHistoryOtp(phone, otp) {
  const res = await axios.post(`${API_BASE}/rfq/history/verify-otp`, { phone, otp });
  const data = res.data || {};
  if (data.historyToken) {
    saveHistorySession({
      historyToken: data.historyToken,
      expiresAt: data.expiresAt,
      phoneMasked: data.phoneMasked,
      lastPhone: phone,
    });
  }
  return data;
}

export async function fetchHistorySummary() {
  const res = await axios.get(`${API_BASE}/rfq/history/summary`, {
    headers: historySessionHeaders(),
  });
  return res.data;
}

export async function fetchHistoryRequests() {
  const res = await axios.get(`${API_BASE}/rfq/history/requests`, {
    headers: historySessionHeaders(),
  });
  return res.data;
}

export async function openHistoryRequest(publicId) {
  const res = await axios.post(
    `${API_BASE}/rfq/history/requests/${encodeURIComponent(publicId)}/open`,
    {},
    { headers: historySessionHeaders() },
  );
  return res.data;
}

export async function logoutHistorySession() {
  const token = getHistoryToken();
  if (token) {
    try {
      await axios.post(`${API_BASE}/rfq/history/logout`, {}, {
        headers: historySessionHeaders(),
      });
    } catch {
      /* ignore network errors on logout */
    }
  }
  clearHistorySession();
}

export function isHistoryAuthError(err) {
  const code = err?.response?.data?.code;
  const status = err?.response?.status;
  return status === 401 || code === "HISTORY_TOKEN_INVALID" || code === "HISTORY_TOKEN_MISSING";
}
