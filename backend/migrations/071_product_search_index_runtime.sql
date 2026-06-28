-- =====================================================================
-- Migration 071 — product_search_index runtime fields
-- SEARCH-INDEX-RUNTIME-PHASE-02
-- Denormalize fields required for index runtime (no category/fitment JOINs).
-- =====================================================================

-- canonical_slug, search_priority, part_number_norm added via ensureSearchIndexSchema.js
