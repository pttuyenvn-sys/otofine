/**
 * One-off or scheduled: map products.part_knowledge_id from partName ↔ part_knowledge.
 * Env: PART_MATCH_MIN_SCORE, PART_MATCH_OVERWRITE=1, PART_MATCH_DRY_RUN=1, PART_MATCH_BATCH=200
 */
import { runPartKnowledgeProductMatch } from "../services/partKnowledgeMatch.service.js";

runPartKnowledgeProductMatch({ onLog: (line) => console.log(`[part-knowledge-match] ${line}`) })
  .then((r) => {
    console.log("[part-knowledge-match] summary:");
    console.log(
      JSON.stringify(
        {
          loadedProducts: r.loadedProducts,
          withName: r.withName,
          loadedKnowledge: r.loadedKnowledge,
          matched: r.matched,
          unmatched: r.unmatched,
          toApply: r.toApply,
          skipped: r.skipped,
          updated: r.updated,
          durationMs: r.durationMs,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
