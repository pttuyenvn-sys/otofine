-- Style Engine anchors + editorial fields (v2/v3/v4) + notes
-- Chạy: node scripts/run-knowledge-migrations.js

ALTER TABLE part_knowledge
  ADD COLUMN style_persona_v2 VARCHAR(64) NULL AFTER faq_text,
  ADD COLUMN brand_persona_v3 VARCHAR(64) NULL AFTER style_persona_v2,
  ADD COLUMN buyer_intents_v4 JSON NULL AFTER brand_persona_v3,
  ADD COLUMN garage_notes_text LONGTEXT NULL AFTER buyer_intents_v4,
  ADD COLUMN buyer_mistakes_text LONGTEXT NULL AFTER garage_notes_text,
  ADD COLUMN vn_usage_notes_text LONGTEXT NULL AFTER buyer_mistakes_text;
