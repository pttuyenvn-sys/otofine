import axios from "axios";
import { API_BASE } from "@/lib/config";
import { persistDeepLinkDispatchId } from "@/lib/rfq/rfqBuyerDeepLink";
import { isHistoryAuthError, openHistoryRequest } from "@/lib/rfq/rfqHistoryApi";
import { clearHistorySession, getHistoryToken } from "@/lib/rfq/rfqHistorySession";
import {
  clearStoredViewerSession,
  getStoredViewerToken,
  saveViewerSession,
} from "@/lib/rfq/rfqViewerSession";

/** Build buyer chat URL after successful token restore. */
export function buildRfqOpenChatUrl(viewerToken, dispatchId) {
  const tok = encodeURIComponent(String(viewerToken || "").trim());
  if (!tok) return "/rfq/history";

  const did = Number(dispatchId);
  if (Number.isFinite(did) && did > 0) {
    return `/rfq/t/${tok}?dispatchId=${did}#dispatch-${did}`;
  }

  return `/rfq/t/${tok}`;
}

/** Persist dispatch tab hint and navigate into buyer chat. */
export function redirectToViewerChat(viewerToken, dispatchId) {
  const did = Number(dispatchId);
  if (Number.isFinite(did) && did > 0) {
    persistDeepLinkDispatchId(did);
  }
  window.location.replace(buildRfqOpenChatUrl(viewerToken, dispatchId));
}

/**
 * Try restore viewer session from localStorage for publicId.
 * @returns {Promise<{ status: "no_session" | "token_invalid" | "token_valid", token?: string }>}
 */
export async function tryRestoreStoredViewerToken(publicId) {
  const pid = String(publicId || "").trim();
  if (!pid) return { status: "no_session" };

  const token = getStoredViewerToken(pid);
  if (!token) return { status: "no_session" };

  try {
    await axios.get(`${API_BASE}/rfq/by-token`, {
      headers: { "X-RFQ-Viewer-Token": token },
    });
    return { status: "token_valid", token };
  } catch {
    clearStoredViewerSession(pid);
    return { status: "token_invalid" };
  }
}

/**
 * Mint a fresh viewer token via history session (phone OTP portal).
 * @returns {Promise<{ status: "no_history_session" | "history_session_invalid" | "history_reopened" | "history_open_failed", token?: string }>}
 */
export async function tryReopenViaHistorySession(publicId) {
  const pid = String(publicId || "").trim();
  if (!pid) return { status: "no_history_session" };

  if (!getHistoryToken()) return { status: "no_history_session" };

  try {
    const data = await openHistoryRequest(pid);
    const viewerToken = data?.viewerToken ? String(data.viewerToken).trim() : "";
    if (!viewerToken) return { status: "history_open_failed" };

    saveViewerSession(pid, viewerToken);
    return { status: "history_reopened", token: viewerToken };
  } catch (err) {
    if (isHistoryAuthError(err)) {
      clearHistorySession();
      return { status: "history_session_invalid" };
    }
    return { status: "history_open_failed" };
  }
}
