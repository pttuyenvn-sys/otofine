-- Seed 20 phụ tùng phổ biến (SQL Server). Idempotent theo slug.

INSERT INTO dbo.part_knowledge (slug, name_vi, name_en, summary, category_tag, sort_order, is_published)
SELECT v.slug, v.name_vi, v.name_en, v.summary, v.category_tag, v.sort_order, v.is_published
FROM (VALUES
  (N'ma-phanh', N'Má phanh', N'Brake pads', N'Miếng ma sát ép lên đĩa phanh để hãm xe; thay khi mòn tới giới hạn hoặc kêu rung.', N'phanh', 10, CAST(1 AS BIT)),
  (N'dia-phanh', N'Đĩa phanh', N'Brake disc', N'Đĩa quay cùng bánh xe, má phanh bám vào để tỏa nhiệt và hãm; cong vênh cần lathe hoặc thay.', N'phanh', 20, CAST(1 AS BIT)),
  (N'loc-gio-dong-co', N'Lọc gió động cơ', N'Engine air filter', N'Lọc bụi không khí vào đường nạp; tắc làm yếu máy, tăng hao xăng/dầu.', N'dong-co', 30, CAST(1 AS BIT)),
  (N'loc-dau', N'Lọc dầu', N'Oil filter', N'Giữ cặn và kim loại trong dầu bôi trơn; thay cùng chu kỳ thay nhớt.', N'dong-co', 40, CAST(1 AS BIT)),
  (N'loc-nhien-lieu', N'Lọc nhiên liệu', N'Fuel filter', N'Lọc gỉ và tạp chất trong xăng/dầu; tắc gây yếu máy, khó nổ.', N'nhien-lieu', 50, CAST(1 AS BIT)),
  (N'bugi', N'Bugi', N'Spark plug', N'Đánh lửa buồng đốt động cơ xăng; mòn làm hụt hơi, tốn nhiên liệu.', N'dong-co', 60, CAST(1 AS BIT)),
  (N'day-curoa-cam', N'Dây curoa cam', N'Timing belt', N'Đồng bộ trục cam/crank; đứt có thể gây va chạm van–piston trên một số động cơ.', N'dong-co', 70, CAST(1 AS BIT)),
  (N'day-curoa-tong', N'Dây curoa tổng', N'Serpentine belt', N'Truyền lực cho máy phát, bơm nước, lạnh; nứt/răng mòn cần thay.', N'dong-co', 80, CAST(1 AS BIT)),
  (N'ac-quy', N'Ắc quy', N'Battery', N'Cung cấp điện khởi động và phụ tải khi máy tắt; yếu gây khó nổ, reset điện tử.', N'dien', 90, CAST(1 AS BIT)),
  (N'giam-xoc', N'Giảm xóc', N'Shock absorber', N'Kiểm soát dao động thân xe; hết dầu/sứt cao su chân giảm xóc làm xe nhún lộn xộn.', N'treo', 100, CAST(1 AS BIT)),
  (N'lop-xe', N'Lốp xe', N'Tire', N'Tiếp xúc mặt đường; mòn đến vạch, nứt sidewall hoặc vá nhiều lần nên thay.', N'banh-xe', 110, CAST(1 AS BIT)),
  (N'bom-nuoc', N'Bơm nước', N'Water pump', N'Tuần hoàn nước làm mát động cơ; rò gốc hoặc ổ bi kêu cần thay.', N'lam-mat', 120, CAST(1 AS BIT)),
  (N'bom-xang-dien', N'Bơm xăng điện', N'Electric fuel pump', N'Đẩy nhiên liệu lên rail/injector; yếu gây hụt ga, chết máy khi tải cao.', N'nhien-lieu', 130, CAST(1 AS BIT)),
  (N'cam-bien-oxy', N'Cảm biến oxy', N'Oxygen sensor', N'Đo dư thừa oxy khí thải để ECU chỉnh phối khí; lỗi làm sáng đèn check engine.', N'dien-tu', 140, CAST(1 AS BIT)),
  (N'bo-thang-tay', N'Bố thắng tay', N'Parking brake shoes', N'Hãm phụ trên tang trống hoặc đĩa sau; mòn làm trôi xe khi đỗ dốc.', N'phanh', 150, CAST(1 AS BIT)),
  (N'heo-phanh', N'Heo phanh', N'Brake caliper', N'Kẹp má phanh vào đĩa; kẹt piston làm kéo phanh một bên, nóng đĩa.', N'phanh', 160, CAST(1 AS BIT)),
  (N'rotin-lai-ngoai', N'Rotin lái ngoài', N'Outer tie rod', N'Nối thước lái vào đỡ bánh; hỏng roăng gây lỏng lái, lệch thước.', N'lai', 170, CAST(1 AS BIT)),
  (N'cang-a', N'Càng A', N'Control arm', N'Liên kết thân xe với đỡ bánh; cao su/răng mòn gâu rung, lệch lái.', N'treo', 180, CAST(1 AS BIT)),
  (N'xy-lanh-phanh-chu', N'Xy lanh phanh chủ', N'Brake master cylinder', N'Biến lực bàn đạp thành áp suất dầu phanh; rò dầu làm phanh mềm.', N'phanh', 190, CAST(1 AS BIT)),
  (N'den-pha', N'Đèn pha', N'Headlamp', N'Chiếu sáng phía trước; ố vàng/vỡ cần thay cụm hoặc bóng theo quy định.', N'dien', 200, CAST(1 AS BIT))
) AS v(slug, name_vi, name_en, summary, category_tag, sort_order, is_published)
WHERE NOT EXISTS (SELECT 1 FROM dbo.part_knowledge k WHERE k.slug = v.slug);
