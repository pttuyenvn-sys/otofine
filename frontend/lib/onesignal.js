import OneSignal from "react-onesignal";

/** @type {Promise<void> | null} */
let initPromise = null;

/**
 * OneSignal chỉ được init một lần trong lifecycle (StrictMode không gọi lại SDK).
 * Không dùng popup mặc định OneSignal — chỉ cấu hình tối thiểu + custom UI.
 */
export async function initOneSignal() {
  if (typeof window === "undefined") return;

  if (initPromise) return initPromise;

  const appId = (
    typeof process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID === "string"
      ? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
      : ""
  ).trim();

  if (!appId) {
    console.warn(
      "[OneSignal] NEXT_PUBLIC_ONESIGNAL_APP_ID không có — bỏ qua init.",
    );
    initPromise = Promise.resolve();
    return initPromise;
  }

  initPromise = (async () => {
    try {
      await OneSignal.init({
        appId,
        autoRegister: false,
        notifyButton: {
          enable: false,
        },
        welcomeNotification: {
          disable: true,
        },
        serviceWorkerPath: "OneSignalSDKWorker.js",
        serviceWorkerParam: {
          scope: "/",
        },
      });
      console.log("[OneSignal] initialized");
    } catch (err) {
      console.error("[OneSignal] init failed:", err);
    }
  })();

  return initPromise;
}

/** Dùng khi cần chờ init (ví dụ PushInit). */
export function getOneSignalReady() {
  return initPromise ?? Promise.resolve();
}
