import express from "express";
import { getPublicPartKnowledgeBySlug } from "../controllers/knowledgePublic.controller.js";

const router = express.Router();

router.get("/part/:slug", getPublicPartKnowledgeBySlug);

export default router;
