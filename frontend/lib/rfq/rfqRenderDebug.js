"use client";

import { useEffect, useRef } from "react";

export function rfqRenderDebugEnabled() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage?.getItem("rfq_debug_render") === "1";
}

/** Log mount/update counts — enable with sessionStorage.rfq_debug_render=1 */
export function useRfqRenderTrace(label, extra) {
  const countRef = useRef(0);
  countRef.current += 1;

  useEffect(() => {
    if (!rfqRenderDebugEnabled()) return;
    console.info(`[rfq-render] ${label} #${countRef.current}`, extra ?? "");
  });
}
