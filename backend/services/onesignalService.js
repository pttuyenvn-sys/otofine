import axios from "axios";

export async function sendPush({
    playerIds = [],
    title,
    message,
    url,
}) {
    try {
        if (!playerIds.length) {
            console.log("ONESIGNAL: no player ids");
            return;
        }

        const finalUrl =
            url && String(url).trim()
                ? String(url).trim()
                : "https://otofine.com";

        const payload = {
            app_id: process.env.ONESIGNAL_APP_ID,

            include_subscription_ids: playerIds,

            headings: {
                en: title,
            },

            contents: {
                en: message,
            },

            url: finalUrl,

            chrome_web_icon:
                "https://otofine.com/favicon.svg",

            chrome_web_badge:
                "https://otofine.com/favicon.svg",

            require_interaction: true,

            priority: 10,
        };

        console.log(
            "ONESIGNAL SHOP PAYLOAD:",
            JSON.stringify(payload, null, 2)
        );

        const res = await axios.post(
            "https://api.onesignal.com/notifications",
            payload,
            {
                headers: {
                    Authorization:
                        `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log(
            "ONESIGNAL PUSH SENT:",
            res.data.id
        );
    } catch (err) {
        console.error(
            "ONESIGNAL PUSH ERROR:",
            err.response?.data || err.message
        );
    }
}