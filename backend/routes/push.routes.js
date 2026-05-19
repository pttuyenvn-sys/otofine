import express from "express";
import { pool } from "../config/db.js";

const router = express.Router();

router.post("/save-player-id", async (req, res) => {
    try {
        console.log("BODY:", req.body);

        const { playerId, shopId } = req.body || {};

        if (!playerId) {
            return res.status(400).json({
                ok: false,
                message: "Missing playerId",
            });
        }

        if (shopId) {
            await pool.query(
                `
                UPDATE shops
                SET onesignal_player_id = ?
                WHERE id = ?
                `,
                [playerId, shopId],
            );
        }

        return res.json({
            ok: true,
        });
    } catch (err) {
        console.error("SAVE PLAYER ERROR:", err);

        return res.status(500).json({
            ok: false,
            error: err.message,
        });
    }
});

export default router;