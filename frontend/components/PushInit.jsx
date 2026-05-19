"use client";

import { useEffect } from "react";
import { initOneSignal } from "@/lib/onesignal";

export default function PushInit() {

    useEffect(() => {
        initOneSignal();
    }, []);

    return null;
}