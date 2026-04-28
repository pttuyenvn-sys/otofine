-- Seed 20 phụ tùng phổ biến (MySQL). Idempotent: INSERT IGNORE theo slug.

INSERT IGNORE INTO part_knowledge (slug, name_vi, name_en, summary, category_tag, sort_order, is_published) VALUES
('ma-phanh', 'Má phanh', 'Brake pads', 'Miếng ma sát ép lên đĩa phanh để hãm xe; thay khi mòn tới giới hạn hoặc kêu rung.', 'phanh', 10, 1),
('dia-phanh', 'Đĩa phanh', 'Brake disc', 'Đĩa quay cùng bánh xe, má phanh bám vào để tỏa nhiệt và hãm; cong vênh cần lathe hoặc thay.', 'phanh', 20, 1),
('loc-gio-dong-co', 'Lọc gió động cơ', 'Engine air filter', 'Lọc bụi không khí vào đường nạp; tắc làm yếu máy, tăng hao xăng/dầu.', 'dong-co', 30, 1),
('loc-dau', 'Lọc dầu', 'Oil filter', 'Giữ cặn và kim loại trong dầu bôi trơn; thay cùng chu kỳ thay nhớt.', 'dong-co', 40, 1),
('loc-nhien-lieu', 'Lọc nhiên liệu', 'Fuel filter', 'Lọc gỉ và tạp chất trong xăng/dầu; tắc gây yếu máy, khó nổ.', 'nhien-lieu', 50, 1),
('bugi', 'Bugi', 'Spark plug', 'Đánh lửa buồng đốt động cơ xăng; mòn làm hụt hơi, tốn nhiên liệu.', 'dong-co', 60, 1),
('day-curoa-cam', 'Dây curoa cam', 'Timing belt', 'Đồng bộ trục cam/crank; đứt có thể gây va chạm van–piston trên một số động cơ.', 'dong-co', 70, 1),
('day-curoa-tong', 'Dây curoa tổng', 'Serpentine belt', 'Truyền lực cho máy phát, bơm nước, lạnh; nứt/răng mòn cần thay.', 'dong-co', 80, 1),
('ac-quy', 'Ắc quy', 'Battery', 'Cung cấp điện khởi động và phụ tải khi máy tắt; yếu gây khó nổ, reset điện tử.', 'dien', 90, 1),
('giam-xoc', 'Giảm xóc', 'Shock absorber', 'Kiểm soát dao động thân xe; hết dầu/sứt cao su chân giảm xóc làm xe nhún lộn xộn.', 'treo', 100, 1),
('lop-xe', 'Lốp xe', 'Tire', 'Tiếp xúc mặt đường; mòn đến vạch, nứt sidewall hoặc vá nhiều lần nên thay.', 'banh-xe', 110, 1),
('bom-nuoc', 'Bơm nước', 'Water pump', 'Tuần hoàn nước làm mát động cơ; rò gốc hoặc ổ bi kêu cần thay.', 'lam-mat', 120, 1),
('bom-xang-dien', 'Bơm xăng điện', 'Electric fuel pump', 'Đẩy nhiên liệu lên rail/injector; yếu gây hụt ga, chết máy khi tải cao.', 'nhien-lieu', 130, 1),
('cam-bien-oxy', 'Cảm biến oxy', 'Oxygen sensor', 'Đo dư thừa oxy khí thải để ECU chỉnh phối khí; lỗi làm sáng đèn check engine.', 'dien-tu', 140, 1),
('bo-thang-tay', 'Bố thắng tay', 'Parking brake shoes', 'Hãm phụ trên tang trống hoặc đĩa sau; mòn làm trôi xe khi đỗ dốc.', 'phanh', 150, 1),
('heo-phanh', 'Heo phanh', 'Brake caliper', 'Kẹp má phanh vào đĩa; kẹt piston làm kéo phanh một bên, nóng đĩa.', 'phanh', 160, 1),
('rotin-lai-ngoai', 'Rotin lái ngoài', 'Outer tie rod', 'Nối thước lái vào đỡ bánh; hỏng roăng gây lỏng lái, lệch thước.', 'lai', 170, 1),
('cang-a', 'Càng A', 'Control arm', 'Liên kết thân xe với đỡ bánh; cao su/răng mòn gâu rung, lệch lái.', 'treo', 180, 1),
('xy-lanh-phanh-chu', 'Xy lanh phanh chủ', 'Brake master cylinder', 'Biến lực bàn đạp thành áp suất dầu phanh; rò dầu làm phanh mềm.', 'phanh', 190, 1),
('den-pha', 'Đèn pha', 'Headlamp', 'Chiếu sáng phía trước; ố vàng/vỡ cần thay cụm hoặc bóng theo quy định.', 'dien', 200, 1);
