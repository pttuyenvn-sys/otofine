import express from "express";
import { getSearchSuggest } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/suggest", getSearchSuggest);

export default router;
