-- MERGE dbo.part_knowledge từ bảng tạm (sau khi nạp JSON bằng BULK/OPENROWSET hoặc INSERT).
-- Cột nguồn phải trùng tên với cột đích; id KHÔNG có trên bảng nguồn.
-- Tạo staging:
/*
CREATE TABLE #src (
  slug NVARCHAR(191) NOT NULL,
  name_vi NVARCHAR(512) NULL,
  name_en NVARCHAR(512) NULL,
  canonical_name NVARCHAR(512) NULL,
  aliases_json NVARCHAR(MAX) NULL,
  regional_aliases_json NVARCHAR(MAX) NULL,
  summary NVARCHAR(MAX) NULL,
  body NVARCHAR(MAX) NULL,
  category_tag NVARCHAR(128) NULL,
  category_name NVARCHAR(255) NULL,
  system_group NVARCHAR(128) NULL,
  vehicle_area NVARCHAR(128) NULL,
  seo_priority NVARCHAR(10) NULL,
  seo_tier NVARCHAR(10) NULL,
  tier_class NVARCHAR(10) NULL,
  ai_priority INT NULL,
  search_score INT NULL,
  diagnosis_weight INT NULL,
  is_active BIT NULL,
  function_text NVARCHAR(MAX) NULL,
  structure_text NVARCHAR(MAX) NULL,
  operation_text NVARCHAR(MAX) NULL,
  symptoms_text NVARCHAR(MAX) NULL,
  common_causes_text NVARCHAR(MAX) NULL,
  replace_interval_text NVARCHAR(MAX) NULL,
  warnings_text NVARCHAR(MAX) NULL,
  buying_guide_text NVARCHAR(MAX) NULL,
  faq_text NVARCHAR(MAX) NULL,
  garage_notes_text NVARCHAR(MAX) NULL,
  buyer_mistakes_text NVARCHAR(MAX) NULL,
  vn_usage_notes_text NVARCHAR(MAX) NULL,
  style_persona_v2 NVARCHAR(64) NULL,
  brand_persona_v3 NVARCHAR(64) NULL,
  buyer_intents_v4 NVARCHAR(MAX) NULL,
  symptom_keywords_json NVARCHAR(MAX) NULL,
  search_intents_json NVARCHAR(MAX) NULL,
  cross_sell_json NVARCHAR(MAX) NULL
);
-- INSERT INTO #src (...) -- dữ liệu từ file / tool
*/

SET NOCOUNT ON;
-- Yêu cầu: bảng #src đã tồn tại và có dữ liệu trong cùng phiên.

MERGE dbo.part_knowledge WITH (HOLDLOCK) AS t
USING (SELECT * FROM #src) AS s
  ON t.slug = s.slug
WHEN MATCHED THEN UPDATE SET
  name_vi = s.name_vi,
  name_en = s.name_en,
  canonical_name = s.canonical_name,
  aliases_json = s.aliases_json,
  regional_aliases_json = s.regional_aliases_json,
  summary = s.summary,
  body = s.body,
  category_tag = s.category_tag,
  category_name = s.category_name,
  system_group = s.system_group,
  vehicle_area = s.vehicle_area,
  seo_priority = s.seo_priority,
  seo_tier = s.seo_tier,
  tier_class = s.tier_class,
  ai_priority = s.ai_priority,
  search_score = s.search_score,
  diagnosis_weight = s.diagnosis_weight,
  is_active = s.is_active,
  function_text = s.function_text,
  structure_text = s.structure_text,
  operation_text = s.operation_text,
  symptoms_text = s.symptoms_text,
  common_causes_text = s.common_causes_text,
  replace_interval_text = s.replace_interval_text,
  warnings_text = s.warnings_text,
  buying_guide_text = s.buying_guide_text,
  faq_text = s.faq_text,
  garage_notes_text = s.garage_notes_text,
  buyer_mistakes_text = s.buyer_mistakes_text,
  vn_usage_notes_text = s.vn_usage_notes_text,
  style_persona_v2 = s.style_persona_v2,
  brand_persona_v3 = s.brand_persona_v3,
  buyer_intents_v4 = s.buyer_intents_v4,
  symptom_keywords_json = s.symptom_keywords_json,
  search_intents_json = s.search_intents_json,
  cross_sell_json = s.cross_sell_json,
  updated_at = SYSDATETIME()
WHEN NOT MATCHED BY TARGET THEN
  INSERT (
    slug, name_vi, name_en, canonical_name, aliases_json, regional_aliases_json,
    summary, body, category_tag, category_name, system_group, vehicle_area,
    seo_priority, seo_tier, tier_class, ai_priority, search_score, diagnosis_weight, is_active,
    function_text, structure_text, operation_text, symptoms_text, common_causes_text,
    replace_interval_text, warnings_text, buying_guide_text, faq_text,
    garage_notes_text, buyer_mistakes_text, vn_usage_notes_text,
    style_persona_v2, brand_persona_v3, buyer_intents_v4, symptom_keywords_json, search_intents_json, cross_sell_json
  )
  VALUES (
    s.slug, s.name_vi, s.name_en, s.canonical_name, s.aliases_json, s.regional_aliases_json,
    s.summary, s.body, s.category_tag, s.category_name, s.system_group, s.vehicle_area,
    s.seo_priority, s.seo_tier, s.tier_class, s.ai_priority, s.search_score, s.diagnosis_weight, s.is_active,
    s.function_text, s.structure_text, s.operation_text, s.symptoms_text, s.common_causes_text,
    s.replace_interval_text, s.warnings_text, s.buying_guide_text, s.faq_text,
    s.garage_notes_text, s.buyer_mistakes_text, s.vn_usage_notes_text,
    s.style_persona_v2, s.brand_persona_v3, s.buyer_intents_v4, s.symptom_keywords_json, s.search_intents_json, s.cross_sell_json
  );
