-- Fix canonical_slug: replace spaces with dashes
-- This fixes URLs like /giam%20xoc-o-to to /giam-xoc-o-to

UPDATE product_categories
SET canonical_slug = REPLACE(canonical_slug, ' ', '-')
WHERE canonical_slug LIKE '% %';
