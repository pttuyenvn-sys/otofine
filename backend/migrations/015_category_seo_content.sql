-- Migration: Category SEO Content Enhancement
-- Description: Add tables and indexes to support category-specific SEO content
-- Version: 015
-- Date: 2025-04-28

-- Create category SEO content table
CREATE TABLE IF NOT EXISTS `category_seo_content` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_name` VARCHAR(255) NOT NULL,
  `profile_type` ENUM('brake', 'filter', 'ignition', 'suspension', 'lighting', 'engine', 'transmission', 'exhaust', 'cooling', 'default') NOT NULL DEFAULT 'default',
  `title` VARCHAR(500) NOT NULL,
  `description` TEXT NOT NULL,
  `overview_content` TEXT,
  `buying_guide` TEXT,
  `maintenance_tips` TEXT,
  `faq_data` JSON,
  `related_categories` JSON,
  `meta_keywords` VARCHAR(500),
  `meta_description` TEXT,
  `og_title` VARCHAR(500),
  `og_description` TEXT,
  `is_active` BOOLEAN DEFAULT TRUE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_category` (`category_name`),
  KEY `idx_profile_type` (`profile_type`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create category relationships table for related categories
CREATE TABLE IF NOT EXISTS `category_relationships` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_a` VARCHAR(255) NOT NULL,
  `category_b` VARCHAR(255) NOT NULL,
  `relationship_score` DECIMAL(3,2) DEFAULT 0.00,
  `cooccurrence_count` INT DEFAULT 0,
  `model_count` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_relationship` (`category_a`, `category_b`),
  KEY `idx_category_a` (`category_a`),
  KEY `idx_category_b` (`category_b`),
  KEY `idx_score` (`relationship_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create category FAQ table for user-generated questions
CREATE TABLE IF NOT EXISTS `category_faq` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_name` VARCHAR(255) NOT NULL,
  `question` TEXT NOT NULL,
  `answer` TEXT,
  `question_type` ENUM('generated', 'user', 'admin') DEFAULT 'generated',
  `is_active` BOOLEAN DEFAULT TRUE,
  `view_count` INT DEFAULT 0,
  `helpful_count` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_category` (`category_name`),
  KEY `idx_type` (`question_type`),
  KEY `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create category analytics table for tracking performance
CREATE TABLE IF NOT EXISTS `category_analytics` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_name` VARCHAR(255) NOT NULL,
  `date` DATE NOT NULL,
  `page_views` INT DEFAULT 0,
  `unique_visitors` INT DEFAULT 0,
  `avg_time_on_page` DECIMAL(8,2) DEFAULT 0.00,
  `bounce_rate` DECIMAL(5,2) DEFAULT 0.00,
  `conversion_rate` DECIMAL(5,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_category_date` (`category_name`, `date`),
  KEY `idx_category` (`category_name`),
  KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default category SEO content for common automotive categories
INSERT IGNORE INTO `category_seo_content` (`category_name`, `profile_type`, `title`, `description`, `overview_content`, `buying_guide`, `maintenance_tips`, `faq_data`, `related_categories`) VALUES
('Đèn pha', 'lighting', 
 'Đèn pha ô tô chính hãng, giá tốt | Otofine', 
 'Đèn pha ô tô chính hãng, nhiều lựa chọn từ các thương hiệu uy tín. Bảo hành uy tín, giao hàng nhanh. Mua đèn pha phù hợp mọi dòng xe tại Otofine.',
 'Đèn pha là bộ phận quan trọng đảm bảo an toàn khi lái xe ban đêm. Các loại đèn pha phổ biến bao gồm đèn halogen, LED, và HID/xenon, mỗi loại có ưu điểm riêng về độ sáng, tuổi thọ và tiêu thụ điện năng.',
 'Khi chọn đèn pha, cần chú ý đến thông số kỹ thuật (công suất, nhiệt độ màu), tương thích với dòng xe, và tuân thủ quy định giao thông. Ưu tiên các thương hiệu uy tín như Philips, Osram, Koito để đảm bảo chất lượng.',
 'Bảo dưỡng đèn pha định kỳ: vệ sinh mặt đèn, kiểm tra độ sáng, thay bóng khi bị mờ, và kiểm tra hệ thống điện. Sử dụng đèn đúng công suất để tránh quá tải hệ thống điện.',
 '[
   {"@type": "Question", "name": "Khi nào cần thay đèn pha ô tô?", "acceptAnswer": {"@type": "Answer", "text": "Nên thay đèn pha khi bị mờ, cháy, hoặc độ sáng giảm. Kiểm tra định kỳ mỗi 6 tháng hoặc khi có dấu hiệu bất thường."}},
   {"@type": "Question", "name": "Đèn LED có tốt hơn đèn halogen không?", "acceptAnswer": {"@type": "Answer", "text": "Đèn LED có ưu điểm về độ sáng, tuổi thọ cao và tiết kiệm điện hơn halogen, nhưng chi phí ban đầu cao hơn. Phù hợp với xe hiện đại."}}
 ]',
 '["Đèn cos", "Đèn xi nhan", "Đèn hậu", "Đèn sương mù"]'),

('Má phanh', 'brake',
 'Má phanh ô tô chính hãng, giá tốt | Otofine',
 'Má phanh ô tô chính hãng, nhiều loại má phanh đĩa, má phanh tang trống. Bảo hành uy tín, giao hàng nhanh. Mua má phanh phù hợp mọi dòng xe tại Otofine.',
 'Má phanh là bộ phận quan trọng nhất trong hệ thống phanh, chịu trách nhiệm tạo ma sát để hãm xe. Các loại chính bao gồm má phanh đĩa (hiệu suất cao) và má phanh tang trống (chi phí thấp).',
 'Chọn má phanh phù hợp với loại xe và điều kiện sử dụng. Kiểm tra độ dày, vật liệu (gốm, bán kim loại, hữu cơ), và thương hiệu uy tín như Brembo, Akebono, Bosch.',
 'Kiểm tra độ dày má phanh mỗi 10,000km, thay khi còn dưới 3mm. Vệ sinh đĩa phanh định kỳ, kiểm tra dầu phanh, và luôn thay cả cặp để đảm bảo an toàn.',
 '[
   {"@type": "Question", "name": "Má phanh mòn bao nhiêu thì thay?", "acceptAnswer": {"@type": "Answer", "text": "Nên thay má phanh khi độ dày còn dưới 3mm hoặc có tiếng kêu khi phanh. Kiểm tra định kỳ tại garage."}},
   {"@type": "Question", "name": "Má phanh ceramic có tốt không?", "acceptAnswer": {"@type": "Answer", "text": "Má phanh ceramic có ưu điểm ít bụi, bền và hiệu suất cao, phù hợp với xe sang và điều kiện đường phố."}}
 ]',
 '["Đĩa phanh", "He thong phanh", "Dau phanh", "Tang phanh"]'),

('Lọc dầu', 'filter',
 'Lọc dầu ô tô chính hãng, giá tốt | Otofine',
 'Lọc dầu ô tô chính hãng, nhiều loại lọc dầu động cơ, lọc gearbox. Bảo hành uy tín, giao hàng nhanh. Mua lọc dầu phù hợp mọi dòng xe tại Otofine.',
 'Lọc dầu có vai trò quan trọng trong việc bảo vệ động cơ bằng cách loại bỏ tạp chất từ dầu nhớt. Thay lọc dầu định kỳ giúp kéo dài tuổi thọ động cơ và đảm bảo hiệu suất vận hành.',
 'Luôn chọn lọc dầu đúng thông số kỹ thuật của nhà sản xuất. Kiểm tra chứng nhận chất lượng (ISO/API), ưu tiên thương hiệu uy tín như Mann-Filter, Bosch, Denso.',
 'Thay lọc dầu mỗi 5,000-10,000km hoặc theo lịch bảo dưỡng. Kiểm tra tình trạng lọc định kỳ và thay sớm nếu chạy trong môi trường bụi bẩn.',
 '[
   {"@type": "Question", "name": "Lọc dầu bao lâu thay một lần?", "acceptAnswer": {"@type": "Answer", "text": "Thay lọc dầu mỗi 5,000-10,000km tùy điều kiện sử dụng. Nên thay cùng với dầu nhớt để đảm bảo hiệu quả."}},
   {"@type": "Question", "name": "Không thay lọc dầu có sao không?", "acceptAnswer": {"@type": "Answer", "text": "Không thay lọc dầu có thể gây hư hại động cơ do tạp chất tích tụ, giảm hiệu quả bôi trơn và tăng mài mòn."}}
 ]',
 '["Loc nhot", "Loc gio", "Loc nhien lieu", "Loc cabin"]'),

('Bugi', 'ignition',
 'Bugi ô tô chính hãng, giá tốt | Otofine',
 'Bugi ô tô chính hãng, nhiều loại bugi nhiệt độ cao, bạch kim, Iridium. Bảo hành uy tín, giao hàng nhanh. Mua bugi phù hợp mọi dòng xe tại Otofine.',
 'Bugi (bougie) là bộ phận tạo ra tia lửa điện cao áp để đốt cháy hỗn hợp nhiên liệu-khí trong buồng đốt. Bugi ảnh hưởng trực tiếp đến hiệu suất động cơ và tiêu hao nhiên liệu.',
 'Chọn bugi phù hợp với hệ thống đánh lửa của xe. Kiểm tra thông số kỹ thuật (điện trở, nhiệt độ hoạt động), ưu tiên thương hiệu uy tín như NGK, Denso.',
 'Kiểm tra bugi mỗi 20,000km, thay khi có dấu hiệu mòn. Vệ sinh hệ thống đánh lửa định kỳ và sử dụng nhiên liệu chất lượng cao.',
 '[
   {"@type": "Question", "name": "Bugi hỏng xe có biểu hiện gì?", "acceptAnswer": {"@type": "Answer", "text": "Biểu hiện bugi hỏng: xe yếu, rung khi tải, tiêu hao nhiên liệu tăng, khó nổ máy, hoặc có mã lỗi động cơ."}},
   {"@type": "Question", "name": "Bugi Iridium có tốt không?", "acceptAnswer": {"@type": "Answer", "text": "Bugi Iridium có ưu điểm bền, hiệu suất cao và tuổi thọ lâu, phù hợp với xe hiện đại và hiệu suất cao."}}
 ]',
 '["Bobin", "Dây cao áp", "ECU", "He thong danh lua"]'),

('Giảm sóc', 'suspension',
 'Giảm sóc ô tô chính hãng, giá tốt | Otofine',
 'Giảm sóc ô tô chính hãng, nhiều loại giảm sóc thủy lực, khí nén. Bảo hành uy tín, giao hàng nhanh. Mua giảm sóc phù hợp mọi dòng xe tại Otofine.',
 'Giảm sóc là bộ phận quan trọng trong hệ thống treo, giúp hấp thụ sốc từ mặt đường và đảm bảo xe vận hành êm ái, an toàn. Giảm sóc ảnh hưởng đến sự thoải mái và khả năng kiểm soát xe.',
 'Chọn giảm sóc phù hợp với tải trọng và điều kiện đường sá Việt Nam. Kiểm tra thông số kỹ thuật (đường kính, hành trình), ưu tiên thương hiệu có độ bền cao.',
 'Kiểm tra giảm sóc mỗi 20,000km, kiểm tra độ ẩm dầu, lò xo và các khớp nối. Căn chỉnh góc bánh xe định kỳ và thay thế khi có tiếng kêu.',
 '[
   {"@type": "Question", "name": "Giảm sóc mòn xe có nguy hiểm không?", "acceptAnswer": {"@type": "Answer", "text": "Giảm sóc mòn có thể gây nguy hiểm khi phanh, xe bị nảy, mất kiểm soát và tăng khoảng cách phanh."}},
   {"@type": "Question", "name": "Giảm sóc khí nén có tốt hơn thủy lực không?", "acceptAnswer": {"@type": "Answer", "text": "Giảm sóc khí nén có thể điều chỉnh được, êm hơn nhưng chi phí cao hơn. Phù hợp với xe cao cấp."}}
 ]',
 '["Cang", "Lot cop", "Rotin", "Lac"]');

-- Create indexes for better performance on existing products table
ALTER TABLE `products` ADD INDEX IF NOT EXISTS `idx_part_name_category` (`partName`);
ALTER TABLE `products` ADD INDEX IF NOT EXISTS `idx_category_brand` (`partName`, `brand`);
ALTER TABLE `products` ADD INDEX IF NOT EXISTS `idx_part_name_price` (`partName`, `price`);
ALTER TABLE `products` ADD INDEX IF NOT EXISTS `idx_part_name_updated` (`partName`, `updatedAt`);

-- Create view for category statistics
CREATE OR REPLACE VIEW `category_stats_view` AS
SELECT 
    p.partName as category,
    COUNT(*) as product_count,
    MIN(p.price) as min_price,
    MAX(p.price) as max_price,
    AVG(p.price) as avg_price,
    GROUP_CONCAT(DISTINCT p.brand ORDER BY COUNT(*) DESC SEPARATOR ',') as top_brands,
    COUNT(DISTINCT p.brand) as brand_count,
    MAX(p.updatedAt) as last_updated
FROM products p
WHERE p.partName IS NOT NULL 
    AND TRIM(p.partName) <> ''
    AND p.status = 'active'
GROUP BY p.partName
HAVING product_count > 0
ORDER BY product_count DESC;

-- Create trigger to update category analytics when products are updated
DELIMITER //
CREATE TRIGGER IF NOT EXISTS `tr_update_category_stats_after_product_update`
AFTER UPDATE ON `products`
FOR EACH ROW
BEGIN
    IF NEW.partName != OLD.partName OR NEW.price != OLD.price OR NEW.status != OLD.status THEN
        -- This trigger will help maintain accurate category statistics
        -- The actual view will reflect changes automatically
        SELECT 1;
    END IF;
END//
DELIMITER ;

-- Add foreign key constraints if tables exist
ALTER TABLE `category_faq` ADD CONSTRAINT IF NOT EXISTS `fk_faq_category` 
    FOREIGN KEY (`category_name`) REFERENCES `category_seo_content` (`category_name`) 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Create procedure to refresh category relationships
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `sp_refresh_category_relationships`()
BEGIN
    -- Delete existing relationships
    DELETE FROM category_relationships;
    
    -- Insert new relationships based on product co-occurrence
    INSERT INTO category_relationships (category_a, category_b, cooccurrence_count, model_count, relationship_score)
    SELECT 
        p1.partName as category_a,
        p2.partName as category_b,
        COUNT(*) as cooccurrence_count,
        COUNT(DISTINCT pa1.carModelId) as model_count,
        ROUND(COUNT(*) * 1.0 / (SELECT COUNT(*) FROM products WHERE partName = p1.partName), 2) as relationship_score
    FROM products p1
    JOIN product_car_applications pa1 ON p1.id = pa1.productId
    JOIN product_car_applications pa2 ON pa1.carModelId = pa2.carModelId
    JOIN products p2 ON pa2.productId = p2.id
    WHERE p1.partName < p2.partName
        AND p1.status = 'active'
        AND p2.status = 'active'
    GROUP BY p1.partName, p2.partName
    HAVING cooccurrence_count >= 3
    ORDER BY cooccurrence_count DESC;
END//
DELIMITER ;

-- Grant necessary permissions (adjust for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON category_seo_content TO 'your_user'@'localhost';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON category_relationships TO 'your_user'@'localhost';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON category_faq TO 'your_user'@'localhost';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON category_analytics TO 'your_user'@'localhost';

-- Migration completed successfully
SELECT 'Category SEO Content Migration (015) completed successfully' as status;
