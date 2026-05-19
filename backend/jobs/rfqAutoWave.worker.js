#!/usr/bin/env node

import dotenv from "dotenv";
dotenv.config();

import { rfqFlags } from "../config/rfq.config.js";
import * as jobRepo from "../modules/rfq/repositories/rfqAutoWaveJob.repository.js";
import { processAutoWaveJob } from "../modules/rfq/services/rfqAutoWave.processor.js";

const POLL_MS = Math.max(
    3000,
    Number(process.env.RFQ_AUTO_WAVE_WORKER_POLL_MS || 5000),
);

async function tick() {
    if (!rfqFlags.RFQ_MODULE_ENABLED || !rfqFlags.RFQ_AUTO_WAVE_ENABLED) {
        return;
    }

    const unlocked = await jobRepo.unlockStaleAutoWaveProcessingJobs(
        Number(process.env.RFQ_AUTO_WAVE_STALE_LOCK_MINUTES || 15),
    );

    if (unlocked) {
        console.info("[rfq-auto-wave-worker] unlocked stale:", unlocked);
    }

    const ids = await jobRepo.claimDueAutoWaveJobs(
        Number(process.env.RFQ_AUTO_WAVE_BATCH || 10),
    );

    console.log("AUTO WAVE TICK", new Date().toISOString());
    console.log("CLAIMED IDS", ids);

    for (const id of ids) {
        try {
            console.log("PROCESSING JOB", id);

            await processAutoWaveJob(id);

            console.log("DONE JOB", id);
        } catch (e) {
            console.error(
                "[rfq-auto-wave-worker] job failed",
                id,
                e?.message || e,
            );
        }
    }
}

console.info("[rfq-auto-wave-worker] starting poll_ms=", POLL_MS);

tick().catch(console.error);

setInterval(() => {
    tick().catch(console.error);
}, POLL_MS);