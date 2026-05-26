"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  redirectToViewerChat,
  tryReopenViaHistorySession,
  tryRestoreStoredViewerToken,
} from "@/lib/rfq/rfqPushDeepOpen";

const LOADING_COPY = {
  viewer: "Đang kiểm tra phiên xem…",
  history: "Đang kiểm tra lịch sử…",
  reopen: "Đang mở lại yêu cầu…",
};

export default function RfqOpenPage() {
  const searchParams = useSearchParams();
  const publicId = searchParams.get("publicId")?.trim() ?? "";
  const dispatchId = searchParams.get("dispatchId")?.trim() ?? "";

  const [phase, setPhase] = useState("loading");
  const [loadStep, setLoadStep] = useState("viewer");
  const [status, setStatus] = useState(null);

  const statusKey = useMemo(() => {
    if (!status) return null;
    if (status === "token_valid" || status === "history_reopened") return "token_found";
    return status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setLoadStep("viewer");
      setStatus(null);

      const viewerResult = await tryRestoreStoredViewerToken(publicId);
      if (cancelled) return;

      if (viewerResult.status === "token_valid" && viewerResult.token) {
        setStatus("token_valid");
        redirectToViewerChat(viewerResult.token, dispatchId);
        return;
      }

      if (
        viewerResult.status === "no_session" ||
        viewerResult.status === "token_invalid"
      ) {
        setLoadStep("history");
        const historyResult = await tryReopenViaHistorySession(publicId);
        if (cancelled) return;

        if (historyResult.status === "history_reopened" && historyResult.token) {
          setLoadStep("reopen");
          setStatus("history_reopened");
          redirectToViewerChat(historyResult.token, dispatchId);
          return;
        }

        if (historyResult.status === "history_session_invalid") {
          setStatus("history_session_invalid");
          setPhase("debug");
          return;
        }

        setStatus(viewerResult.status);
        setPhase("debug");
        return;
      }

      setStatus(viewerResult.status);
      setPhase("debug");
    })();

    return () => {
      cancelled = true;
    };
  }, [publicId, dispatchId]);

  if (phase === "loading") {
    return (
      <div className="card rfq-open-resolver">
        <p className="rfq-open-resolver__loading" role="status" aria-live="polite">
          <span className="rfq-open-resolver__spinner" aria-hidden />
          {LOADING_COPY[loadStep] || LOADING_COPY.viewer}
        </p>
      </div>
    );
  }

  return (
    <div className="card rfq-open-resolver">
      <h1 className="rfq-open-resolver__title">RFQ Open Resolver</h1>
      <p className="muted rfq-open-resolver__lead">Deep-link landing (Step 3 — history reopen)</p>

      {status === "token_invalid" ? (
        <p className="rfq-open-resolver__error" role="alert">
          Không tìm thấy phiên hợp lệ
        </p>
      ) : null}

      {status === "history_session_invalid" ? (
        <p className="rfq-open-resolver__error" role="alert">
          Phiên lịch sử đã hết hạn — cần đăng nhập lại
        </p>
      ) : null}

      <dl className="rfq-open-resolver__params">
        <div className="rfq-open-resolver__row">
          <dt>publicId</dt>
          <dd>{publicId || "—"}</dd>
        </div>
        <div className="rfq-open-resolver__row">
          <dt>dispatchId</dt>
          <dd>{dispatchId || "—"}</dd>
        </div>
        <div className="rfq-open-resolver__row">
          <dt>status</dt>
          <dd>{statusKey || "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
