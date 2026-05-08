-- Migration: Create category_dictionary_queue table
-- Queues unmatched category names for review and dictionary insertion

CREATE TABLE IF NOT EXISTS category_dictionary_queue (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  raw_name VARCHAR(255) NOT NULL COMMENT 'Raw product name that didn\'t match',
  normalized_name VARCHAR(255) NOT NULL COMMENT 'Normalized version for matching',
  sample_part_name VARCHAR(255) DEFAULT NULL COMMENT 'Sample product part name for reference',
  hit_count INT UNSIGNED DEFAULT 1 COMMENT 'Number of times this name appeared',
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  status ENUM('pending', 'reviewed', 'approved', 'rejected') DEFAULT 'pending',
  
  UNIQUE KEY idx_normalized_name (normalized_name),
  INDEX idx_status (status),
  INDEX idx_hit_count (hit_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Queue for unmatched category names';
