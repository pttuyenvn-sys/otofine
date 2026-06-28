import { getCanonicalProductPath } from "../modules/products/services/canonicalPath.server.js";

function safe(v) {
  return String(v || "").trim();
}

function resolveProductHref(product) {
  const fromApi = String(product?.canonicalPath ?? "").trim();
  if (fromApi.startsWith("/") && fromApi !== "/") {
    return fromApi;
  }

  const path = getCanonicalProductPath(product);
  if (path && path.startsWith("/") && path !== "/") {
    return path;
  }

  const id = product?.id;
  return id != null && id !== "" ? `/p/${id}` : "/";
}

function money(v) {
  const n = Number(v || 0);

  if (!n) return null;

  return n.toLocaleString("vi-VN");
}

export function buildVehicleSeoArticle(data) {
  const parsed = data?.parsed || {};

  const products = data?.products || [];
  const productStats = data?.productStats || {};

  const totalProducts = Number(productStats.total_products || 0);

  const faults = data?.faults || [];

  const maintenance = data?.maintenance || [];

  const relatedCars = data?.relatedCars || [];

  const seoContent = data?.seoContent || {};

  const carContent = data?.carContent || {};

  const seoName = [
    "phụ tùng",
    parsed.brand,
    parsed.model,
    parsed.year,
    parsed.locationName ? `tại ${parsed.locationName}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const topProducts = products
    .slice(0, 12)
    .map((p) => {
      const href = resolveProductHref(p);

      return `
      <li class="vehicle-seo-part-item">

        <a
          href="${href}"
          class="vehicle-seo-part-link"
        >

          <div class="vehicle-seo-part-name">
            ${safe(p.partName)}
          </div>

          <div class="vehicle-seo-part-price">
            ${p.price ? `Giá tham khảo: ${money(p.price)}đ` : "Liên hệ"}
          </div>

        </a>

      </li>
    `;
    })
    .join("");

  const sortedProducts = [...products]

    .filter((p) => Number(p.price || 0) > 0)

    .sort((a, b) => {
      return Number(a.price || 0) - Number(b.price || 0);
    });

  const mixedProducts = [];

  let left = 0;
  let right = sortedProducts.length - 1;

  while (left <= right && mixedProducts.length < 10) {
    if (right >= left) {
      mixedProducts.push(sortedProducts[right]);
      right--;
    }

    if (left <= right && mixedProducts.length < 10) {
      mixedProducts.push(sortedProducts[left]);
      left++;
    }
  }

  const priceTableHtml = mixedProducts
    .map((p) => {
      return `
        <tr>

          <td>
            <a
              href="${resolveProductHref(p)}"
            >
              ${safe(p.partName)}
            </a>
          </td>

          <td>
            ${money(p.price)}đ
          </td>

        </tr>
      `;
    })
    .join("");

  const maintenanceHtml = maintenance
    .slice(0, 10)
    .map((m) => {
      return `
          <tr>
            <td>${safe(m.item_name)}</td>

            <td>${safe(m.every_km)} km</td>

            <td>${safe(m.every_month)} tháng</td>
          </tr>
        `;
    })
    .join("");

  const faultsHtml = faults
    .slice(0, 5)
    .map((f) => {
      return `
      <div class="vehicle-fault-item">

        <h3>
          ${safe(f.title)}
        </h3>

        <p>
          <strong>Triệu chứng:</strong>
          ${safe(f.symptom)}
        </p>

        <p>
          <strong>Nguyên nhân thường gặp trên ${safe(parsed.brand)} ${safe(parsed.model)}:</strong>
          ${safe(f.cause_text)}
        </p>

      </div>
    `;
    })
    .join("");

  const vehicleCharacterHtml = carContent?.vehicle_character
    ? `
<section>

  <h2>
    Đặc điểm
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    ${safe(carContent.vehicle_character)}
  </p>

</section>
`
    : "";

  const commonUsageHtml = carContent?.common_usage
    ? `
<section>

  <h2>
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
    thường được sử dụng như thế nào?
  </h2>

  <p>
    ${safe(carContent.common_usage)}
  </p>

</section>
`
    : "";

  const maintenanceNoteHtml = carContent?.maintenance_note
    ? `
<section>

  <h2>
    Kinh nghiệm bảo dưỡng
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    ${safe(carContent.maintenance_note)}
  </p>

</section>
`
    : "";

  const buyingExperienceHtml = carContent?.buying_experience
    ? `
<section>

  <h2>
    Kinh nghiệm chọn phụ tùng
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    ${safe(carContent.buying_experience)}
  </p>

</section>
`
    : "";

  const relatedHtml = relatedCars

    .sort((a, b) => {
      return (
        Number(b.shared_product_count || 0) -
        Number(a.shared_product_count || 0)
      );
    })

    .slice(0, 6)

    .map((c) => {
      return `
            <li>

              <a href="/phu-tung-${c.slug}">
                Phụ tùng
                ${safe(c.hang_xe)}
                ${safe(c.ten_xe || "")}
              </a>

            </li>
          `;
    })
    .join("");

  const drivingCharacterHtml = carContent?.driving_character
    ? `
<section>

  <h2>
    Đặc điểm vận hành
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    ${safe(carContent.driving_character)}
  </p>

</section>
`
    : "";

  const fuelUsageHtml = carContent?.fuel_usage_note
    ? `
<section>

  <h2>
    Khả năng tiêu hao nhiên liệu
  </h2>

  <p>
    ${safe(carContent.fuel_usage_note)}
  </p>

</section>
`
    : "";

  const maintenanceCostHtml = carContent?.maintenance_cost_level
    ? `
<section>

  <h2>
    Chi phí bảo dưỡng
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    Mức chi phí bảo dưỡng:
    <strong>
      ${safe(carContent.maintenance_cost_level)}
    </strong>
  </p>

</section>
`
    : "";

  const faultPatternsHtml = carContent?.common_fault_patterns
    ? `
<section>

  <h2>
    Các lỗi phổ biến theo thời gian sử dụng
  </h2>

  <p>
    ${safe(carContent.common_fault_patterns)}
  </p>

</section>
`
    : "";

  const recommendedBrandsHtml = carContent?.recommended_brands
    ? `
<section>

  <h2>
    Các thương hiệu phụ tùng phù hợp
  </h2>

  <p>
    ${safe(carContent.recommended_brands)}
  </p>

</section>
`
    : "";

  const resaleValueHtml = carContent?.resale_value_note
    ? `
<section>

  <h2>
    Khả năng giữ giá
  </h2>

  <p>
    ${safe(carContent.resale_value_note)}
  </p>

</section>
`
    : "";

  const introTextHtml = carContent?.intro_text
    ? `
<section>

  <h2>
    Tổng quan về
    ${safe(parsed.brand)}
    ${safe(parsed.model)}
  </h2>

  <p>
    ${safe(carContent.intro_text)}
  </p>

</section>
`
    : "";

  return `
   ${introTextHtml}
  ${vehicleCharacterHtml}
    <section class="vehicle-seo-intro">

       ${
         seoContent.custom_intro ||
         `
          <p>
            Hiện có khoảng
            <strong>${totalProducts}</strong>
            phụ tùng phù hợp
            ${safe(parsed.brand)}
            ${safe(parsed.model)}
            ${safe(parsed.year)}
            ${parsed.locationName ? `tại ${safe(parsed.locationName)}` : ""}
            thuộc các nhóm động cơ, gầm, điện,
            điều hòa và bảo dưỡng định kỳ.
          </p>

          <p>
            Người dùng có thể tìm kiếm theo đúng đời xe,
            nhóm phụ tùng và mức giá để dễ dàng lựa chọn
            sản phẩm phù hợp.
          </p>
        `
       }

    </section>

     ${commonUsageHtml}
    <section>
           <h2>
        Các phụ tùng
        ${safe(parsed.brand)}
        ${safe(parsed.model)}
        ${safe(parsed.year)}
        được tìm kiếm nhiều
      </h2>

      <p class="vehicle-seo-count">
        Hiện có khoảng
        <strong>${totalProducts}</strong>
        sản phẩm phù hợp với
        ${safe(parsed.brand)}
        ${safe(parsed.model)}
        ${safe(parsed.year)}.
      </p>

      <ul class="vehicle-seo-part-list">
        ${topProducts}
      </ul>

    </section>

          ${maintenanceNoteHtml}
     <section>
      <h2>
        Chu kỳ bảo dưỡng
        ${safe(parsed.brand)}
        ${safe(parsed.model)}
      </h2>

      <p>
        Chu kỳ bảo dưỡng dưới đây chỉ mang tính tham khảo
        và có thể thay đổi theo điều kiện vận hành thực tế.
      </p>

      <table class="vehicle-maintenance-table">

        <thead>
          <tr>
            <th>Hạng mục</th>
            <th>Km</th>
            <th>Thời gian</th>
          </tr>
        </thead>

        <tbody>
          ${maintenanceHtml}
        </tbody>

      </table>

    </section>


    ${drivingCharacterHtml}

    ${fuelUsageHtml}

    ${maintenanceCostHtml}

    ${faultPatternsHtml}
    <section>

    <h2>
      Các lỗi thường gặp trên
      ${safe(parsed.brand)}
      ${safe(parsed.model)}
      ${safe(parsed.year)}
    </h2>

    <p>
      Dưới đây là một số lỗi và triệu chứng thường gặp
      trong quá trình sử dụng xe.
    </p>

      ${faultsHtml}

    </section>

    <section>

      <h2>
        Cửa hàng bán phụ tùng
        ${safe(parsed.brand)}
        ${safe(parsed.model)}
        ${parsed.locationName ? `tại ${safe(parsed.locationName)}` : ""}
      </h2>

      <p>
        Dưới đây là một số cửa hàng đang có
        phụ tùng phù hợp với
        ${safe(parsed.brand)}
        ${safe(parsed.model)}.
      </p>

    </section>

    <section>

    <h2>
        Giá phụ tùng ${safe(parsed.brand)}
        ${safe(parsed.model)} tham khảo
    </h2>

    <table class="vehicle-price-table">

        <thead>
        <tr>
            <th>Phụ tùng</th>
            <th>Giá tham khảo</th>
        </tr>
        </thead>

        <tbody>
        ${priceTableHtml}
        </tbody>

    </table>

    </section>

        ${buyingExperienceHtml}
    ${recommendedBrandsHtml}
    ${resaleValueHtml}
    <section>
    <h2>
        Lưu ý khi chọn phụ tùng
        ${safe(parsed.brand)}
        ${safe(parsed.model)}
    </h2>

    <ul>
        <li>
          Ưu tiên đúng đời xe và phiên bản sử dụng.
        </li>

        <li>
          So sánh hình ảnh và mã phụ tùng trước khi đặt hàng.
        </li>

        <li>
          Kiểm tra chính sách bảo hành và đổi trả.
        </li>

        <li>
          Nên đối chiếu phụ tùng cũ khi thay thế.
        </li>
    </ul>

    </section>

    <section>

      <h2>
        Tìm thêm phụ tùng theo dòng xe
      </h2>

      <p>
        Người dùng có thể tham khảo thêm
        các dòng xe ${safe(parsed.brand)} phổ biến khác
        để so sánh phụ tùng và khả năng tương thích.
      </p>

      <ul class="vehicle-related-grid">
        ${relatedHtml}
      </ul>

    </section>

    <section>

    <h2>
        Tìm kiếm thêm phụ tùng xe
        ${safe(parsed.brand)}
    </h2>

    <ul class="vehicle-related-grid">
        ${relatedCars

          .filter((c) => {
            return (
              String(c.hang_xe || "").toLowerCase() ===
              String(parsed.brand || "").toLowerCase()
            );
          })

          .sort((a, b) => {
            return Number(b.product_count || 0) - Number(a.product_count || 0);
          })

          .slice(0, 8)

          .map((c) => {
            return `
              <li>
                <a href="/phu-tung-${c.slug}">
                  Phụ tùng
                  ${safe(c.hang_xe)}
                  ${safe(c.ten_xe || "")}
                </a>
              </li>
            `;
          })

          .join("")}
    </ul>

    </section>

    ${seoContent.custom_body || ""}
  `;
}
