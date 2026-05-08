-- Migration: Create category_dictionary table
-- This table stores synonym mappings and canonical name rules
-- Allows dynamic management without code changes

CREATE TABLE IF NOT EXISTS category_dictionary (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_keyword VARCHAR(255) NOT NULL COMMENT 'Keyword to match (normalized, no accents)',
  canonical_name VARCHAR(255) NOT NULL COMMENT 'Proper Vietnamese display name',
  canonical_slug VARCHAR(255) NOT NULL COMMENT 'URL slug for canonical category',
  priority INT UNSIGNED DEFAULT 0 COMMENT 'Priority for matching (higher = checked first)',
  is_active TINYINT(1) DEFAULT 1 COMMENT 'Whether this rule is active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_match_keyword_slug (match_keyword, canonical_slug),
  INDEX idx_priority (priority DESC, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Category synonym dictionary for canonical mapping';

-- Insert initial synonym mappings
INSERT INTO category_dictionary (match_keyword, canonical_name, canonical_slug, priority, is_active) VALUES
('giam xoc', 'Giảm xóc', 'giam-xoc-o-to', 10, 1),
('phuoc nhun', 'Giảm xóc', 'giam-xoc-o-to', 10, 1),
('ma phanh', 'Má phanh', 'ma-phanh-o-to', 10, 1),
('bo thang', 'Má phanh', 'ma-phanh-o-to', 10, 1),
('chan may', 'Chân máy', 'chan-may-o-to', 10, 1),
('mobin', 'Bobin đánh lửa', 'bobin-danh-lua-o-to', 10, 1),
('bobin danh lua', 'Bobin đánh lửa', 'bobin-danh-lua-o-to', 10, 1);
