import express from "express";
import {
  listPartKnowledgeHandler,
  getPartKnowledgeHandler,
  createPartKnowledgeHandler,
  updatePartKnowledgeHandler,
  deletePartKnowledgeHandler,
  importBatch1PartKnowledgeHandler,
} from "../controllers/partKnowledge.controller.js";

const router = express.Router();

router.get("/", listPartKnowledgeHandler);
router.post("/import-batch1", importBatch1PartKnowledgeHandler);
router.get("/:id", getPartKnowledgeHandler);
router.post("/", createPartKnowledgeHandler);
router.patch("/:id", updatePartKnowledgeHandler);
router.delete("/:id", deletePartKnowledgeHandler);

export default router;
