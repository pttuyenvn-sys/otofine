import { hasListingVehicleOrSpecFilters } from "@/lib/seo/homePageTitle";

/**
 * @param {Record<string, string> | null | undefined} filters
 */
function filterTailParts(filters) {
  const f = filters || {};
  const parts = [];
  const add = (label, key) => {
    const v = f[key];
    if (v == null || String(v).trim() === "") return;
    parts.push(`${label}: ${String(v).trim()}`);
  };
  if (f.brand) parts.push(`Hãng ${String(f.brand).trim()}`);
  if (f.model) parts.push(`Dòng ${String(f.model).trim()}`);
  if (f.year != null && String(f.year).trim() !== "") {
    parts.push(`Đời ${String(f.year).trim()}`);
  }
  add("Động cơ", "engine");
  add("Dung tích/Tiêu chuẩn", "displacement");
  add("Hộp số", "transmission");
  add("Hệ dẫn động", "drivetrain");
  add("Kiểu thân xe", "bodyType");
  return parts;
}

/**
 * @param {string} input
 */
function slugifyVi(input) {
  if (input == null) return "";
  return String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/**
 * @param {string} label
 * @returns {string}
 */
function hrefFromLabel(label) {
  const seg = slugifyVi(label);
  return seg ? `/${seg}` : "/";
}

/**
 * @param {{
 *   h1?: string,
 *   selectedCategory?: string,
 *   filters?: Record<string, string>,
 *   productCount?: number,
 * }} opts
 */
export function buildHomeSeoArticle({
  h1,
  selectedCategory,
  filters,
  productCount = 0,
}) {
  const cat = String(selectedCategory ?? "").trim();
  const hasVehicle = hasListingVehicleOrSpecFilters(filters);
  const hasCat = Boolean(cat);
  const tail = filterTailParts(filters);
  const brand = filters?.brand != null ? String(filters.brand).trim() : "";
  const model = filters?.model != null ? String(filters.model).trim() : "";
  const year = filters?.year != null ? String(filters.year).trim() : "";
  const vehicleLabel = [brand, model, year].filter(Boolean).join(" ");
  const countLine =
    productCount > 0
      ? ` Hiện có khoảng ${productCount} sản phẩm liên quan trong danh sách để bạn so sánh nhanh.`
      : "";

  const fallbackTopic =
    typeof h1 === "string" && h1.trim() ? h1.trim() : "Phụ tùng ô tô";

  const scenario = hasCat ? (hasVehicle ? "category_vehicle" : "category_only") : hasVehicle ? "vehicle_only" : "generic";

  /** @type {{ title: string, intro: string, sections: { heading: string, content: string }[] }} */
  let content;

  if (scenario === "category_only") {
    content = {
      title: `${cat} ô tô: cách chọn đúng loại, đúng xe, đúng giá`,
      intro: `${cat} là nhóm phụ tùng quan trọng ảnh hưởng trực tiếp đến vận hành và độ an toàn khi sử dụng xe. Hướng dẫn dưới đây giúp bạn hiểu rõ công dụng, thời điểm thay và cách chọn đúng mã trước khi đặt mua.${countLine}`,
      sections: [
        {
          heading: `${cat} là gì và vai trò trên xe`,
          content: `${cat} là nhóm chi tiết tham gia trực tiếp vào quá trình vận hành, nên nếu chọn sai thông số có thể gây giảm hiệu suất hoặc phát sinh lỗi liên quan. Khi xem sản phẩm, ưu tiên đối chiếu mô tả kỹ thuật, mã phụ tùng và đời xe áp dụng.`,
        },
        {
          heading: `Khi nào nên thay ${cat.toLowerCase()}`,
          content: `Dấu hiệu thường gặp gồm hao mòn bất thường, tiếng ồn, rung, báo lỗi hoặc cảm giác vận hành kém ổn định. Nếu xe đã tới mốc bảo dưỡng định kỳ, nên kiểm tra sớm để tránh thay đồng thời nhiều hạng mục tốn chi phí hơn.`,
        },
        {
          heading: `Cách chọn ${cat.toLowerCase()} đúng xe`,
          content: `Luôn xác nhận tối thiểu 3 thông tin: hãng xe, dòng xe, năm sản xuất. Nếu có mã cũ trên phụ tùng đã tháo, hãy gửi mã đó cho cửa hàng để đối chiếu chéo trước khi chốt đơn.`,
        },
        {
          heading: `Giá ${cat.toLowerCase()} tham khảo`,
          content: `Giá thường khác nhau theo thương hiệu, vật liệu và tiêu chuẩn sản xuất (OEM hoặc aftermarket). Bạn nên so sánh theo cùng thông số và chính sách bảo hành thay vì chỉ chọn mức giá thấp nhất.`,
        },
        {
          heading: `Mua ${cat.toLowerCase()} ở đâu uy tín`,
          content: `Ưu tiên gian hàng có mô tả rõ, hình ảnh thật, thông tin tương thích minh bạch và hỗ trợ tư vấn trước khi mua. Trước khi thanh toán, nên xác nhận lại điều kiện đổi trả nếu sản phẩm không khớp thực tế lắp đặt.`,
        },
      ],
    };
  } else if (scenario === "vehicle_only") {
    content = {
      title: `Phụ tùng ${vehicleLabel}: hướng dẫn tìm đúng đời xe và tối ưu chi phí`,
      intro: `Trang này tập trung cho nhu cầu tìm phụ tùng theo xe ${vehicleLabel}. Bạn có thể lọc nhanh các hạng mục cần thay, so sánh thương hiệu và chốt đúng mã phù hợp với cấu hình xe thực tế.${countLine}`,
      sections: [
        {
          heading: `Tổng quan nhu cầu phụ tùng ${vehicleLabel}`,
          content: `Với các dòng xe phổ biến như ${vehicleLabel}, nhu cầu thay thế thường tập trung vào nhóm bảo dưỡng định kỳ và nhóm hao mòn theo quãng đường sử dụng. Việc tìm đúng đời xe giúp giảm rủi ro mua nhầm ngay từ bước đầu.`,
        },
        {
          heading: "Những phụ tùng thường phải thay",
          content: "Các hạng mục thường xuyên gồm lọc, phanh, bugi, hệ thống treo và một số chi tiết cao su lão hóa theo thời gian. Nên ưu tiên thay theo triệu chứng kết hợp mốc bảo dưỡng để tránh phát sinh lỗi dây chuyền.",
        },
        {
          heading: "Cách tìm đúng đời xe, đúng phiên bản",
          content: "Ngoài năm sản xuất, một số xe còn khác thông số theo phiên bản động cơ/hộp số. Khi có thể, hãy cung cấp thêm số VIN hoặc mã phụ tùng cũ để cửa hàng xác nhận chính xác trước khi giao hàng.",
        },
        {
          heading: "So sánh OEM và aftermarket",
          content: "OEM phù hợp khi ưu tiên độ đồng bộ và thông số sát cấu hình gốc. Aftermarket phù hợp khi cần tối ưu chi phí hoặc có nhu cầu nâng cấp, nhưng nên chọn thương hiệu rõ nguồn gốc và có bảo hành.",
        },
      ],
    };
  } else if (scenario === "category_vehicle") {
    content = {
      title: `${cat} ${vehicleLabel}: chọn đúng mã, báo giá nhanh, thay an toàn`,
      intro: `Bạn đang xem nhóm ${cat.toLowerCase()} dành cho ${vehicleLabel}. Đây là cách lọc hiệu quả để chọn đúng sản phẩm theo đời xe, rút ngắn thời gian hỏi giá và tránh đặt nhầm loại không tương thích.${countLine}`,
      sections: [
        {
          heading: `${cat} phù hợp cho ${vehicleLabel}`,
          content: `Mỗi đời xe có thể dùng mã ${cat.toLowerCase()} khác nhau về kích thước hoặc tiêu chuẩn kỹ thuật. Trước khi chốt đơn, cần đối chiếu lại mã phụ tùng, năm xe và phiên bản động cơ nếu có.`,
        },
        {
          heading: `Dấu hiệu ${cat.toLowerCase()} xuống cấp`,
          content: `Các dấu hiệu thường gặp gồm vận hành thiếu ổn định, tăng tiêu hao, tiếng ồn bất thường hoặc báo lỗi liên quan. Khi xuất hiện triệu chứng lặp lại, nên kiểm tra sớm để tránh ảnh hưởng các cụm liên quan.`,
        },
        {
          heading: `Giá ${cat.toLowerCase()} cho ${vehicleLabel}`,
          content: `Giá phụ thuộc vào thương hiệu, xuất xứ, chuẩn kỹ thuật và chế độ bảo hành. Để so sánh công bằng, hãy đặt các sản phẩm cùng tiêu chuẩn vào một nhóm rồi đánh giá tổng thể chi phí và độ bền dự kiến.`,
        },
        {
          heading: `Lưu ý khi thay ${cat.toLowerCase()}`,
          content: `Nên kiểm tra đồng thời các chi tiết đi kèm để đảm bảo hiệu quả sau thay thế. Nếu không tự lắp, hãy chọn nơi có kỹ thuật hỗ trợ và xác nhận rõ chính sách xử lý khi phát sinh sai khác thực tế.`,
        },
      ],
    };
  } else {
    content = {
      title: `${fallbackTopic}: kinh nghiệm tìm phụ tùng đúng xe`,
      intro: `Danh sách phụ tùng được cập nhật theo bộ lọc hiện tại để bạn tìm nhanh sản phẩm phù hợp. Ưu tiên đối chiếu mã phụ tùng, đời xe và chính sách bảo hành trước khi đặt mua.${countLine}`,
      sections: [
        {
          heading: "Bắt đầu từ thông tin xe chính xác",
          content: "Chỉ cần sai một thông tin nhỏ về dòng xe hoặc năm sản xuất là có thể chọn nhầm phụ tùng. Nên cố định bộ lọc xe trước khi so sánh giá.",
        },
        {
          heading: "So sánh theo cùng tiêu chuẩn kỹ thuật",
          content: "Đừng chỉ nhìn vào giá bán. Hãy đối chiếu thông số, thương hiệu, xuất xứ và bảo hành để đánh giá đúng giá trị sử dụng.",
        },
        {
          heading: "Xác nhận lại trước khi chốt đơn",
          content: "Trước khi thanh toán, gửi mã cũ hoặc ảnh phụ tùng thực tế cho cửa hàng để xác nhận lần cuối. Bước này giúp giảm đáng kể rủi ro đổi trả.",
        },
      ],
    };
  }

  const brandModel = [brand, model].filter(Boolean).join(" ");

  /** @type {{ label: string, href: string }[]} */
  let relatedLinkSeeds = [];
  if (hasCat && hasVehicle) {
    relatedLinkSeeds = [
      brandModel ? `Phụ tùng ${brandModel}` : "Phụ tùng ô tô",
      brand ? `${cat} ${brand}` : `${cat} ô tô`,
      brand ? `Phụ tùng ${brand}` : "Phụ tùng ô tô",
    ];
  } else if (hasCat) {
    relatedLinkSeeds = [
      "Phụ tùng ô tô",
      `${cat} Toyota`,
      `${cat} Mazda`,
    ];
  } else if (hasVehicle) {
    relatedLinkSeeds = [
      brand ? `Phụ tùng ${brand}` : "Phụ tùng ô tô",
      brandModel ? `Phụ tùng ${brandModel}` : brand ? `Phụ tùng ${brand}` : "",
    ];
  } else {
    relatedLinkSeeds = [
      "Phụ tùng Toyota",
      "Phụ tùng Mazda",
      "Má phanh ô tô",
    ];
  }

  const seen = new Set();
  const relatedLinks = relatedLinkSeeds
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => {
      const key = x.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((label) => ({
      label,
      href: hrefFromLabel(label),
    }));

  return {
    title: content.title,
    intro: content.intro,
    sections: content.sections.slice(0, 5),
    relatedLinks,
  };
}
