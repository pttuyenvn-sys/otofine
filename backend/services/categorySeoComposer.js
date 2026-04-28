/**
 * Category SEO Content Engine - Vietnamese automotive parts category-specific content
 * Generates rich, category-focused SEO content for automotive part categories
 */

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function foldVi(raw) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** @typedef {'brake'|'filter'|'ignition'|'suspension'|'lighting'|'engine'|'transmission'|'exhaust'|'cooling'|'default'} CategoryProfile */

/**
 * Detect category profile based on category name
 * @param {string} categoryName
 * @returns {CategoryProfile}
 */
function detectCategoryProfile(categoryName) {
  const hay = foldVi(categoryName);
  
  if (/\b(he thong phanh|tang phanh|caliper|dong phanh|pho thang|phanh dia|phanh tang|pad phanh|phanh|ma phanh|gu phanh)\b/.test(hay)) {
    return "brake";
  }
  
  if (/\b(loc gio|loc nhot|loc nh|loc dau|loc dong co|loc cabin|loc khi|nen khi|loc xang|loc nhien lieu)\b/.test(hay) || /\bbo loc\b/.test(hay)) {
    return "filter";
  }
  
  if (/\b(mobin|bougie|chia lua|cuc day cao|dai cao ap|cao ap|ecu dieu khien|kim phun|bugi|bobin|he thong danh lua)\b/.test(hay)) {
    return "ignition";
  }
  
  if (/\b(giam soc|cang|pho|lac|rotin|cang a|cang i|dam nang|cang ke|lac cam|lac la|cang xe|he thung treo|lot cop|giam xoc)\b/.test(hay)) {
    return "suspension";
  }
  
  if (/\b(den|pha|cos|xi nhan|phanh|bi|led|halogen|chiếu|sáng|đèn)\b/.test(hay)) {
    return "lighting";
  }
  
  if (/\b(dong co|may|piston|xi lanh|buong dot|ket|bu gi|cam|turboc|nhot|nhiet|dong co)\b/.test(hay)) {
    return "engine";
  }
  
  if (/\b(hop so|ly hop|truyen dong|cai truyen|so tu dong|so tay|bien tan)\b/.test(hay)) {
    return "transmission";
  }
  
  if (/\b(xa|phe|ong xả|đuôi xe|bộ xả|silencer|muffler)\b/.test(hay)) {
    return "exhaust";
  }
  
  if (/\b(ke t|lam nhiet|quat nhiet|nuoc lam nhiet|bang nhiet|thong gió|hoi nhiet)\b/.test(hay)) {
    return "cooling";
  }
  
  return "default";
}

/**
 * Generate category-specific FAQ content
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @returns {string[]}
 */
function generateCategoryFAQ(profile, categoryName) {
  const faqTemplates = {
    brake: [
      `Khi nào cần thay ${categoryName.toLowerCase()}?`,
      `${categoryName.toLowerCase()} có những loại nào?`,
      `Cách nhận biết ${categoryName.toLowerCase()} đã mòn?`,
      `Giá thay ${categoryName.toLowerCase()} bao nhiêu?`,
      `${categoryName.toLowerCase()} hãng nào tốt nhất?`
    ],
    filter: [
      `Tần suất thay ${categoryName.toLowerCase()} là bao lâu?`,
      `${categoryName.toLowerCase()} không đúng loại có sao không?`,
      `Dấu hiệu ${categoryName.toLowerCase()} bị tắc?`,
      `Cách chọn ${categoryName.toLowerCase()} phù hợp?`,
      `${categoryName.toLowerCase()} chính hãng và loại nào khác nhau?`
    ],
    ignition: [
      `Dấu hiệu ${categoryName.toLowerCase()} hỏng?`,
      `${categoryName.toLowerCase()} loại nào tốt cho xe Việt Nam?`,
      `Chi phí thay ${categoryName.toLowerCase()}?`,
      `${categoryName.toLowerCase()} ảnh hưởng đến tiêu hao nhiên liệu như thế nào?`,
      `Cách bảo dưỡng ${categoryName.toLowerCase()} đúng cách?`
    ],
    suspension: [
      `${categoryName.toLowerCase()} mòn gây nguy hiểm gì?`,
      `Khi nào cần kiểm tra ${categoryName.toLowerCase()}?`,
      `Tiếng kêu từ ${categoryName.toLowerCase()} báo hiệu điều gì?`,
      `Chi phí thay thế ${categoryName.toLowerCase()}?`,
      `${categoryName.toLowerCase()} nào phù hợp đường phố Việt Nam?`
    ],
    lighting: [
      `Nên nâng cấp ${categoryName.toLowerCase()} LED hay không?`,
      `${categoryName.toLowerCase()} nào tiết kiệm điện nhất?`,
      `Cách chọn ${categoryName.toLowerCase()} phù hợp luật giao thông?`,
      `${categoryName.toLowerCase()} bị ẩm mốc phải làm gì?`,
      `Chi phí thay ${categoryName.toLowerCase()}?`
    ],
    engine: [
      `${categoryName.toLowerCase()} hỏng có những dấu hiệu nào?`,
      `Bảo dưỡng ${categoryName.toLowerCase()} định kỳ như thế nào?`,
      `${categoryName.toLowerCase()} nào bền cho xe cũ?`,
      `Chi phí sửa ${categoryName.toLowerCase()}?`,
      `Cách kéo dài tuổi thọ ${categoryName.toLowerCase()}?`
    ],
    transmission: [
      `Dấu hiệu ${categoryName.toLowerCase()} cần bảo dưỡng?`,
      `Nên thay nhớt ${categoryName.toLowerCase()} khi nào?`,
      `${categoryName.toLowerCase()} rung là do đâu?`,
      `Chi phí sửa ${categoryName.toLowerCase()}?`,
      `Cách lái xe để bảo vệ ${categoryName.toLowerCase()}?`
    ],
    exhaust: [
      `${categoryName.toLowerCase()} bị ồn phải làm gì?`,
      `Nên thay ${categoryName.toLowerCase()} loại nào?`,
      `${categoryName.toLowerCase()} ảnh hưởng đến công suất xe như thế nào?`,
      `Chi phí thay ${categoryName.toLowerCase()}?`,
      `${categoryName.toLowerCase()} inox và loại thường khác nhau gì?`
    ],
    cooling: [
      `Nước làm mát bao lâu thay một lần?`,
      `Dấu hiệu hệ thống làm mát có vấn đề?`,
      `Quạt làm mát không hoạt động phải làm gì?`,
      `Chi phí bảo dưỡng hệ thống làm mát?`,
      `Cách chọn nước làm mát phù hợp?`
    ],
    default: [
      `${categoryName.toLowerCase()} có vai trò gì?`,
      `Khi nào cần thay ${categoryName.toLowerCase()}?`,
      `Cách chọn ${categoryName.toLowerCase()} tốt?`,
      `Chi phí thay ${categoryName.toLowerCase()}?`,
      `${categoryName.toLowerCase()} hãng nào uy tín?`
    ]
  };
  
  return faqTemplates[profile] || faqTemplates.default;
}

/**
 * Generate category-specific buying guide content
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @returns {string}
 */
function generateBuyingGuide(profile, categoryName) {
  const guides = {
    brake: `Hướng dẫn chọn ${categoryName}: Kiểm tra độ dày còn lại, chọn loại phù hợp với điều kiện sử dụng (đường phố/đường trường), ưu tiên sản phẩm có chứng nhận chất lượng, và luôn thay cả cặp để đảm bảo an toàn. Lưu ý chọn má phanh phù hợp với vật liệu đĩa phanh (gốm, bán kim loại, hữu cơ).`,
    
    filter: `Hướng dẫn chọn ${categoryName}: Luôn chọn đúng loại lọc theo thông số kỹ thuật của nhà sản xuất, kiểm tra chứng nhận chất lượng (ISO/API), ưu tiên thương hiệu uy tín, và thay đúng lịch bảo dưỡng. Lọc chất lượng kém có thể gây hư hại nghiêm trọng cho động cơ.`,
    
    ignition: `Hướng dẫn chọn ${categoryName}: Chọn sản phẩm phù hợp với hệ thống điện của xe, ưu tiên hàng chính hãng hoặc thương hiệu uy tín (NGK, Denso), kiểm tra thông số kỹ thuật (điện trở, nhiệt độ hoạt động), và thay cả bộ để đảm bảo hiệu suất tối ưu.`,
    
    suspension: `Hướng dẫn chọn ${categoryName}: Chọn sản phẩm phù hợp với tải trọng và điều kiện đường sá Việt Nam, ưu tiên thương hiệu có độ bền cao, kiểm tra thông số kỹ thuật (đường kính, hành trình), và nên thay cả cụm treo để đảm bảo sự đồng bộ.`,
    
    lighting: `Hướng dẫn chọn ${categoryName}: Chọn sản phẩm có công suất phù hợp, đảm bảo tuân thủ quy định giao thông, ưu tiên LED để tiết kiệm điện và tuổi thọ cao, kiểm tra độ sáng và màu ánh sáng, và chọn thương hiệu có bảo hành tốt.`,
    
    engine: `Hướng dẫn chọn ${categoryName}: Luôn chọn sản phẩm có thông số kỹ thuật chính xác, ưu tiên hàng chính hãng, kiểm tra nguồn gốc xuất xứ, đảm bảo có bảo hành, và chỉ mua tại các cửa hàng uy tín để tránh hàng giả hàng nhái.`,
    
    transmission: `Hướng dẫn chọn ${categoryName}: Chọn sản phẩm tương thích với hộp số của xe, ưu tiên nhớt có chỉ số viscosity phù hợp, kiểm tra chứng nhận API/DEXRON, và tuân thủ lịch thay nhớt định kỳ của nhà sản xuất.`,
    
    exhaust: `Hướng dẫn chọn ${categoryName}: Chọn ống xả có đường kính phù hợp, ưu tiên inox 304 để chống ăn mòn, kiểm tra độ ồn theo quy định, và chọn thiết kế phù hợp với dòng xe để đảm bảo hiệu suất.`,
    
    cooling: `Hướng dẫn chọn ${categoryName}: Chọn nước làm mát có tỷ lệ pha đúng, ưu tiên sản phẩm có điểm sôi cao, kiểm tra tính chống ăn mòn, và tuân thủ lịch thay định kỳ 2-3 năm hoặc 40,000-60,000km.`,
    
    default: `Hướng dẫn chọn ${categoryName}: Luôn kiểm tra thông số kỹ thuật của nhà sản xuất, ưu tiên các thương hiệu uy tín, đảm bảo sản phẩm có bảo hành, và chỉ mua tại các cửa hàng chính hãng để đảm bảo chất lượng.`
  };
  
  return guides[profile] || guides.default;
}

/**
 * Generate category-specific technical information
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @returns {string}
 */
function generateTechnicalInfo(profile, categoryName) {
  const technical = {
    brake: `${categoryName} là bộ phận quan trọng nhất trong hệ thống phanh, chịu trách nhiệm tạo ma sát để hãm xe. Các loại phổ biến bao gồm má phanh đĩa (hiệu suất cao, tản nhiệt tốt) và má phanh tang trống (chi phí thấp, bền). Vật liệu má phanh gồm: hữu cơ (êm, ít bụi), bán kim loại (cân bằng), gốm (hiệu suất cao, ít mòn), và kim loại (chịu nhiệt tốt).`,
    
    filter: `${categoryName} có vai trò loại bỏ tạp chất từ các dòng lưu chất (dầu, nhiên liệu, không khí). Các loại chính bao gồm lọc dầu (bảo vệ động cơ), lọc nhiên liệu (đảm bảo quá trình đốt cháy), lọc không khí (lọc bụi vào động cơ), và lọc cabin (lọc không khí trong cabin). Hiệu suất lọc được đo bằng micron (µm) - càng nhỏ càng lọc tốt hơn.`,
    
    ignition: `${categoryName} tạo ra tia lửa điện cao áp để đốt cháy hỗn hợp nhiên liệu-khí trong buồng đốt. Hệ thống bao gồm bugi (tia lửa), bobin (tăng áp), dây cao áp (truyền điện), và ECU (điều khiển). Bugi có các loại: tiêu chuẩn, bạch kim (bền), và Iridium (hiệu suất cao). Khoảng cách bugi thường 0.6-1.2mm.`,
    
    suspension: `${categoryName} giúp xe vận hành êm ái và an toàn bằng cách hấp thụ sốc từ mặt đường. Hệ thống bao gồm giảm sóc (hấp thụ sốc), lò xo (hỗ trợ tải trọng), và các khớp nối (chuyển động). Các loại giảm sóc: thủy lực (đơn giản), khí nén (điều chỉnh), và điện từ (cao cấp). Lò xo có thể là lò xo lá (xe tải) hoặc lò xo xoắn (xe con).`,
    
    lighting: `${categoryName} đảm bảo an toàn và khả năng hiển thị khi lái xe. Các loại đèn chính: đèn pha (chiếu xa), đèn cos (chiếu gần), đèn xi nhan (báo rẽ), và đèn phanh (báo dừng). Công nghệ bao gồm halogen (truyền thống), LED (tiết kiệm điện), HID/xenon (sáng mạnh), và laser (công nghệ mới). Độ sáng đo bằng lumen (lm).`,
    
    engine: `${categoryName} là trái tim của xe, chuyển đổi năng lượng hóa học thành cơ năng. Các thành phần chính: xi lanh (buồng đốt), piston (chuyển động), trục khuỷu (chuyển động quay), và van (điều khiển dòng khí). Động cơ có thể là xăng (đốt cháy bằng bugi) hoặc diesel (nén tự bốc cháy). Công suất đo bằng mã lực (HP) hoặc kW.`,
    
    transmission: `${categoryName} truyền công suất từ động cơ đến bánh xe. Các loại chính: hộp số tay (chủ động), hộp số tự động (tiện lợi), và CVT (truyền động vô cấp). Hộp số có các cấp số khác nhau để tối ưu hóa vòng tua động cơ. Nhớt hộp số giúp bôi trơn và làm mát các bộ phận bên trong.`,
    
    exhaust: `${categoryName} dẫn khí thải từ động cơ ra ngoài và giảm tiếng ồn. Hệ thống bao gồm: đầu thu (tập trung khí thải), bộ giảm thanh (tiếng ồn), và ống xả (dẫn khí ra ngoài). Vật liệu phổ biến: thép không gỉ (inox) chống ăn mòn, và thép thường (chi phí thấp). Đường kính ống xả ảnh hưởng đến hiệu suất động cơ.`,
    
    cooling: `${categoryName} duy trì nhiệt độ hoạt động tối ưu cho động cơ. Hệ thống bao gồm: két nước (tản nhiệt), quạt (làm mát), bơm nước (tuần hoàn), và điều nhiệt (điều khiển). Nước làm mát thường là hỗn hợp nước và chất chống đông (coolant) với tỷ lệ 50:50. Nhiệt độ hoạt động lý tưởng khoảng 90-105°C.`,
    
    default: `${categoryName} là một bộ phận quan trọng trong hệ thống ô tô, đóng vai trò đảm bảo xe vận hành an toàn và hiệu quả. Việc lựa chọn và bảo dưỡng đúng cách sẽ giúp kéo dài tuổi thọ của bộ phận và toàn bộ hệ thống xe.`
  };
  
  return technical[profile] || technical.default;
}

/**
 * Generate category-specific maintenance tips
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @returns {string}
 */
function generateMaintenanceTips(profile, categoryName) {
  const tips = {
    brake: `Bảo dưỡng ${categoryName}: Kiểm tra độ dày má phanh mỗi 10,000km, thay khi còn dưới 3mm, vệ sinh đĩa phanh định kỳ, kiểm tra dầu phanh và bổ sung khi cần, và luôn thay cả cặp má phanh để đảm bảo cân bằng. Lắng nghe tiếng kêu bất thường và kiểm tra ngay.`,
    
    filter: `Bảo dưỡng ${categoryName}: Thay lọc dầu mỗi 5,000-10,000km, lọc không khí mỗi 15,000-20,000km, lọc nhiên liệu mỗi 30,000-40,000km. Kiểm tra tình trạng lọc định kỳ và thay sớm nếu chạy trong môi trường bụi bẩn. Luôn sử dụng lọc đúng thông số kỹ thuật.`,
    
    ignition: `Bảo dưỡng ${categoryName}: Kiểm tra bugi mỗi 20,000km, thay khi có dấu hiệu mòn, kiểm tra dây cao áp và bobin, vệ sinh hệ thống đánh lửa định kỳ, và sử dụng nhiên liệu chất lượng cao để tránh cặn bẩn. Quét mã lỗi khi có triệu chứng bất thường.`,
    
    suspension: `Bảo dưỡng ${categoryName}: Kiểm tra giảm sóc mỗi 20,000km, kiểm tra độ ẩm của dầu giảm sóc, kiểm tra lò xo và các khớp nối, căn chỉnh góc bánh xe (alignment) định kỳ, và thay thế khi có tiếng kêu hoặc xe bị nghiêng.`,
    
    lighting: `Bảo dưỡng ${categoryName}: Vệ sinh đèn định kỳ, kiểm tra độ sáng và màu ánh sáng, thay bóng khi bị mờ hoặc cháy, kiểm tra hệ thống điện và chấu tiếp xúc, và sử dụng bóng đúng công suất để tránh quá tải.`,
    
    engine: `Bảo dưỡng ${categoryName}: Thay dầu định kỳ theo lịch của nhà sản xuất, kiểm tra mực dầu và chất lượng dầu, vệ sinh hệ thống thông gió, kiểm tra các bộ phận chuyển động, và sử dụng nhiên liệu chất lượng cao. Lắng nghe tiếng động cơ bất thường.`,
    
    transmission: `Bảo dưỡng ${categoryName}: Thay nhớt hộp số định kỳ, kiểm tra mực nhớt và chất lượng, kiểm tra các rò rỉ, và tuân thủ lịch bảo dưỡng của nhà sản xuất. Lái xe nhẹ nhàng để giảm tải cho hộp số.`,
    
    exhaust: `Bảo dưỡng ${categoryName}: Kiểm tra hệ thống xả định kỳ, vệ sinh bộ giảm thanh, kiểm tra các rò rỉ khí thải, và thay thế khi có tiếng ồn bất thường hoặc hiệu suất giảm. Kiểm tra cảm biến O2 định kỳ.`,
    
    cooling: `Bảo dưỡng ${categoryName}: Kiểm tra mực nước làm mát định kỳ, thay nước làm mát mỗi 2-3 năm, kiểm tra tình trạng két nước và quạt, vệ sinh hệ thống làm mát, và kiểm tra các rò rỉ. Theo dõi nhiệt độ hoạt động của động cơ.`,
    
    default: `Bảo dưỡng ${categoryName}: Tuân thủ lịch bảo dưỡng định kỳ của nhà sản xuất, kiểm tra tình trạng hoạt động thường xuyên, sử dụng phụ tùng chính hãng hoặc uy tín, và đến các garage chuyên nghiệp khi cần thay thế hoặc sửa chữa.`
  };
  
  return tips[profile] || tips.default;
}

/**
 * Main function to generate comprehensive category SEO content
 * @param {Object} params
 * @param {string} params.categoryName - Category name
 * @param {Array} params.products - Products in this category
 * @param {Object} params.filters - Current filters
 * @param {number} params.productCount - Number of products
 * @param {Object} params.priceRange - Min and max prices
 * @returns {Object} SEO content object
 */
export function generateCategorySeoContent({
  categoryName,
  products = [],
  filters = {},
  productCount = 0,
  priceRange = {}
}) {
  const profile = detectCategoryProfile(categoryName);
  
  // Extract brands from products
  const brands = [...new Set(products.map(p => p.brand || p.subtitleLine1).filter(Boolean))];
  const popularBrands = brands.slice(0, 5);
  
  // Generate price range text
  const priceText = priceRange.min && priceRange.max 
    ? `giá từ ${formatPrice(priceRange.min)} đến ${formatPrice(priceRange.max)}`
    : productCount > 0 
      ? `nhiều mức giá khác nhau` 
      : `đang cập nhật`;
  
  // Generate title
  const title = `${categoryName} ô tô chính hãng, giá tốt | Otofine`;
  
  // Generate description
  const description = `${categoryName} ô tô chính hãng, ${productCount} sản phẩm ${priceText}. Bảo hành uy tín, giao hàng nhanh. Mua ${categoryName.toLowerCase()} phù hợp mọi dòng xe tại Otofine.`;
  
  // Generate content sections
  const sections = [
    {
      heading: `Tổng quan về ${categoryName} ô tô`,
      content: generateTechnicalInfo(profile, categoryName)
    },
    {
      heading: `Hướng dẫn chọn mua ${categoryName}`,
      content: generateBuyingGuide(profile, categoryName)
    },
    {
      heading: `Bảo dưỡng ${categoryName} đúng cách`,
      content: generateMaintenanceTips(profile, categoryName)
    }
  ];
  
  // Add brands section if available
  if (popularBrands.length > 0) {
    sections.push({
      heading: "Thương hiệu ${categoryName} phổ biến",
      content: `Các thương hiệu ${categoryName.toLowerCase()} uy tín: ${popularBrands.join(", ")}. Nên ưu tiên các sản phẩm có chứng nhận chất lượng và bảo hành rõ ràng.`
    });
  }
  
  // Generate FAQ
  const faqItems = generateCategoryFAQ(profile, categoryName).map((question, index) => ({
    "@type": "Question",
    name: question,
    acceptAnswer: {
      "@type": "Answer",
      text: generateFAQAnswer(profile, categoryName, index)
    }
  }));
  
  // Generate related categories
  const relatedCategories = generateRelatedCategories(profile, categoryName);
  
  return {
    title,
    description,
    sections,
    faq: faqItems,
    relatedCategories,
    metadata: {
      categoryName,
      profile,
      productCount,
      popularBrands,
      priceRange
    }
  };
}

/**
 * Format price in VND
 * @param {number} price
 * @returns {string}
 */
function formatPrice(price) {
  if (!Number.isFinite(price)) return "0đ";
  return `${new Intl.NumberFormat("vi-VN").format(price)}đ`;
}

/**
 * Generate FAQ answer based on profile and question index
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @param {number} index
 * @returns {string}
 */
function generateFAQAnswer(profile, categoryName, index) {
  const answers = {
    brake: [
      "Nên thay má phanh khi độ dày còn dưới 3mm, có tiếng kêu khi phanh, xe rung khi hãm, hoặc khoảng cách phanh tăng. Kiểm tra định kỳ mỗi 10,000km.",
      "Các loại chính: má phanh đĩa (hiệu suất cao), má phanh tang trống (chi phí thấp). Vật liệu: hữu cơ, bán kim loại, gốm, kim loại. Mỗi loại có ưu điểm riêng.",
      "Dấu hiệu: tiếng kêu (ken ken), rung khi phanh, xe lệch khi hãm, mùi khét, hoặc đèn báo phanh sáng. Kiểm tra ngay tại garage.",
      "Chi phí thay má phanh: 300,000-2,000,000đ tùy loại xe và chất lượng. Má phanh ceramic cao cấp hơn má phanh hữu cơ.",
      "Thương hiệu uy tín: Brembo, Akebono, Bosch, TRW, Bendix. Nên chọn phù hợp với thông số kỹ thuật của xe."
    ],
    filter: [
      "Lọc dầu: 5,000-10,000km. Lọc không khí: 15,000-20,000km. Lọc nhiên liệu: 30,000-40,000km. Thay sớm hơn nếu chạy trong môi trường bụi bẩn.",
      "Các loại: lọc dầu, lọc không khí, lọc nhiên liệu, lọc cabin. Mỗi loại có vai trò khác nhau trong việc bảo vệ hệ thống xe.",
      "Dấu hiệu: động cơ yếu, tăng tốc kém, tiêu hao nhiên liệu tăng, đèn báo động cơ sáng, hoặc tiếng động cơ lạ.",
      "Chọn đúng thông số kỹ thuật, thương hiệu uy tín (Bosch, Mann-Filter, Denso), kiểm tra chứng nhận chất lượng ISO/API.",
      "Lọc chính hãng đảm bảo tương thích hoàn hảo, trong khi lọc aftermarket có thể đa dạng hơn về giá và chất lượng."
    ],
    default: [
      `Kiểm tra định kỳ theo lịch bảo dưỡng của nhà sản xuất, thường là 10,000-20,000km tùy loại ${categoryName.toLowerCase()}.`,
      `${categoryName} có nhiều loại khác nhau tùy theo ứng dụng và thông số kỹ thuật của từng dòng xe.`,
      `Dấu hiệu cần thay bao gồm hiệu suất giảm, tiếng kêu bất thường, hoặc đèn báo cảnh báo sáng.`,
      `Chi phí thay thế ${categoryName.toLowerCase()} phụ thuộc vào dòng xe, thương hiệu và chất lượng sản phẩm.`,
      `Nên chọn các thương hiệu uy tín có bảo hành rõ ràng và mua tại các cửa hàng chính hãng.`
    ]
  };
  
  const profileAnswers = answers[profile] || answers.default;
  return profileAnswers[index] || profileAnswers[0];
}

/**
 * Generate related categories based on profile
 * @param {CategoryProfile} profile
 * @param {string} categoryName
 * @returns {Array}
 */
function generateRelatedCategories(profile, categoryName) {
  const relatedMap = {
    brake: ["Đĩa phanh", "He thong phanh", "Dau phanh", "Tang phanh"],
    filter: ["Loc nhot", "Loc gio", "Loc nhien lieu", "Loc cabin"],
    ignition: ["Bugi", "Bobin", "Dây cao áp", "ECU"],
    suspension: ["Giam soc", "Cang", "Lot cop", "Rotin"],
    lighting: ["Den pha", "Den cos", "Den xi nhan", "Den LED"],
    engine: ["Piston", "Xi lanh", "Cam ket", "Turboc"],
    transmission: ["Hop so", "Nhot hop so", "Ly hop", "Cau truyen dong"],
    exhaust: ["Ong xa", "Bo giam thanh", "Dau thu", "Cam bien O2"],
    cooling: ["Ke t", "Nuoc lam nhiet", "Quat nhiet", "Bang nhiet"],
    default: ["Phu tung dong co", "Phu tung he thong phanh", "Phu tung den", "Phu tung loc"]
  };
  
  return relatedMap[profile] || relatedMap.default;
}

export {
  detectCategoryProfile,
  generateCategoryFAQ,
  generateBuyingGuide,
  generateTechnicalInfo,
  generateMaintenanceTips
};
