import axios from "axios";

function normalizeSubscriptionIds(subscriptionIds) {
  return (Array.isArray(subscriptionIds)
    ? subscriptionIds
    : []
  )
    .map((x) => String(x || "").trim())
    .filter(Boolean);
}

export async function sendBuyerQuotePush({
  subscriptionIds,
  rfqRequestId,
  rfqId,
  shopName,
  viewerPath,
  headings,
  contents,
  url: urlOverride,
  data: dataOverride,
}) {
  const resolvedRfqRequestId = rfqRequestId ?? rfqId;

  try {
    if (
      resolvedRfqRequestId == null ||
      !Number.isFinite(Number(resolvedRfqRequestId)) ||
      Number(resolvedRfqRequestId) <= 0
    ) {
      console.warn("[BUYER PUSH] skip: invalid rfqRequestId", resolvedRfqRequestId);
      return { ok: false, called: false, reason: "invalid_rfq_request_id" };
    }

    const ids = normalizeSubscriptionIds(subscriptionIds);

    console.log("[BUYER PUSH] IDS NORMALIZED:", ids);
    console.log("[BUYER PUSH] VIEWER PATH:", viewerPath);
    console.log("[BUYER PUSH] RFQ ID:", resolvedRfqRequestId);

    if (!ids.length) {
      return { ok: false, called: false, reason: "no_subscription_ids" };
    }

    const finalUrl =
      urlOverride && String(urlOverride).trim()
        ? String(urlOverride).trim()
        : viewerPath && String(viewerPath).startsWith("/rfq/")
          ? `https://otofine.com${viewerPath}`
          : "https://otofine.com";

    console.log("[BUYER PUSH] FINAL URL:", finalUrl);

    const payload = {
      app_id: process.env.ONESIGNAL_APP_ID,

      include_subscription_ids: ids,

      headings: headings || {
        en: "Có shop vừa báo giá phụ tùng",
      },

      contents: contents || {
        en: `${shopName || "Shop"} đã phản hồi giá phụ tùng ô tô của bạn`,
      },

      url: finalUrl,

      ...(dataOverride && typeof dataOverride === "object" ? { data: dataOverride } : {}),

      chrome_web_icon: "https://otofine.com/favicon.svg",

      chrome_web_badge: "https://otofine.com/favicon.svg",

      require_interaction: true,

      priority: 10,
    };

    console.log("[BUYER PUSH] PAYLOAD:", JSON.stringify(payload, null, 2));

    const res = await axios.post("https://api.onesignal.com/notifications", payload, {
      headers: {
        Authorization: `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    console.log("[BUYER PUSH] SENT:", res.data?.id ?? null);
    console.log("[BUYER PUSH] FULL RESPONSE:", JSON.stringify(res.data, null, 2));

    return {
      ok: true,
      called: true,
      notificationId: res.data?.id ?? null,
      subscriptionIds: ids,
      url: finalUrl,
    };
  } catch (err) {
    console.error("[BUYER PUSH] ERROR:", err.response?.data || err.message);
    return {
      ok: false,
      called: true,
      reason: "onesignal_error",
      error: err.response?.data || err.message,
    };
  }
}