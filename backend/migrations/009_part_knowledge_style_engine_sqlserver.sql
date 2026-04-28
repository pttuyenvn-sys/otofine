-- Style Engine anchors + editorial fields (v2/v3/v4) + notes
ALTER TABLE part_knowledge ADD style_persona_v2 NVARCHAR(64) NULL;
ALTER TABLE part_knowledge ADD brand_persona_v3 NVARCHAR(64) NULL;
ALTER TABLE part_knowledge ADD buyer_intents_v4 NVARCHAR(MAX) NULL;
ALTER TABLE part_knowledge ADD garage_notes_text NVARCHAR(MAX) NULL;
ALTER TABLE part_knowledge ADD buyer_mistakes_text NVARCHAR(MAX) NULL;
ALTER TABLE part_knowledge ADD vn_usage_notes_text NVARCHAR(MAX) NULL;
