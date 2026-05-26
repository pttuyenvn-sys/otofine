"use client";

import { useEffect } from "react";
import { initOneSignal } from "@/lib/onesignal";
import { wireBuyerPushNotificationClick } from "@/lib/rfq/rfqBuyerPushClick";

export default function PushInit() {
  useEffect(() => {
    initOneSignal();
    wireBuyerPushNotificationClick();
  }, []);

  return null;
}